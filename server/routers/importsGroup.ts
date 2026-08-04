import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import { parsePrecoBR } from "../utils/number";


import { z } from "zod";
import {
  createImportLog,
  listImportLogs,
  updateImportLog,
  getDb,
  checkDuplicatesInRows,
} from "../db";
import {
  products, categories, suppliers,
  importLogs,
} from "../../drizzle/schema";
import { sql, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { logger } from "../_core/logger";

export const importsRouter = router({
    list: protectedProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(({ input }) => listImportLogs(input?.limit)),

    // ── processUploadV2: novos campos + IA para categoria/subcategoria + preços por fornecedor ──
    processUploadV2: protectedProcedure
      .input(
        z.object({
          fileName: z.string(),
          fileUrl: z.string().optional(),
          rows: z.array(
            z.object({
              ean: z.string().optional(),           // Código EAN / GTIN
              codigoMapa: z.string().optional(),    // Código MAPA/ANVISA/FORN
              codigoFornecedor: z.string().optional(), // Código do fornecedor
              nome: z.string(),                     // Nome do produto
              categoria: z.string().optional(),     // Categoria (se já preenchida)
              subcategoria: z.string().optional(),  // Subcategoria (se já preenchida)
              fichaTecnica: z.string().optional(),  // Ficha técnica / bula
              apresentacao: z.string().optional(),  // Apresentação
              fabricante: z.string().optional(),    // Fabricante
              preco: z.string().optional(),         // Preço de referência
              linkProduto: z.string().optional(),   // Link do produto
              urlImagem: z.string().optional(),     // URL da imagem
              // Preços por fornecedor: chave = nome do fornecedor, valor = preço
              precosFornecedor: z.record(z.string(), z.string()).optional(),
            })
          ).max(3000),
          supplierId: z.number().optional().nullable(),
          replaceExisting: z.boolean().optional(),
          rowActions: z.record(z.string(), z.enum(["update", "skip", "replace", "insert"])).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const sanitiseText = (v?: string, maxLen = 512) => {
          if (!v) return null;
          const t = v.trim();
          return t.length > maxLen ? t.slice(0, maxLen) : t || null;
        };
        // Parse pt-BR/US via parsePrecoBR (trata milhar "1.234,56" corretamente)
        const sanitisePrice = (v?: string) => {
          if (!v) return null;
          const num = parsePrecoBR(v);
          return num === null ? null : num.toFixed(2);
        };

        const validRows = input.rows.filter(r => r.nome?.trim());
        if (validRows.length === 0) return { success: false, imported: 0, updated: 0, skipped: 0, enriched: 0, rowErrors: [], batchId: 0 };

        // ── 1. Criar log de importação ─────────────────────────────────────────
        const batchId = await createImportLog({
          supplierId: input.supplierId ?? null,
          categoryId: null,
          fileName: input.fileName,
          fileUrl: input.fileUrl,
          totalRows: validRows.length,
          status: "processing",
        });

        // ── 2. Gerar categoria e subcategoria por IA (em lote) ─────────────────
        const needsCategory = validRows.filter(r => !r.categoria?.trim());
        const categoryMap = new Map<string, { categoria: string; subcategoria: string }>();

        if (needsCategory.length > 0) {
          try {
            const BATCH = 40;
            for (let i = 0; i < needsCategory.length; i += BATCH) {
              const sample = needsCategory.slice(i, i + BATCH);
              const llmResp = await invokeLLM({
                messages: [
                  {
                    role: "system",
                    content: `Você é um especialista em classificação de produtos veterinários, humanos, agropecuários, farmacêuticos e de construção.
                    Classifique cada produto em UMA das categorias: "Medicamentos Veterinários", "Medicamentos Humanos", "Produtos Agro", "Insumos", "Materiais Diversos".
                    Para Medicamentos Veterinários, use subcategorias como: Antiparasitários, Antibióticos, Vacinas, Anti-inflamatórios, Anestésicos, Vitaminas e Suplementos, Hormônios, Dermatológicos, Oftalmológicos, Outros.
                    Para Medicamentos Humanos: Antibióticos, Analgésicos, Anti-inflamatórios, Vitaminas, Outros.
                    Para Produtos Agro: Herbicidas, Inseticidas, Fungicidas, Fertilizantes, Outros.
                    Para Insumos: Seringas, Agulhas, Luvas, Curativos, Outros.
                    Para Materiais Diversos: use a subcategoria mais adequada.
                    Responda APENAS com JSON.`,
                  },
                  {
                    role: "user",
                    content: `Classifique estes produtos:\n${sample.map((r, idx) => `${idx}. ${r.nome}${r.apresentacao ? ` (${r.apresentacao})` : ""}${r.fabricante ? ` - ${r.fabricante}` : ""}`).join("\n")}`,
                  },
                ],
                response_format: {
                  type: "json_schema" as const,
                  json_schema: {
                    name: "product_categories",
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
                              categoria: { type: "string" },
                              subcategoria: { type: "string" },
                            },
                            required: ["idx", "categoria", "subcategoria"],
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
                results: { idx: number; categoria: string; subcategoria: string }[];
              };
              for (const item of parsed.results) {
                const row = sample[item.idx];
                if (row) categoryMap.set(row.nome, { categoria: item.categoria, subcategoria: item.subcategoria });
              }
            }
          } catch (_) {
            // IA é best-effort — nunca bloqueia a importação
          }
        }

        // ── 3. Resolver/criar categorias no banco ──────────────────────────────
        const categoryIdMap = new Map<string, number>(); // nome -> id
        const db = await getDb();
        if (db) {
          // Carregar categorias existentes
          const existingCats = await db.select().from(categories);
          for (const cat of existingCats) categoryIdMap.set(cat.name.toLowerCase(), cat.id);

          // Criar categorias que não existem
          const uniqueCategories = new Set<string>();
          for (const row of validRows) {
            const cat = row.categoria?.trim() || categoryMap.get(row.nome)?.categoria || "Materiais Diversos";
            uniqueCategories.add(cat);
          }
          for (const catName of Array.from(uniqueCategories)) {
            if (!categoryIdMap.has(catName.toLowerCase())) {
              try {
                const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                const [ins] = await db.insert(categories).values({
                  name: catName,
                  slug: `${slug}-${Date.now()}`,
                  description: `Categoria criada automaticamente na importação`,
                });
                categoryIdMap.set(catName.toLowerCase(), (ins as { insertId?: number }).insertId!);
              } catch (_) { /* ignora duplicata de slug */ }
            }
          }
          // Recarregar após criação
          const refreshedCats = await db.select().from(categories);
          for (const cat of refreshedCats) categoryIdMap.set(cat.name.toLowerCase(), cat.id);
        }

        // ── 4. Resolver fornecedores para preços por fornecedor ────────────────
        const supplierIdMap = new Map<string, number>(); // nome -> id
        if (db) {
          const existingSuppliers = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers);
          for (const s of existingSuppliers) supplierIdMap.set(s.name.toLowerCase(), s.id);
        }
        // ── 5. Montar payload de inserção ──────────────────────────────────────────────
        const toInsert = validRows.map((r) => {
          const catName = r.categoria?.trim() || categoryMap.get(r.nome)?.categoria || "Materiais Diversos";
          const subcat = r.subcategoria?.trim() || categoryMap.get(r.nome)?.subcategoria || null;
          const catId = categoryIdMap.get(catName.toLowerCase()) ?? null;
          const eanNorm = r.ean ? r.ean.trim().replace(/\D/g, '') : null;
          return {
            supplierId: input.supplierId ?? 0, // usar o fornecedor informado na importação (0 = sem fornecedor específico)
            categoryId: catId,
            name: sanitiseText(r.nome, 512) ?? "(sem nome)",
            nomeProduto: sanitiseText(r.nome, 512) ?? "(sem nome)",
            gtin: eanNorm ?? sanitiseText(r.ean, 64),
            barcode: eanNorm ?? sanitiseText(r.ean, 128),
            ean: eanNorm ?? null,
            mapa: sanitiseText(r.codigoMapa, 128),
            codigoFornecedor: sanitiseText(r.codigoFornecedor, 128),
            subcategoria: sanitiseText(subcat ?? undefined, 256),
            fichaTecnica: sanitiseText(r.fichaTecnica, 5000),
            presentation: sanitiseText(r.apresentacao, 256),
            manufacturer: sanitiseText(r.fabricante, 256),
            laboratorio: sanitiseText(r.fabricante, 256),
            price: sanitisePrice(r.preco),
            productUrl: sanitiseText(r.linkProduto, 2000),
            imageUrl: sanitiseText(r.urlImagem, 2000),
            importBatchId: batchId,
            isActive: "yes" as const,
          };
        });

         // ── 6. Pré-verificar duplicatas em lote (EAN + nome exato + fuzzy Jaro-Winkler) ──────
        const dupCheckRows = validRows.map(r => ({
          name: r.nome,
          fichaTecnica: r.fichaTecnica ?? undefined,
          presentation: r.apresentacao,
          ean: r.ean,
        }));
        const dupResults = input.supplierId
          ? await checkDuplicatesInRows(dupCheckRows, input.supplierId)
          : dupCheckRows.map((r, i) => ({ rowIndex: i, name: r.name ?? "", fichaTecnica: null, presentation: r.presentation ?? null, status: "new" as const, existingId: null, existingName: null, existingFichaTecnica: null, existingPresentation: null, existingPrice: null, existingSupplierName: null }));
        const dupMap = new Map<number, typeof dupResults[0]>();
        for (const d of dupResults) dupMap.set(d.rowIndex, d);
        // ── 7. Inserir produtos e registrar preços por fornecedor ──────────────
        let inserted = 0;
        let updated = 0;
        let skippedByAction = 0;
        let duplicatesDetected = 0;
        const errors: { row: number; name: string; reason: string }[] = [];
        const duplicatesList: { row: number; name: string; existingName: string; existingId: number }[] = [];
        const rowActions = input.rowActions ?? {};
        const supplierPriceEntries: { productId: number; supplierId: number; price: string | null }[] = [];
        for (let i = 0; i < toInsert.length; i++) {
          const rowData = toInsert[i];
          const origRow = validRows[i];
          const dupInfo = dupMap.get(i);
          const action = rowActions[String(i)] ?? (dupInfo?.status === "duplicate" ? "update" : "insert");
          if (action === "skip") { skippedByAction++; continue; }
          try {
            let productId: number | null = null;
            // Usar resultado do pré-check de duplicatas (EAN + nome exato + fuzzy)
            let existingProductId: number | null = dupInfo?.existingId ?? null;
            // Registrar duplicata detectada
            if (dupInfo?.status === "duplicate" && dupInfo.existingId) {
              duplicatesDetected++;
              duplicatesList.push({ row: i + 1, name: rowData.name, existingName: dupInfo.existingName ?? rowData.name, existingId: dupInfo.existingId });
            }
            if (action === "update" || action === "replace" || (action === "insert" && existingProductId)) {
              if (existingProductId) {
                if (action === "replace") {
                  await db!.update(products).set({ isActive: "no" }).where(eq(products.id, existingProductId));
                  const [ins] = await db!.insert(products).values(rowData);
                  productId = (ins as { insertId?: number }).insertId!;
                  inserted++;
                } else {
                  // Mesclar: atualizar apenas campos não nulos
                  const mergeData: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(rowData)) {
                    if (v !== null && v !== undefined && v !== '') mergeData[k] = v;
                  }
                  await db!.update(products).set(mergeData).where(eq(products.id, existingProductId));
                  productId = existingProductId;
                  updated++;
                }
              } else {
                const [ins] = await db!.insert(products).values(rowData);
                productId = (ins as { insertId?: number }).insertId!;
                inserted++;
              }
            } else {
              // insert sem duplicata
              if (db) {
                const [ins] = await db.insert(products).values(rowData);
                productId = (ins as { insertId?: number }).insertId!;
                inserted++;
              }
            }

            // Registrar preços por fornecedor
            if (productId && origRow.precosFornecedor) {
              for (const [supplierName, priceStr] of Object.entries(origRow.precosFornecedor)) {
                const sId = supplierIdMap.get(supplierName.toLowerCase());
                if (sId) {
                  const price = sanitisePrice(priceStr);
                  supplierPriceEntries.push({ productId, supplierId: sId, price });
                }
              }
            }
          } catch (err) {
            errors.push({ row: i + 1, name: rowData.name, reason: String(err).slice(0, 200) });
          }
        }

        // ── 7. Salvar preços por fornecedor em lote ────────────────────────────
        if (supplierPriceEntries.length > 0) {
          const { batchUpsertSupplierPrices } = await import("../db");
          await batchUpsertSupplierPrices(supplierPriceEntries);
        }

        await updateImportLog(batchId, {
          status: inserted + updated > 0 ? "done" : "error",
          importedRows: inserted,
          errorRows: errors.length,
          errorMessage: errors.length > 0 ? errors.slice(0, 5).map(e => `L${e.row}: ${e.reason}`).join(" | ") : undefined,
        });

        // Notificar proprietário se duplicatas foram detectadas
        if (duplicatesDetected > 0) {
          const topDuplicates = duplicatesList.slice(0, 10);
          const listText = topDuplicates
            .map((d) => `- Linha ${d.row}: "${d.name}" (similar a "${d.existingName}" ID=${d.existingId})`)
            .join("\n");
          const extraMsg = duplicatesDetected > 10 ? `\n... e mais ${duplicatesDetected - 10} duplicata(s).` : "";
          await notifyOwner({
            title: `[ALERTA] ${duplicatesDetected} duplicata(s) detectada(s) na importacao`,
            content: `Arquivo: ${input.fileName}\nFornecedor ID: ${input.supplierId}\nTotal importado: ${inserted} | Atualizados: ${updated} | Duplicatas: ${duplicatesDetected}\n\nPrimeiras duplicatas detectadas:\n${listText}${extraMsg}`,
          }).catch(() => { /* notificacao e best-effort */ });
        }

        return {
          success: true,
          imported: inserted,
          updated,
          skipped: skippedByAction,
          enriched: categoryMap.size,
          rowErrors: errors.slice(0, 20),
          batchId,
          duplicatesDetected,
          duplicatesList: duplicatesList.slice(0, 50),
        };
      }),

    // ── getStatus: polling de status de uma importação em andamento ──
    getStatus: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db
          .select({
            id: importLogs.id,
            status: importLogs.status,
            totalRows: importLogs.totalRows,
            importedRows: importLogs.importedRows,
            errorRows: importLogs.errorRows,
            errorMessage: importLogs.errorMessage,
            updatedAt: importLogs.updatedAt,
          })
          .from(importLogs)
          .where(eq(importLogs.id, input.batchId))
          .limit(1);
        if (!rows[0]) return null;
        const row = rows[0];
        const pct = row.totalRows && row.totalRows > 0
          ? Math.min(100, Math.round(((row.importedRows ?? 0) / row.totalRows) * 100))
          : 0;
        return { ...row, progressPct: pct };
      }),

    // ── getErrors: erros linha a linha de uma importação ──
    getErrors: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { errors: [], total: 0 };
        const rows = await db
          .select({ errorMessage: importLogs.errorMessage, errorRows: importLogs.errorRows, totalRows: importLogs.totalRows })
          .from(importLogs)
          .where(eq(importLogs.id, input.batchId))
          .limit(1);
        if (!rows[0]) return { errors: [], total: 0 };
        const raw = rows[0].errorMessage ?? "";
        // Formato salvo: "L1: razão | L2: razão"
        const errors = raw
          ? raw.split(" | ").map((e, i) => {
              const match = e.match(/^L(\d+): (.+)$/);
              return match
                ? { row: Number(match[1]), reason: match[2] }
                : { row: i + 1, reason: e };
            })
          : [];
        return { errors, total: rows[0].errorRows ?? 0 };
      }),

    // ── previewCategoryClassification: classifica produtos em lote por IA antes de importar ──
    previewCategoryClassification: protectedProcedure
      .input(z.object({
        rows: z.array(z.object({
          rowIndex: z.number(),
          nome: z.string().optional(),
          principioAtivo: z.string().optional(),
          fabricante: z.string().optional(),
          apresentacao: z.string().optional(),
          categoria: z.string().optional(),
          subcategoria: z.string().optional(),
        })),
      }))
      .mutation(async ({ input }) => {
        const { rows } = input;
        if (rows.length === 0) return [];

        // Busca categorias existentes para sugerir as corretas
        const db = await getDb();
        const existingCategories = db ? await db.select({ id: categories.id, name: categories.name }).from(categories) : [];
        const catNames = existingCategories.map(c => c.name).join(", ");

        // Classifica em lotes de 30 para não sobrecarregar o LLM
        const BATCH_SIZE = 30;
        const results: Array<{
          rowIndex: number;
          categoria: string;
          subcategoria: string;
          confidence: "alta" | "media" | "baixa";
          justificativa: string;
          manualOverride: boolean;
        }> = [];

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          // Produtos que já têm categoria definida na planilha não precisam de IA
          const needsAI = batch.filter(r => !r.categoria || r.categoria.trim() === "");
          const hasCategory = batch.filter(r => r.categoria && r.categoria.trim() !== "");

          // Adiciona os que já têm categoria com confiança alta
          for (const r of hasCategory) {
            results.push({
              rowIndex: r.rowIndex,
              categoria: r.categoria!,
              subcategoria: r.subcategoria ?? "",
              confidence: "alta",
              justificativa: "Categoria definida na planilha",
              manualOverride: false,
            });
          }

          if (needsAI.length === 0) continue;

          const productList = needsAI.map((r, idx) =>
            `${idx + 1}. Nome: "${r.nome ?? ""}", Princípio Ativo: "${r.principioAtivo ?? ""}", Fabricante: "${r.fabricante ?? ""}", Apresentação: "${r.apresentacao ?? ""}"`
          ).join("\n");

          const prompt = `Você é um especialista em classificação de produtos veterinários, humanos, agropecuários, farmacêuticos e de construção.

Categorias disponíveis no sistema: ${catNames || "Medicamentos Veterinários, Medicamentos Humanos, Produtos Agro, Rações, Insumos e Materiais"}

Classifique cada produto abaixo com:
- categoria: uma das categorias disponíveis (ou crie uma nova se necessário)
- subcategoria: subcategoria específica (ex: Antiparasitários, Antibióticos, Vacinas, Suplementos, etc.)
- confidence: "alta" (nome/princípio ativo claro), "media" (alguma ambiguidade), "baixa" (dados insuficientes)
- justificativa: uma frase curta explicando a classificação

Produtos:
${productList}

Responda APENAS com JSON array no formato:
[{"idx": 1, "categoria": "...", "subcategoria": "...", "confidence": "alta|media|baixa", "justificativa": "..."}]`;

          try {
            const response = await invokeLLM({
              messages: [
                { role: "system", content: "Você é um especialista em classificação de produtos. Responda apenas com JSON válido." },
                { role: "user", content: prompt },
              ],
              response_format: { type: "json_object" } as any,
            });
            const rawContent = response?.choices?.[0]?.message?.content ?? "[]";
            const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
            let parsed: any[] = [];
            try {
              const obj = JSON.parse(content);
              parsed = Array.isArray(obj) ? obj : (obj.items ?? obj.products ?? obj.result ?? []);
            } catch { parsed = []; }

            for (let j = 0; j < needsAI.length; j++) {
              const r = needsAI[j];
              const aiResult = parsed.find((p: any) => p.idx === j + 1) ?? parsed[j];
              results.push({
                rowIndex: r.rowIndex,
                categoria: aiResult?.categoria ?? "Sem Categoria",
                subcategoria: aiResult?.subcategoria ?? "",
                confidence: (aiResult?.confidence as any) ?? "baixa",
                justificativa: aiResult?.justificativa ?? "Classificação automática",
                manualOverride: false,
              });
            }
          } catch {
            // Fallback: marca como baixa confiança
            for (const r of needsAI) {
              results.push({
                rowIndex: r.rowIndex,
                categoria: "Sem Categoria",
                subcategoria: "",
                confidence: "baixa",
                justificativa: "Erro na classificação automática",
                manualOverride: false,
              });
            }
          }
        }

        // Ordena pelo rowIndex original
        results.sort((a, b) => a.rowIndex - b.rowIndex);
        return results;
      }),

    // ── applyCategoryReviewToCatalog: aplica categorias revisadas aos produtos já existentes no catálogo ──
    applyCategoryReviewToCatalog: protectedProcedure
      .input(
        z.object({
          reviews: z.array(
            z.object({
              nome: z.string(),
              categoria: z.string(),
              subcategoria: z.string().optional(),
            })
          ),
          matchMode: z.enum(["exact", "fuzzy"]).optional().default("fuzzy"),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("DB not available");
        let updated = 0;
        let notFound = 0;
        const errors: string[] = [];

        // Pré-carregar mapa de categorias (nome -> id)
        const existingCats = await db.select({ id: categories.id, name: categories.name }).from(categories);
        const categoryIdMap = new Map<string, number>();
        for (const cat of existingCats) categoryIdMap.set(cat.name.toLowerCase(), cat.id);

        // Função auxiliar para resolver/criar categoria
        const resolveCategoryId = async (catName: string): Promise<number | null> => {
          const key = catName.toLowerCase();
          if (categoryIdMap.has(key)) return categoryIdMap.get(key)!;
          // Criar categoria se não existir
          try {
            const slug = key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const [ins] = await db.insert(categories).values({
              name: catName,
              slug: `${slug}-${Date.now()}`,
              description: `Categoria criada automaticamente na revisão de importação`,
            });
            const newId = (ins as { insertId?: number }).insertId!;
            categoryIdMap.set(key, newId);
            return newId;
          } catch (_) {
            // Pode ter sido criada por outra requisição concorrente
            const refreshed = await db.select({ id: categories.id, name: categories.name }).from(categories).where(sql`LOWER(${categories.name}) = ${key}`);
            if (refreshed.length > 0) { categoryIdMap.set(key, refreshed[0].id); return refreshed[0].id; }
            return null;
          }
        };

        for (const review of input.reviews) {
          try {
            const nomeLower = review.nome.toLowerCase().trim();
            const catId = await resolveCategoryId(review.categoria);
            const setFields = {
              categoryId: catId,
              subcategoria: review.subcategoria ?? null,
              updatedAt: new Date(),
            };

            // Busca por nome exato (case-insensitive)
            const matches = await db
              .select({ id: products.id, name: products.name })
              .from(products)
              .where(sql`LOWER(TRIM(${products.name})) = ${nomeLower}`);

            if (matches.length === 0 && input.matchMode === "fuzzy") {
              // Busca fuzzy: nome contém ou é contido
              const fuzzyMatches = await db
                .select({ id: products.id, name: products.name })
                .from(products)
                .where(sql`LOWER(${products.name}) LIKE ${`%${nomeLower}%`}`);
              if (fuzzyMatches.length > 0) {
                await db
                  .update(products)
                  .set(setFields)
                  .where(eq(products.id, fuzzyMatches[0].id));
                updated++;
              } else {
                notFound++;
              }
            } else if (matches.length > 0) {
              for (const match of matches) {
                await db
                  .update(products)
                  .set(setFields)
                  .where(eq(products.id, match.id));
              }
              updated += matches.length;
            } else {
              notFound++;
            }
          } catch (e: any) {
            errors.push(`Erro ao atualizar "${review.nome}": ${e?.message}`);
          }
        }

        return { success: true, updated, notFound, errors };
      }),

    // ── startBatchImport: inicia importação em lote com progresso em tempo real ──
    startBatchImport: protectedProcedure
      .input(z.object({
        rows: z.array(z.record(z.string(), z.string())).max(3000),
        supplierId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          if (!input.rows || input.rows.length === 0) throw new Error("Array 'rows' não pode estar vazio");
          if (!ctx.user?.id) throw new Error("Usuário não autenticado");
          const { startImportBatchJob } = await import("../jobs/importBatchJob");
          const queueId = await startImportBatchJob(input.rows, input.supplierId, ctx.user.id);
          return { queueId, totalRows: input.rows.length, message: `Importação iniciada com ${input.rows.length} linhas` };
        } catch (error: any) {
          logger.error("[startBatchImport]", error?.message || error);
          throw new Error(`Erro ao iniciar importação: ${error?.message || "Erro desconhecido"}`);
        }
      }),

    // ── getImportProgress: obtém progresso da importação em lote ──
    getImportProgress: protectedProcedure
      .input(z.object({ queueId: z.string().uuid() }))
      .query(async ({ input }) => {
        try {
          const { getImportProgress } = await import("../jobs/importBatchJob");
          const progress = await getImportProgress(input.queueId);
          if (!progress) return { found: false, message: "Importação não encontrada ou expirada" };
          return { found: true, ...progress };
        } catch (error: any) {
          logger.error("[getImportProgress]", error?.message || error);
          throw new Error(`Erro ao obter progresso: ${error?.message || "Erro desconhecido"}`);
        }
      }),
  });
