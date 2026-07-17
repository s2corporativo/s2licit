import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { and, eq, isNull, like, or, sql } from "drizzle-orm";
import { categories, products } from "../../drizzle/schema";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";

export const reclassificacaoRouter = router({
    // Conta quantos produtos serão afetados pelos filtros
    preview: protectedProcedure
      .input(z.object({
        categoryId: z.number().nullable().optional(),
        supplierId: z.number().nullable().optional(),
        semCampo: z.enum(["activeIngredient", "pharmaceuticalForm", "category", "none"]).default("none"),
        busca: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { total: 0, samples: [] };

        const conditions: any[] = [eq(products.isActive, "yes")];
        if (input.categoryId) conditions.push(eq(products.categoryId, input.categoryId));
        if (input.supplierId) conditions.push(eq(products.supplierId, input.supplierId));
        if (input.semCampo === "activeIngredient") conditions.push(or(isNull(products.activeIngredient), eq(products.activeIngredient, ""), eq(products.activeIngredient, "-")));
        if (input.semCampo === "pharmaceuticalForm") conditions.push(or(isNull(products.pharmaceuticalForm), eq(products.pharmaceuticalForm, "")));
        if (input.semCampo === "category") conditions.push(isNull(products.categoryId));
        if (input.busca && input.busca.trim()) conditions.push(like(products.name, `%${input.busca.trim()}%`));
        const [countRow] = await (db as any).execute(sql`
          SELECT COUNT(*) as total FROM products
          WHERE ${and(...conditions)}
        `);
        const total = Number((countRow as any[])[0]?.total ?? 0);

        const sampleRows = await db
          .select({ id: products.id, name: products.name, activeIngredient: products.activeIngredient, pharmaceuticalForm: products.pharmaceuticalForm })
          .from(products)
          .where(and(...conditions))
          .limit(10);

        return { total, samples: sampleRows };
      }),

    // Processa um lote de produtos via IA e atualiza o campo solicitado
    runBatch: protectedProcedure
      .input(z.object({
        categoryId: z.number().nullable().optional(),
        supplierId: z.number().nullable().optional(),
        semCampo: z.enum(["activeIngredient", "pharmaceuticalForm", "category", "none"]).default("none"),
        busca: z.string().optional(),
        campoAlvo: z.enum(["categoryId", "activeIngredient", "pharmaceuticalForm"]),
        offset: z.number().default(0),
        batchSize: z.number().min(10).max(200).default(150),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { updated: 0, errors: 0, nextOffset: input.offset };

        const conditions: any[] = [eq(products.isActive, "yes")];
        if (input.categoryId) conditions.push(eq(products.categoryId, input.categoryId));
        if (input.supplierId) conditions.push(eq(products.supplierId, input.supplierId));
         if (input.semCampo === "activeIngredient") conditions.push(or(isNull(products.activeIngredient), eq(products.activeIngredient, ""), eq(products.activeIngredient, "-")));
        if (input.semCampo === "pharmaceuticalForm") conditions.push(or(isNull(products.pharmaceuticalForm), eq(products.pharmaceuticalForm, "")));
        if (input.semCampo === "category") conditions.push(isNull(products.categoryId));
        if (input.busca && input.busca.trim()) conditions.push(like(products.name, `%${input.busca.trim()}%`));
        const batch = await db
          .select({ id: products.id, name: products.name, activeIngredient: products.activeIngredient, pharmaceuticalForm: products.pharmaceuticalForm, categoryId: products.categoryId })
          .from(products)
          .where(and(...conditions))
          .limit(input.batchSize)
          .offset(input.offset);

        if (batch.length === 0) return { updated: 0, errors: 0, nextOffset: input.offset, done: true };

        // Buscar categorias disponíveis para o prompt
        const allCats = await db.select({ id: categories.id, name: categories.name, parentId: categories.parentId }).from(categories);
        const catList = allCats.map(c => `${c.id}: ${c.name}`).join(", ");

        // Montar prompt conforme campo-alvo
        let systemPrompt = "";
        let userPrompt = "";
        let schemaProps: any = {};
        let schemaRequired: string[] = [];

        if (input.campoAlvo === "categoryId") {
          systemPrompt = `Você é um especialista em classificação de produtos veterinários e agrícolas. Para cada produto, escolha o categoryId mais adequado da lista: ${catList}. Responda APENAS com JSON válido.`;
          userPrompt = `Classifique cada produto abaixo com o categoryId correto:\n${batch.map(p => `ID ${p.id}: ${p.name}${p.activeIngredient ? " | " + p.activeIngredient : ""}`).join("\n")}`;
          schemaProps = { classificacoes: { type: "array", items: { type: "object", properties: { id: { type: "number" }, categoryId: { type: "number" } }, required: ["id", "categoryId"], additionalProperties: false } } };
          schemaRequired = ["classificacoes"];
        } else if (input.campoAlvo === "activeIngredient") {
          systemPrompt = "Você é um farmacologista especializado em produtos veterinários. Para cada produto, identifique o princípio ativo (substancia ativa) principal. Se não souber, use \"Não identificado\". Responda APENAS com JSON válido.";
          userPrompt = `Identifique o princípio ativo de cada produto:\n${batch.map(p => `ID ${p.id}: ${p.name}`).join("\n")}`;
          schemaProps = { classificacoes: { type: "array", items: { type: "object", properties: { id: { type: "number" }, activeIngredient: { type: "string" } }, required: ["id", "activeIngredient"], additionalProperties: false } } };
          schemaRequired = ["classificacoes"];
        } else if (input.campoAlvo === "pharmaceuticalForm") {
          systemPrompt = "Você é um farmacêutico especializado. Para cada produto, identifique a forma farmacêutica (ex: Comprimido, Frasco, Injetável, Pó, Gel, Pomada, Spray, Solução, Suspensão, etc). Se não souber, use \"Não identificado\". Responda APENAS com JSON válido.";
          userPrompt = `Identifique a forma farmacêutica de cada produto:\n${batch.map(p => `ID ${p.id}: ${p.name}${p.activeIngredient ? " | " + p.activeIngredient : ""}`).join("\n")}`;
          schemaProps = { classificacoes: { type: "array", items: { type: "object", properties: { id: { type: "number" }, pharmaceuticalForm: { type: "string" } }, required: ["id", "pharmaceuticalForm"], additionalProperties: false } } };
          schemaRequired = ["classificacoes"];
        }

        let updated = 0;
        let errors = 0;

        try {
          const llmResult = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "batch_classification",
                strict: true,
                schema: {
                  type: "object",
                  properties: schemaProps,
                  required: schemaRequired,
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = llmResult.choices?.[0]?.message?.content;
          const content = typeof rawContent === "string" ? rawContent : null;
          if (!content) throw new Error("IA sem resposta");

          const parsed = JSON.parse(content) as { classificacoes: Array<{ id: number; categoryId?: number; activeIngredient?: string; pharmaceuticalForm?: string }> };
          const classificacoes = Array.isArray(parsed.classificacoes) ? parsed.classificacoes : [];

          for (const c of classificacoes) {
            try {
              const updateData: any = {};
              if (input.campoAlvo === "categoryId" && c.categoryId) updateData.categoryId = c.categoryId;
              if (input.campoAlvo === "activeIngredient" && c.activeIngredient) updateData.activeIngredient = c.activeIngredient;
              if (input.campoAlvo === "pharmaceuticalForm" && c.pharmaceuticalForm) updateData.pharmaceuticalForm = c.pharmaceuticalForm;
              if (Object.keys(updateData).length > 0) {
                await db.update(products).set(updateData).where(eq(products.id, c.id));
                updated++;
              }
            } catch {
              errors++;
            }
          }
        } catch {
          errors += batch.length;
        }

        return {
          updated,
          errors,
          processed: batch.length,
          nextOffset: input.offset + batch.length,
          done: batch.length < input.batchSize,
        };
      }),

    // ─── Migração V2: preencher fichaTecnica, subcategoria e codigoFornecedor via IA ───
    migrateV2Fields: protectedProcedure
      .input(z.object({
        batchSize: z.number().min(5).max(50).default(20),
        offset: z.number().min(0).default(0),
        campos: z.array(z.enum(["subcategoria", "fichaTecnica", "codigoFornecedor"])).default(["subcategoria"]),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("../_core/llm");
        const db = await getDb();
        if (!db) return { updated: 0, errors: 0, processed: 0, nextOffset: input.offset, done: true };
        const { batchSize, offset, campos } = input;

        // Buscar categorias para contexto
        const cats = await db
          .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
          .from(categories)
          .orderBy(categories.parentId, categories.sortOrder);
        const catList = cats.map((c) => {
          const parent = cats.find((p) => p.id === c.parentId);
          return parent ? `${c.id}: ${parent.name} > ${c.name}` : `${c.id}: ${c.name}`;
        }).join("\n");

        // Buscar produtos sem subcategoria (ou outros campos conforme solicitado)
        const conditions: any[] = [eq(products.isActive, "yes")];
        if (campos.includes("subcategoria")) {
          conditions.push(or(isNull(products.subcategoria), eq(products.subcategoria, "")));
        }

        const batch = await db
          .select({
            id: products.id,
            name: products.name,
            activeIngredient: products.activeIngredient,
            manufacturer: products.manufacturer,
            presentation: products.presentation,
            concentration: products.concentration,
            categoryId: products.categoryId,
            subcategoria: products.subcategoria,
            fichaTecnica: products.fichaTecnica,
            codigoFornecedor: products.codigoFornecedor,
          })
          .from(products)
          .where(and(...conditions))
          .limit(batchSize)
          .offset(offset);

        if (batch.length === 0) return { updated: 0, errors: 0, processed: 0, nextOffset: offset, done: true };

        const prodList = batch.map((p) => {
          const cat = cats.find((c) => c.id === p.categoryId);
          const catName = cat ? (cats.find((c) => c.id === cat.parentId)?.name ?? cat.name) : "";
          const parts = [
            p.activeIngredient && `PA: ${p.activeIngredient}`,
            p.manufacturer && `Fab: ${p.manufacturer}`,
            p.presentation && `Apres: ${p.presentation}`,
            p.concentration && `Conc: ${p.concentration}`,
            catName && `Cat: ${catName}`,
          ].filter(Boolean).join(", ");
          return `${p.id}: ${p.name}${parts ? ` (${parts})` : ""}`;
        }).join("\n");

        const camposInstructions = [];
        if (campos.includes("subcategoria")) camposInstructions.push(`"subcategoria": string (ex: Antiparasitários, Antibióticos, Vacinas, Anestésicos, Anti-inflamatórios, Suplementos, Rações, Inseticidas, Fungicidas, Herbicidas, Fertilizantes, etc.)`);
        if (campos.includes("fichaTecnica")) camposInstructions.push(`"fichaTecnica": string (resumo técnico: indicação, mecanismo de ação, espécies-alvo — máx 200 chars)`);
        if (campos.includes("codigoFornecedor")) camposInstructions.push(`"codigoFornecedor": null (deixe null — não é possível inferir sem dados do fornecedor)`);

        let updated = 0;
        let errors = 0;

        try {
          const llmResult = await invokeLLM({
            messages: [
              { role: "system" as const, content: "Você é especialista em produtos veterinários, agropecuários e farmacêuticos. Analise cada produto e preencha os campos solicitados com precisão técnica. Responda APENAS com JSON válido." },
              { role: "user" as const, content: `CATEGORIAS DO SISTEMA:\n${catList}\n\nPRODUTOS:\n${prodList}\n\nPara cada produto, retorne um objeto com:\n- id: number\n${camposInstructions.join("\n")}\n\nRetorne { "resultados": [...] }` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "migrate_v2_fields",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    resultados: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "number" },
                          subcategoria: { type: ["string", "null"] },
                          fichaTecnica: { type: ["string", "null"] },
                          codigoFornecedor: { type: ["string", "null"] },
                        },
                        required: ["id", "subcategoria", "fichaTecnica", "codigoFornecedor"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["resultados"],
                  additionalProperties: false,
                },
              },
            },
          });

          const rawContent = llmResult.choices?.[0]?.message?.content;
          const content = typeof rawContent === "string" ? rawContent : null;
          if (!content) throw new Error("IA sem resposta");
          const parsed = JSON.parse(content) as { resultados: Array<{ id: number; subcategoria?: string | null; fichaTecnica?: string | null; codigoFornecedor?: string | null }> };
          const resultados = Array.isArray(parsed.resultados) ? parsed.resultados : [];

          for (const r of resultados) {
            try {
              const updateData: any = { updatedAt: new Date() };
              if (campos.includes("subcategoria") && r.subcategoria) updateData.subcategoria = r.subcategoria;
              if (campos.includes("fichaTecnica") && r.fichaTecnica) updateData.fichaTecnica = r.fichaTecnica;
              if (Object.keys(updateData).length > 1) {
                await db.update(products).set(updateData).where(eq(products.id, r.id));
                updated++;
              }
            } catch {
              errors++;
            }
          }
        } catch {
          errors += batch.length;
        }

        return {
          updated,
          errors,
          processed: batch.length,
          nextOffset: offset + batch.length,
          done: batch.length < batchSize,
        };
      }),
  });
