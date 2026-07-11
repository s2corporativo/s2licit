import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { detectDuplicate } from "./deduplicationEngine";
import { getDb, createProduct, updateProduct } from "./db";
import { products, productSupplierOffers } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Tipos de ação do motor de deduplicação ───────────────────────────────────
const BATCH_SIZE = 100; // processar em lotes de 100

// ─── Helper: upsert de oferta de fornecedor ───────────────────────────────────
async function upsertSupplierOffer(
  productId: number,
  supplierId: number,
  price?: number,
  supplierCode?: string,
  link?: string,
  image?: string
) {
  const db = await getDb();
  if (!db) return;

  // Verificar se já existe oferta para este par produto+fornecedor
  const existing = await db
    .select({ id: productSupplierOffers.id })
    .from(productSupplierOffers)
    .where(
      and(
        eq(productSupplierOffers.productId, productId),
        eq(productSupplierOffers.supplierId, supplierId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Atualizar oferta existente
    await db
      .update(productSupplierOffers)
      .set({
        price: price !== undefined ? String(price) : undefined,
        supplierCode: supplierCode ?? undefined,
        link: link ?? undefined,
        image: image ?? undefined,
      })
      .where(eq(productSupplierOffers.id, existing[0].id));
  } else {
    // Criar nova oferta
    await db.insert(productSupplierOffers).values({
      productId,
      supplierId,
      price: price !== undefined ? String(price) : undefined,
      supplierCode: supplierCode ?? undefined,
      link: link ?? undefined,
      image: image ?? undefined,
    });
  }
}

export const importSmartRouter = router({
  /**
   * Importação inteligente com deduplicação — executa ações reais no banco.
   * Suporta até 3.000 itens por chamada, processados em lotes de 100.
   */
  importWithDeduplication: protectedProcedure
    .input(
      z.object({
        products: z
          .array(
            z.object({
              name: z.string(),
              principioAtivo: z.string().optional(),
              concentracao: z.string().optional(),
              formaFarmaceutica: z.string().optional(),
              fabricante: z.string().optional(),
              categoria: z.string().optional(),
              fichaTecnica: z.string().optional(),
              tipoCatalogo: z
                .enum([
                  "medicamento_veterinario",
                  "medicamento_humano",
                  "produto_nao_medicamentoso",
                  "material_insumo_equipamento",
                ])
                .optional(),
              ean: z.string().optional(),
              supplierId: z.number().optional(),
              categoryId: z.number().optional(),
              price: z.number().optional(),
              code: z.string().optional(),
              imageUrl: z.string().optional(),
              productUrl: z.string().optional(),
              presentation: z.string().optional(),
              manufacturer: z.string().optional(),
            })
          )
          .max(3000),
      })
    )
    .mutation(async ({ input }) => {
      const results = {
        total: input.products.length,
        created: 0,
        updated: 0,
        newSupplier: 0,
        priceUpdated: 0,
        reviewNeeded: 0,
        errors: 0,
        details: [] as Array<{
          action: string;
          name: string;
          productId?: number;
          confidence?: number;
          reason?: string;
          error?: string;
        }>,
      };

      // Processar em lotes de BATCH_SIZE
      for (let batchStart = 0; batchStart < input.products.length; batchStart += BATCH_SIZE) {
        const batch = input.products.slice(batchStart, batchStart + BATCH_SIZE);

        // Processar lote em paralelo (5 simultâneos)
        const PARALLEL = 5;
        for (let i = 0; i < batch.length; i += PARALLEL) {
          const chunk = batch.slice(i, i + PARALLEL);
          await Promise.all(
            chunk.map(async (product) => {
              try {
                const analysis = await detectDuplicate({
                  name: product.name,
                  principioAtivo: product.principioAtivo,
                  concentracao: product.concentracao,
                  formaFarmaceutica: product.formaFarmaceutica,
                  fabricante: product.fabricante ?? product.manufacturer,
                  categoria: product.categoria,
                  fichaTecnica: product.fichaTecnica,
                  tipoCatalogo: product.tipoCatalogo,
                  ean: product.ean,
                  supplierId: product.supplierId,
                });

                switch (analysis.action) {
                  case "criar_novo": {
                    // Criar produto novo
                    const created = await createProduct({
                      name: product.name,
                      activeIngredient: product.principioAtivo ?? null,
                      concentration: product.concentracao ?? null,
                      presentation: product.presentation ?? null,
                      pharmaceuticalForm: product.formaFarmaceutica ?? null,
                      manufacturer: product.fabricante ?? product.manufacturer ?? null,
                      fichaTecnica: product.fichaTecnica ?? null,
                      tipoCatalogo: product.tipoCatalogo ?? "produto_nao_medicamentoso",
                      statusConfiabilidade: "incompleto",
                      ean: product.ean ?? null,
                      supplierId: product.supplierId ?? null,
                      categoryId: product.categoryId ?? null,
                      price: product.price !== undefined ? String(product.price) : null,
                      code: product.code ?? null,
                      imageUrl: product.imageUrl ?? null,
                      productUrl: product.productUrl ?? null,
                      isActive: "yes",
                    } as any);

                    // Se tem fornecedor e preço, criar oferta
                    if (product.supplierId && product.price !== undefined) {
                      const newId = (created as any).insertId;
                      if (newId) {
                        await upsertSupplierOffer(
                          newId,
                          product.supplierId,
                          product.price,
                          product.code,
                          product.productUrl
                        );
                      }
                    }

                    results.created++;
                    results.details.push({
                      action: "criar_novo",
                      name: product.name,
                      confidence: analysis.confidence,
                    });
                    break;
                  }

                  case "atualizar_existente": {
                    if (!analysis.matchedProductId) break;
                    // Atualizar produto existente com dados novos (sem sobrescrever campos preenchidos)
                    await updateProduct(analysis.matchedProductId, {
                      ...(product.principioAtivo && { activeIngredient: product.principioAtivo }),
                      ...(product.concentracao && { concentration: product.concentracao }),
                      ...(product.presentation && { presentation: product.presentation }),
                      ...(product.formaFarmaceutica && { pharmaceuticalForm: product.formaFarmaceutica }),
                      ...(product.fabricante || product.manufacturer
                        ? { manufacturer: product.fabricante ?? product.manufacturer }
                        : {}),
                      ...(product.fichaTecnica && { fichaTecnica: product.fichaTecnica }),
                      ...(product.imageUrl && { imageUrl: product.imageUrl }),
                      ...(product.productUrl && { productUrl: product.productUrl }),
                      statusConfiabilidade: "completo_nao_validado",
                    } as any);

                    // Atualizar oferta do fornecedor se houver
                    if (product.supplierId) {
                      await upsertSupplierOffer(
                        analysis.matchedProductId,
                        product.supplierId,
                        product.price,
                        product.code,
                        product.productUrl
                      );
                    }

                    results.updated++;
                    results.details.push({
                      action: "atualizar_existente",
                      name: product.name,
                      productId: analysis.matchedProductId,
                      confidence: analysis.confidence,
                    });
                    break;
                  }

                  case "novo_fornecedor": {
                    if (!analysis.matchedProductId || !product.supplierId) break;
                    // Vincular novo fornecedor ao produto existente
                    await upsertSupplierOffer(
                      analysis.matchedProductId,
                      product.supplierId,
                      product.price,
                      product.code,
                      product.productUrl
                    );

                    results.newSupplier++;
                    results.details.push({
                      action: "novo_fornecedor",
                      name: product.name,
                      productId: analysis.matchedProductId,
                      confidence: analysis.confidence,
                    });
                    break;
                  }

                  case "atualizar_preco": {
                    if (!analysis.matchedProductId || !product.supplierId) break;
                    // Atualizar apenas o preço do fornecedor
                    await upsertSupplierOffer(
                      analysis.matchedProductId,
                      product.supplierId,
                      product.price,
                      product.code
                    );

                    // Atualizar também o preço direto no produto (campo legado)
                    if (product.price !== undefined) {
                      await updateProduct(analysis.matchedProductId, {
                        price: String(product.price),
                      } as any);
                    }

                    results.priceUpdated++;
                    results.details.push({
                      action: "atualizar_preco",
                      name: product.name,
                      productId: analysis.matchedProductId,
                      confidence: analysis.confidence,
                    });
                    break;
                  }

                  case "revisar_manual": {
                    // Marcar produto existente como pendente de revisão
                    if (analysis.matchedProductId) {
                      await updateProduct(analysis.matchedProductId, {
                        statusConfiabilidade: "pendente_revisao",
                      } as any);
                    }

                    results.reviewNeeded++;
                    results.details.push({
                      action: "revisar_manual",
                      name: product.name,
                      productId: analysis.matchedProductId,
                      confidence: analysis.confidence,
                      reason: analysis.reason,
                    });
                    break;
                  }
                }
              } catch (error) {
                results.errors++;
                results.details.push({
                  action: "erro",
                  name: product.name,
                  error: (error as Error).message,
                });
              }
            })
          );
        }
      }

      return results;
    }),

  /**
   * Gerar relatório de importação por lote
   */
  getImportReport: protectedProcedure
    .input(
      z.object({
        importBatchId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const { eq } = await import("drizzle-orm");

      const allProducts = await db
        .select({
          id: products.id,
          tipoCatalogo: products.tipoCatalogo,
          statusConfiabilidade: products.statusConfiabilidade,
        })
        .from(products)
        .where(eq(products.importBatchId, input.importBatchId));

      const grouped: Record<string, { tipoCatalogo: string; statusConfiabilidade: string; total: number }> = {};

      for (const p of allProducts) {
        const key = `${p.tipoCatalogo}|${p.statusConfiabilidade}`;
        if (!grouped[key]) {
          grouped[key] = {
            tipoCatalogo: p.tipoCatalogo ?? "desconhecido",
            statusConfiabilidade: p.statusConfiabilidade ?? "desconhecido",
            total: 0,
          };
        }
        grouped[key].total++;
      }

      const stats = Object.values(grouped);
      const total = allProducts.length;

      return {
        importBatchId: input.importBatchId,
        stats,
        summary: {
          total,
          byType: stats.reduce(
            (acc, s) => {
              acc[s.tipoCatalogo] = (acc[s.tipoCatalogo] || 0) + s.total;
              return acc;
            },
            {} as Record<string, number>
          ),
          byStatus: stats.reduce(
            (acc, s) => {
              acc[s.statusConfiabilidade] = (acc[s.statusConfiabilidade] || 0) + s.total;
              return acc;
            },
            {} as Record<string, number>
          ),
        },
      };
    }),

  /**
   * Listar produtos pendentes de revisão manual
   */
  listPendingReview: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const { eq, sql } = await import("drizzle-orm");

      const pending = await db
        .select({
          id: products.id,
          name: products.name,
          tipoCatalogo: products.tipoCatalogo,
          statusConfiabilidade: products.statusConfiabilidade,
          manufacturer: products.manufacturer,
          activeIngredient: products.activeIngredient,
          concentration: products.concentration,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .where(eq(products.statusConfiabilidade, "pendente_revisao"))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db
        .select({ total: sql<number>`COUNT(*)` })
        .from(products)
        .where(eq(products.statusConfiabilidade, "pendente_revisao"));

      return {
        items: pending,
        total: Number(countResult?.total ?? 0),
      };
    }),

  /**
   * Aprovar revisão manual de um produto (marca como completo_nao_validado)
   */
  approveReview: protectedProcedure
    .input(z.object({ productId: z.number() }))
    .mutation(async ({ input }) => {
      await updateProduct(input.productId, {
        statusConfiabilidade: "completo_nao_validado",
      } as any);
      return { success: true };
    }),
});
