import { invokeLLM } from "../_core/llm";


import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getDb,
} from "../db";
import {
  products, categories,
} from "../../drizzle/schema";
import { inArray, isNull, or, sql, eq, asc, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";

export const enrichmentRouter = router({  // INSIDE appRouter
  // Suggest product fields from name using LLM
  suggestFields: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      categoryName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");
      const systemMsg = "Você é um especialista em farmácia veterinária. Responda apenas com JSON válido.";
      const userMsg = `Produto: "${input.name}"${input.categoryName ? ` (categoria: ${input.categoryName})` : ""}. Sugira: activeIngredient, concentration, presentation, unit, manufacturer (ou null), description, confidence (0-1). JSON apenas.`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system" as const, content: systemMsg },
            { role: "user" as const, content: userMsg },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_enrichment",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  activeIngredient: { type: "string" },
                  concentration: { type: "string" },
                  presentation: { type: "string" },
                  unit: { type: "string" },
                  manufacturer: { type: ["string", "null"] },
                  description: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["activeIngredient", "concentration", "presentation", "unit", "manufacturer", "description", "confidence"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = result.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") return { error: "Sem resposta do modelo" };
        return JSON.parse(content);
      } catch (e: any) {
        return { error: e.message ?? "Erro ao chamar LLM" };
      }
    }),

  // Bulk enrich multiple products
  bulkSuggest: protectedProcedure
    .input(z.object({
      productIds: z.array(z.number()).min(1).max(20),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");
      const db = await getDb();
      if (!db) return { results: [] };
      const prods = await db
        .select({ id: products.id, name: products.name, activeIngredient: products.activeIngredient })
        .from(products)
        .where(inArray(products.id, input.productIds));

      const results: Array<{ id: number; name: string; suggestion: any }> = [];
      for (const p of prods) {
        try {
          const sysMsg = "Você é um especialista em farmácia veterinária. Responda apenas com JSON válido.";
          const usrMsg = `Produto: "${p.name}". Sugira: activeIngredient, concentration, presentation, unit, manufacturer (ou null), description, confidence (0-1). JSON apenas.`;
          const res = await invokeLLM({
            messages: [
              { role: "system" as const, content: sysMsg },
              { role: "user" as const, content: usrMsg },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "product_enrichment",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    activeIngredient: { type: "string" },
                    concentration: { type: "string" },
                    presentation: { type: "string" },
                    unit: { type: "string" },
                    manufacturer: { type: ["string", "null"] },
                    description: { type: "string" },
                    confidence: { type: "number" },
                  },
                  required: ["activeIngredient", "concentration", "presentation", "unit", "manufacturer", "description", "confidence"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = res.choices?.[0]?.message?.content;
          results.push({ id: p.id, name: p.name, suggestion: (content && typeof content === "string") ? JSON.parse(content) : null });
        } catch {
          results.push({ id: p.id, name: p.name, suggestion: null });
        }
      }
      return { results };
    }),

  // Preview: suggest categories for uncategorized products (no DB write)
  batchReclassifyPreview: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");
      const db = await getDb();
      if (!db) return { suggestions: [], total: 0 };

      // Count total uncategorized
      const [countRow] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(products)
        .where(isNull(products.categoryId));
      const total = Number(countRow?.total ?? 0);

      // Fetch batch
      const prods = await db
        .select({ id: products.id, name: products.name, activeIngredient: products.activeIngredient, manufacturer: products.manufacturer })
        .from(products)
        .where(isNull(products.categoryId))
        .limit(input.limit)
        .offset(input.offset);

      if (prods.length === 0) return { suggestions: [], total };

      // Fetch all categories for context
      const cats = await db
        .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
        .from(categories)
        .orderBy(categories.parentId, categories.sortOrder);

      // Build category list string for LLM
      const catList = cats.map((c) => {
        const parent = cats.find((p) => p.id === c.parentId);
        return parent ? `${c.id}: ${parent.name} > ${c.name}` : `${c.id}: ${c.name}`;
      }).join("\n");

      // Build product list for LLM (batch of up to 50)
      const prodList = prods.map((p) => {
        const extra = [p.activeIngredient, p.manufacturer].filter(Boolean).join(", ");
        return `${p.id}: ${p.name}${extra ? ` (${extra})` : ""}`;
      }).join("\n");

      const systemMsg = `Você é um especialista em classificação de produtos. Analise cada produto e atribua a categoria mais adequada da lista fornecida. Responda APENAS com JSON válido.`;
      const userMsg = `CATEGORIAS DISPONÍVEIS:\n${catList}\n\nPRODUTOS PARA CLASSIFICAR:\n${prodList}\n\nRetorne um array JSON com objetos {productId, categoryId, categoryName, confidence} para cada produto. confidence é 0-1.`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system" as const, content: systemMsg },
            { role: "user" as const, content: userMsg },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "batch_reclassify",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  classifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        productId: { type: "number" },
                        categoryId: { type: "number" },
                        categoryName: { type: "string" },
                        confidence: { type: "number" },
                      },
                      required: ["productId", "categoryId", "categoryName", "confidence"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["classifications"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = result.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") return { suggestions: [], total };
        const parsed = JSON.parse(content) as { classifications: Array<{ productId: number; categoryId: number; categoryName: string; confidence: number }> };
        // Merge product names into suggestions
        const suggestions = (parsed.classifications ?? []).map((c) => {
          const prod = prods.find((p) => p.id === c.productId);
          return { ...c, productName: prod?.name ?? "" };
        });
        return { suggestions, total };
      } catch (e: any) {
        return { suggestions: [], total, error: e.message ?? "Erro ao chamar LLM" };
      }
    }),

  // Auto-classify ALL uncategorized products in batches of 50 (server-side loop)
  batchReclassifyAll: protectedProcedure
    .input(z.object({ batchSize: z.number().min(10).max(100).default(50) }).optional())
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");
      const db = await getDb();
      if (!db) return { updated: 0, batches: 0, errors: 0 };
      const batchSize = input?.batchSize ?? 50;
      // Fetch all categories once
      const cats = await db
        .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
        .from(categories)
        .orderBy(categories.parentId, categories.sortOrder);
      const catList = cats.map((c) => {
        const parent = cats.find((p) => p.id === c.parentId);
        return parent ? `${c.id}: ${parent.name} > ${c.name}` : `${c.id}: ${c.name}`;
      }).join("\n");
      let updated = 0;
      let batches = 0;
      let errors = 0;
      let offset = 0;
      // Process in batches until no more uncategorized products
      while (true) {
        const prods = await db
          .select({ id: products.id, name: products.name, activeIngredient: products.activeIngredient, manufacturer: products.manufacturer })
          .from(products)
          .where(isNull(products.categoryId))
          .limit(batchSize)
          .offset(0); // always offset 0 since we update as we go
        if (prods.length === 0) break;
        const prodList = prods.map((p) => {
          const extra = [p.activeIngredient, p.manufacturer].filter(Boolean).join(", ");
          return `${p.id}: ${p.name}${extra ? ` (${extra})` : ""}`;
        }).join("\n");
        try {
          const result = await invokeLLM({
            messages: [
              { role: "system" as const, content: "Você é um especialista em classificação de produtos. Analise cada produto e atribua a categoria mais adequada da lista fornecida. Responda APENAS com JSON válido." },
              { role: "user" as const, content: `CATEGORIAS DISPONÍVEIS:\n${catList}\n\nPRODUTOS PARA CLASSIFICAR:\n${prodList}\n\nRetorne um array JSON com objetos {productId, categoryId} para cada produto.` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "auto_classify",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    classifications: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          productId: { type: "number" },
                          categoryId: { type: "number" },
                        },
                        required: ["productId", "categoryId"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["classifications"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = result.choices?.[0]?.message?.content;
          if (content && typeof content === "string") {
            const parsed = JSON.parse(content) as { classifications: Array<{ productId: number; categoryId: number }> };
            for (const item of (parsed.classifications ?? [])) {
              // Validate categoryId exists
              const validCat = cats.find((c) => c.id === item.categoryId);
              if (!validCat) continue;
              await db
                .update(products)
                .set({ categoryId: item.categoryId, updatedAt: new Date() })
                .where(eq(products.id, item.productId));
              updated++;
            }
          }
          batches++;
        } catch (_) {
          errors++;
          // Skip this batch and continue
          offset += batchSize;
        }
        // Safety: break if we've processed more than 300 batches (15k products)
        if (batches + errors > 300) break;
      }
      return { updated, batches, errors };
    }),
  // Apply: update categoryId for selected products
  batchReclassifyApply: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        productId: z.number(),
        categoryId: z.number(),
      })).min(1).max(200),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { updated: 0 };
      let updated = 0;
      for (const item of input.items) {
        await db
          .update(products)
          .set({ categoryId: item.categoryId, updatedAt: new Date() })
          .where(eq(products.id, item.productId));
        updated++;
      }
      return { updated };
    }),

  // ── bulkReclassifySelected: reclassifica produtos selecionados (ou todos sem categoria) com IA ──
  // Suporta 30k produtos via paginação: offset+pageSize para processar em sessões
  bulkReclassifySelected: protectedProcedure
    .input(z.object({
      productIds: z.array(z.number()).optional(), // se omitido, processa todos sem categoria
      batchSize: z.number().min(5).max(100).default(50),
      includeAlreadyCategorized: z.boolean().optional().default(false),
      // Paginação para grandes volumes
      offset: z.number().min(0).default(0),
      pageSize: z.number().min(10).max(500).default(200),
    }))
    .mutation(async ({ input }) => {
      const { invokeLLM } = await import("../_core/llm");
      const db = await getDb();
      if (!db) return { updated: 0, skipped: 0, errors: 0, total: 0, nextOffset: 0, hasMore: false };
      // Carregar categorias
      const cats = await db
        .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
        .from(categories)
        .orderBy(categories.parentId, categories.sortOrder);
      const catList = cats.map((c) => {
        const parent = cats.find((p) => p.id === c.parentId);
        return parent ? `${c.id}: ${parent.name} > ${c.name}` : `${c.id}: ${c.name}`;
      }).join("\n");

      // Contar total sem carregar tudo na memória
      let totalCount = 0;
      if (input.productIds && input.productIds.length > 0) {
        totalCount = input.productIds.length;
      } else {
        const whereClause = input.includeAlreadyCategorized
          ? eq(products.isActive, "yes")
          : isNull(products.categoryId);
        const [cnt] = await db.select({ c: sql<number>`COUNT(*)` }).from(products).where(whereClause);
        totalCount = Number(cnt?.c ?? 0);
      }

      // Buscar apenas a página atual
      let prods: Array<{ id: number; name: string; fichaTecnica: string | null; manufacturer: string | null; presentation: string | null; laboratorio: string | null; subcategoria: string | null; categoryId: number | null }>;
      if (input.productIds && input.productIds.length > 0) {
        const page = input.productIds.slice(input.offset, input.offset + input.pageSize);
        prods = await db
          .select({ id: products.id, name: products.name, fichaTecnica: products.fichaTecnica, manufacturer: products.manufacturer, presentation: products.presentation, laboratorio: products.laboratorio, subcategoria: products.subcategoria, categoryId: products.categoryId })
          .from(products)
          .where(inArray(products.id, page));
      } else {
        const whereClause = input.includeAlreadyCategorized
          ? eq(products.isActive, "yes")
          : isNull(products.categoryId);
        prods = await db
          .select({ id: products.id, name: products.name, fichaTecnica: products.fichaTecnica, manufacturer: products.manufacturer, presentation: products.presentation, laboratorio: products.laboratorio, subcategoria: products.subcategoria, categoryId: products.categoryId })
          .from(products)
          .where(whereClause)
          .orderBy(asc(products.id))
          .limit(input.pageSize)
          .offset(input.offset);
      }

      const total = totalCount;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      // Processar em sub-lotes para a LLM
      const batchSize = input.batchSize;
      for (let i = 0; i < prods.length; i += batchSize) {
        const batch = prods.slice(i, i + batchSize);
        const prodList = batch.map((p) => {
          const extra = [p.fichaTecnica?.slice(0, 80), p.laboratorio ?? p.manufacturer, p.presentation].filter(Boolean).join(", ");
          return `${p.id}: ${p.name}${extra ? ` (${extra})` : ""}`;
        }).join("\n");
        try {
          const result = await invokeLLM({
            messages: [
              { role: "system" as const, content: "Você é um especialista em classificação de produtos veterinários, agropecuários, farmacêuticos e de construção. Analise cada produto e atribua a categoria mais adequada da lista. Responda APENAS com JSON válido." },
              { role: "user" as const, content: `CATEGORIAS DISPONÍVEIS:\n${catList}\n\nPRODUTOS PARA CLASSIFICAR:\n${prodList}\n\nRetorne um array JSON com objetos {productId, categoryId, subcategoria} para cada produto. subcategoria deve ser uma string curta (ex: "Antiparasitários", "Antibióticos", "Anestésicos") ou string vazia se não se aplicar.` },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "bulk_classify",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    classifications: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          productId: { type: "number" },
                          categoryId: { type: "number" },
                          subcategoria: { type: "string" },
                        },
                        required: ["productId", "categoryId", "subcategoria"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["classifications"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = result.choices?.[0]?.message?.content;
          if (content && typeof content === "string") {
            const parsed = JSON.parse(content) as { classifications: Array<{ productId: number; categoryId: number; subcategoria: string }> };
            const validItems = (parsed.classifications ?? []).filter(item => cats.find(c => c.id === item.categoryId));
            skipped += (parsed.classifications ?? []).length - validItems.length;
            // Agrupar por (categoryId, subcategoria) para bulk update
            const groups = new Map<string, number[]>();
            const subMap = new Map<string, string | null>();
            for (const item of validItems) {
              const key = `${item.categoryId}|||${item.subcategoria?.trim() || ""}`;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(item.productId);
              subMap.set(key, item.subcategoria?.trim() || null);
            }
            for (const [key, ids] of Array.from(groups.entries())) {
              const [catIdStr] = key.split("|||");
              const catId = parseInt(catIdStr);
              const subcat = subMap.get(key) ?? null;
              if (ids.length > 0) {
                await db.update(products).set({ categoryId: catId, subcategoria: subcat, updatedAt: new Date() }).where(inArray(products.id, ids));
                updated += ids.length;
              }
            }
          }
        } catch (_) {
          errors += batch.length;
        }
      }
      const nextOffset = input.offset + prods.length;
      const hasMore = nextOffset < totalCount;
      return { updated, skipped, errors, total, nextOffset, hasMore };
    }),

    // ── enrichFichaTecnica: extrai ficha técnica do nome do produto via IA ───────────────────────
    // Suporta 30k produtos via paginação: use offset+limit para processar em sessões
    enrichFichaTecnica: protectedProcedure
      .input(z.object({
        scope: z.enum(["withoutFicha", "selected", "all"]).default("withoutFicha"),
        productIds: z.array(z.number()).optional(),
        overwrite: z.boolean().default(false),
        // Paginação para grandes volumes: offset=0 na primeira chamada, incrementar pelo retorno
        offset: z.number().min(0).default(0),
        // Quantos produtos processar nesta chamada (máx 300 para evitar timeout)
        pageSize: z.number().min(10).max(300).default(150),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("../_core/llm");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

        // 1. Contar total de produtos alvo (sem carregar todos na memória)
        let totalCount = 0;
        if (input.scope === "selected" && input.productIds?.length) {
          totalCount = input.productIds.length;
        } else {
          const countWhere = input.overwrite && input.scope === "all"
            ? eq(products.isActive, "yes")
            : and(eq(products.isActive, "yes"), or(isNull(products.fichaTecnica), eq(products.fichaTecnica, "")));
          const [cnt] = await db.select({ c: sql<number>`COUNT(*)` }).from(products).where(countWhere);
          totalCount = Number(cnt?.c ?? 0);
        }

        // 2. Buscar apenas a página atual (offset+pageSize) — nunca carrega 30k na memória
        let targets: { id: number; name: string }[] = [];
        if (input.scope === "selected" && input.productIds?.length) {
          const page = input.productIds.slice(input.offset, input.offset + input.pageSize);
          targets = await db
            .select({ id: products.id, name: products.name })
            .from(products)
            .where(and(eq(products.isActive, "yes"), inArray(products.id, page)));
        } else {
          const whereClause = input.overwrite && input.scope === "all"
            ? eq(products.isActive, "yes")
            : and(eq(products.isActive, "yes"), or(isNull(products.fichaTecnica), eq(products.fichaTecnica, "")));
          targets = await db
            .select({ id: products.id, name: products.name })
            .from(products)
            .where(whereClause)
            .orderBy(asc(products.id))
            .limit(input.pageSize)
            .offset(input.offset);
        }

        let updated = 0;
        let skipped = 0;
        let errors = 0;
        // Processar em sub-lotes de 30 para a LLM (melhor qualidade de extração)
        const BATCH = 30;
        for (let i = 0; i < targets.length; i += BATCH) {
          const batch = targets.slice(i, i + BATCH);
          try {
            const llmResp = await invokeLLM({
              messages: [
                {
                  role: "system",
                  content: `Você é um especialista em farmácia veterinária e humana. Para cada produto informado, extraia do nome do produto as informações técnicas: princípio ativo / composição, concentração, forma farmacêutica, espécie animal (se veterinário) e classe terapêutica. Se não for possível extrair algum campo, deixe null. Responda em JSON válido.`,
                },
                {
                  role: "user",
                  content: JSON.stringify(batch.map((p, idx) => ({ idx, name: p.name }))),
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "ficha_tecnica_extraction",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            idx: { type: "integer" },
                            fichaTecnica: { type: ["string", "null"], description: "Princípio ativo / composição completa" },
                            concentration: { type: ["string", "null"], description: "Concentração (ex: 500mg, 10%)" },
                            presentation: { type: ["string", "null"], description: "Forma farmacêutica (ex: comprimido, injetável)" },
                            classeTerapeutica: { type: ["string", "null"], description: "Classe terapêutica" },
                          },
                          required: ["idx", "fichaTecnica", "concentration", "presentation", "classeTerapeutica"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["results"],
                    additionalProperties: false,
                  },
                },
              },
            });
            const parsed = JSON.parse(llmResp.choices[0].message.content as string) as {
              results: { idx: number; fichaTecnica: string | null; concentration: string | null; presentation: string | null; classeTerapeutica: string | null }[];
            };
            const toUpdate: Array<{ id: number; fichaTecnica?: string; concentration?: string; presentation?: string }> = [];
            for (const item of (parsed.results ?? [])) {
              const prod = batch[item.idx];
              if (!prod) { skipped++; continue; }
              if (!item.fichaTecnica && !item.concentration && !item.presentation) { skipped++; continue; }
              toUpdate.push({
                id: prod.id,
                ...(item.fichaTecnica ? { fichaTecnica: item.fichaTecnica.trim() } : {}),
                ...(item.concentration ? { concentration: item.concentration.trim() } : {}),
                ...(item.presentation ? { presentation: item.presentation.trim() } : {}),
              });
            }
            await Promise.all(toUpdate.map(({ id, ...fields }) =>
              db.update(products).set({ ...fields, updatedAt: new Date() }).where(eq(products.id, id))
            ));
            updated += toUpdate.length;
          } catch (_) {
            errors += batch.length;
          }
        }
        // Retorna nextOffset para o frontend continuar de onde parou
        const nextOffset = input.offset + targets.length;
        const hasMore = nextOffset < totalCount;
        return { updated, skipped, errors, total: totalCount, processedInPage: targets.length, nextOffset, hasMore };
      }),
    // ── extractFichaTecnica: extrai ficha técnica de UM produto via IA (para modal de edição) ──
    extractFichaTecnica: protectedProcedure
      .input(z.object({
        productId: z.number(),
        name: z.string(),
        manufacturer: z.string().optional(),
        concentration: z.string().optional(),
        presentation: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("../_core/llm");
        const prompt = [
          `Produto veterinário: "${input.name}"`,
          input.manufacturer ? `Fabricante: ${input.manufacturer}` : null,
          input.concentration ? `Concentração: ${input.concentration}` : null,
          input.presentation ? `Apresentação: ${input.presentation}` : null,
        ].filter(Boolean).join(" | ");
        const resp = await invokeLLM({
          messages: [
            { role: "system", content: "Você é um especialista em medicamentos veterinários. Retorne APENAS um JSON com o campo 'fichaTecnica' contendo a ficha técnica completa do produto (princípio ativo, classe terapêutica, indicações, posologia, contraindicações, forma farmacêutica). Se não souber, retorne fichaTecnica como string vazia." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema" as const,
            json_schema: {
              name: "ficha_tecnica",
              strict: true,
              schema: {
                type: "object",
                properties: { fichaTecnica: { type: "string" } },
                required: ["fichaTecnica"],
                additionalProperties: false,
              },
            },
          },
        });
        const parsed = JSON.parse(resp.choices[0].message.content as string) as { fichaTecnica: string };
        if (!parsed.fichaTecnica?.trim()) throw new TRPCError({ code: "NOT_FOUND", message: "IA não encontrou ficha técnica para este produto" });
        return { fichaTecnica: parsed.fichaTecnica.trim() };
      }),

  // Novos endpoints de enriquecimento com IA (Fase 3)
  listProductsNeedingEnrichment: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(100),
        offset: z.number().default(0),
        filterType: z.enum(["missing_active_ingredient", "missing_category", "both"]).default("both"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      let whereCondition: any = eq(products.isActive, "yes");

      // tipoCatalogo é NOT NULL com default "produto_nao_medicamentoso":
      // categoria "faltando" = ainda no valor default (ou NULL em dados legados)
      const missingCategoryCondition = or(
        isNull(products.tipoCatalogo),
        eq(products.tipoCatalogo, "produto_nao_medicamentoso")
      );

      if (input.filterType === "missing_active_ingredient") {
        whereCondition = and(eq(products.isActive, "yes"), isNull(products.activeIngredient));
      } else if (input.filterType === "missing_category") {
        whereCondition = and(eq(products.isActive, "yes"), missingCategoryCondition);
      } else {
        whereCondition = and(
          eq(products.isActive, "yes"),
          isNull(products.activeIngredient),
          missingCategoryCondition
        );
      }

      const results = await db
        .select()
        .from(products)
        .where(whereCondition)
        .limit(input.limit)
        .offset(input.offset);

      return {
        total: results.length,
        products: results.map((p) => ({
          id: p.id,
          name: p.name,
          manufacturer: p.manufacturer,
          activeIngredient: p.activeIngredient,
          tipoCatalogo: p.tipoCatalogo,
          statusConfiabilidade: p.statusConfiabilidade,
        })),
      };
    }),

  getEnrichmentStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível");

    const allProducts = await db
      .select({
        id: products.id,
        statusConfiabilidade: products.statusConfiabilidade,
        activeIngredient: products.activeIngredient,
      })
      .from(products)
      .where(eq(products.isActive, "yes"));

    const enriquecidos = allProducts.filter(
      (p) => p.statusConfiabilidade === "enriquecido_ia"
    ).length;
    const pendentes = allProducts.filter(
      (p) => !p.activeIngredient || p.statusConfiabilidade === "incompleto"
    ).length;

    return {
      total: allProducts.length,
      enriquecidos,
      pendentes,
      percentualEnriquecido:
        allProducts.length > 0 ? (enriquecidos / allProducts.length) * 100 : 0,
    };
  }),

  // Enriquecer um produto individual com IA
  enrichProduct: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        productName: z.string(),
        currentActiveIngredient: z.string().optional(),
        currentCategory: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const product = await db
        .select()
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      if (!product[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Produto ${input.productId} não encontrado` });
      }

      const prod = product[0];

      const prompt = `Analise o seguinte produto veterinário/farmacêutico e extraia as informações solicitadas:

Nome do Produto: ${input.productName}
Fabricante Atual: ${prod.manufacturer || "Não informado"}
Categoria Atual: ${input.currentCategory || "Não informada"}
Princípio Ativo Atual: ${input.currentActiveIngredient || "Não informado"}

Por favor, forneça em JSON:
1. activeIngredient: Princípio ativo principal (nome técnico)
2. concentration: Concentração/dosagem
3. category: medicamento_veterinario, medicamento_humano, produto_nao_medicamentoso ou material_insumo_equipamento
4. subcategory: Antibiótico, Antiparasitário, Vacina, Analgésico, etc
5. manufacturer: Fabricante
6. indication: Indicação terapêutica ou uso
7. confidence: Confiança (0-1)`;

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "Você é um especialista em farmacologia veterinária e medicamentos. Classifique produtos com precisão. Responda APENAS com JSON válido.",
            },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_enrichment",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  activeIngredient: { type: "string" },
                  concentration: { type: "string" },
                  category: { type: "string" },
                  subcategory: { type: "string" },
                  manufacturer: { type: "string" },
                  indication: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["activeIngredient", "concentration", "category", "subcategory", "manufacturer", "indication", "confidence"],
                additionalProperties: false,
              },
            },
          } as any,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("Resposta vazia do LLM");

        const contentStr = typeof content === "string" ? content : JSON.stringify(content);
        const enriched = JSON.parse(contentStr);

        await db
          .update(products)
          .set({
            activeIngredient: enriched.activeIngredient,
            concentration: enriched.concentration,
            tipoCatalogo: enriched.category,
            manufacturer: enriched.manufacturer,
            statusConfiabilidade: enriched.confidence > 0.7 ? "completo_validado" : "enriquecido_ia",
          })
          .where(eq(products.id, input.productId));

        return {
          success: true,
          productId: input.productId,
          enrichment: enriched,
        };
      } catch (error) {
        return {
          success: false,
          productId: input.productId,
          error: (error as Error).message,
        };
      }
    }),

  // Enriquecer múltiplos produtos em lote
  enrichProductsBatch: protectedProcedure
    .input(
      z.object({
        productIds: z.array(z.number()).max(100),
        batchSize: z.number().default(50),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const results = [];
      const errors = [];

      for (let i = 0; i < input.productIds.length; i += input.batchSize) {
        const batch = input.productIds.slice(i, i + input.batchSize);

        for (const productId of batch) {
          try {
            const product = await db
              .select()
              .from(products)
              .where(eq(products.id, productId))
              .limit(1);

            if (!product[0]) {
              errors.push({ productId, error: "Produto não encontrado" });
              continue;
            }

            const prod = product[0];

            const prompt = `Produto: "${prod.name}". Fabricante: ${prod.manufacturer || "desconhecido"}. Sugira: activeIngredient, concentration, category (medicamento_veterinario/medicamento_humano/produto_nao_medicamentoso/material_insumo_equipamento), subcategory, indication, confidence (0-1). JSON apenas.`;

            const response = await invokeLLM({
              messages: [
                { role: "system", content: "Especialista em farmacologia veterinária. Responda APENAS com JSON válido." },
                { role: "user", content: prompt },
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "enrichment",
                  strict: true,
                  schema: {
                    type: "object",
                    properties: {
                      activeIngredient: { type: "string" },
                      concentration: { type: "string" },
                      category: { type: "string" },
                      subcategory: { type: "string" },
                      indication: { type: "string" },
                      confidence: { type: "number" },
                    },
                    required: ["activeIngredient", "concentration", "category", "subcategory", "indication", "confidence"],
                    additionalProperties: false,
                  },
                },
              } as any,
            });

            const content = response.choices[0]?.message?.content;
            if (!content) throw new Error("Resposta vazia");

            const contentStr = typeof content === "string" ? content : JSON.stringify(content);
            const enriched = JSON.parse(contentStr);

            await db
              .update(products)
              .set({
                activeIngredient: enriched.activeIngredient,
                concentration: enriched.concentration,
                tipoCatalogo: enriched.category,
                statusConfiabilidade: enriched.confidence > 0.7 ? "completo_validado" : "enriquecido_ia",
              })
              .where(eq(products.id, productId));

            results.push({ productId, success: true, confidence: enriched.confidence });
          } catch (error) {
            errors.push({ productId, error: (error as Error).message });
          }
        }

        if (i + input.batchSize < input.productIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      return {
        total: input.productIds.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors,
      };
    }),

  // Obter sugestões sem aplicar
  getSuggestions: protectedProcedure
    .input(z.object({ productId: z.number(), productName: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const product = await db
        .select()
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      if (!product[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Produto ${input.productId} não encontrado` });
      }

      const prod = product[0];

      const prompt = `Produto: "${input.productName}". Fabricante: ${prod.manufacturer || "desconhecido"}. P.A.: ${prod.activeIngredient || "não informado"}. Sugira: activeIngredient, concentration, category (medicamento_veterinario/medicamento_humano/produto_nao_medicamentoso/material_insumo_equipamento), subcategory, indication, confidence (0-1). JSON.`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "Especialista em farmacologia veterinária. JSON apenas." },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "suggestions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  activeIngredient: { type: "string" },
                  concentration: { type: "string" },
                  category: { type: "string" },
                  subcategory: { type: "string" },
                  indication: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["activeIngredient", "concentration", "category", "subcategory", "indication", "confidence"],
                additionalProperties: false,
              },
            },
          } as any,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("Resposta vazia");

        const contentStr = typeof content === "string" ? content : JSON.stringify(content);
        const suggestions = JSON.parse(contentStr);

        return { productId: input.productId, productName: input.productName, suggestions };
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (error as Error).message });
      }
    }),

  // Aplicar sugestões aprovadas
  applySuggestions: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        activeIngredient: z.string().optional(),
        concentration: z.string().optional(),
        category: z.string().optional(),
        manufacturer: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const updateData: any = { statusConfiabilidade: "enriquecido_ia" };

      if (input.activeIngredient) updateData.activeIngredient = input.activeIngredient;
      if (input.concentration) updateData.concentration = input.concentration;
      if (input.category) updateData.tipoCatalogo = input.category;
      if (input.manufacturer) updateData.manufacturer = input.manufacturer;

      await db.update(products).set(updateData).where(eq(products.id, input.productId));

      return { success: true, productId: input.productId };
    }),
  });
