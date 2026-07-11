import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  detectDuplicatesInBatch,
  prepareConsolidatedForImport,
  calculateConsolidationStats,
  type ImportProduct,
} from "../services/importConsolidationService";
import { createProduct, updateProduct, getDb } from "../db";
import { productSupplierOffers } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Router para importação com consolidação automática
 * Detecta duplicatas e agrupa preços por fornecedor
 */

async function upsertSupplierOffer(
  productId: number,
  supplierId: number,
  price?: string,
  supplierCode?: string,
  link?: string
) {
  const db = await getDb();
  if (!db) return;

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
    await db
      .update(productSupplierOffers)
      .set({
        price: price !== undefined ? price : undefined,
        supplierCode: supplierCode ?? undefined,
        link: link ?? undefined,
      })
      .where(eq(productSupplierOffers.id, existing[0].id));
  } else {
    await db.insert(productSupplierOffers).values({
      productId,
      supplierId,
      price: price !== undefined ? price : undefined,
      supplierCode: supplierCode ?? undefined,
      link: link ?? undefined,
    });
  }
}

export const importConsolidatedRouter = router({
  /**
   * Importação com consolidação automática
   * Detecta duplicatas, agrupa preços por fornecedor e retorna relatório
   */
  importWithConsolidation: protectedProcedure
    .input(
      z.object({
        products: z
          .array(
            z.object({
              name: z.string(),
              activeIngredient: z.string().optional(),
              concentration: z.string().optional(),
              presentation: z.string().optional(),
              manufacturer: z.string().optional(),
              supplierId: z.number().optional(),
              supplierName: z.string().optional(),
              price: z.string().optional(),
              code: z.string().optional(),
              imageUrl: z.string().optional(),
              productUrl: z.string().optional(),
              categoryId: z.number().optional(),
              fichaTecnica: z.string().optional(),
              tipoCatalogo: z.string().optional(),
              ean: z.string().optional(),
            })
          )
          .max(3000),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Etapa 1: Detectar duplicatas no lote
        const consolidationReport = detectDuplicatesInBatch(input.products);

        // Etapa 2: Preparar dados consolidados
        const consolidated = prepareConsolidatedForImport(input.products);

        // Etapa 3: Calcular estatísticas
        const stats = calculateConsolidationStats(consolidationReport);

        // Etapa 4: Salvar produtos consolidados
        const importResults = {
          total: consolidated.length,
          created: 0,
          updated: 0,
          errors: 0,
          consolidationReport,
          stats,
          details: [] as Array<{
            action: string;
            name: string;
            productId?: number;
            suppliers?: number;
            error?: string;
          }>,
        };

        for (const product of consolidated) {
          try {
            // Verificar se produto já existe
            const db = await getDb();
            if (!db) {
              importResults.errors++;
              importResults.details.push({
                action: "erro",
                name: product.name,
                error: "Conexão com banco de dados falhou",
              });
              continue;
            }

            // Buscar produto existente por nome
            const { products: productsTable } = await import("../../drizzle/schema");
            const existing = await db
              .select()
              .from(productsTable)
              .where(eq(productsTable.name, product.name))
              .limit(1);
            
            const existingProduct = existing[0] || null;

            let productId: number;

            if (existingProduct) {
              // Atualizar produto existente
              await updateProduct(existingProduct.id, {
                activeIngredient: product.activeIngredient ?? existingProduct.activeIngredient,
                presentation: product.presentation ?? existingProduct.presentation,
                manufacturer: product.manufacturer ?? existingProduct.manufacturer,
                imageUrl: product.imageUrl ?? (existingProduct as any).imageUrl,
                productUrl: product.productUrl ?? (existingProduct as any).productUrl,
              } as any);

              productId = existingProduct.id;
              importResults.updated++;
              importResults.details.push({
                action: "atualizar_existente",
                name: product.name,
                productId,
                suppliers: product.consolidatedPrices.size,
              });
            } else {
              // Criar novo produto
              const created = await createProduct({
                name: product.name,
                activeIngredient: product.activeIngredient ?? null,
                concentration: product.concentration ?? null,
                presentation: product.presentation ?? null,
                manufacturer: product.manufacturer ?? null,
                fichaTecnica: product.fichaTecnica ?? null,
                categoryId: product.categoryId ?? null,
                imageUrl: product.imageUrl ?? null,
                productUrl: product.productUrl ?? null,
                ean: product.ean ?? null,
                isActive: "yes",
              } as any);

              productId = (created as any).insertId;
              importResults.created++;
              importResults.details.push({
                action: "criar_novo",
                name: product.name,
                productId,
                suppliers: product.consolidatedPrices.size,
              });
            }

            // Vincular preços de todos os fornecedores consolidados
            // Aguardar todas as promises para que falhas sejam contabilizadas como erro
            const offerPromises: Promise<unknown>[] = [];
            product.consolidatedPrices.forEach((price, supplierId) => {
              if (supplierId > 0) {
                offerPromises.push(
                  upsertSupplierOffer(productId, supplierId, price, product.code, product.productUrl ?? undefined)
                );
              }
            });
            await Promise.all(offerPromises);
          } catch (error) {
            importResults.errors++;
            importResults.details.push({
              action: "erro",
              name: product.name,
              error: error instanceof Error ? error.message : "Erro desconhecido",
            });
          }
        }

        return importResults;
      } catch (error) {
        console.error("Error in importWithConsolidation:", error);
        throw new Error("Falha na importação com consolidação");
      }
    }),

  /**
   * Preview: Detecta duplicatas sem salvar
   * Útil para revisar consolidações antes de confirmar
   */
  previewConsolidation: protectedProcedure
    .input(
      z.object({
        products: z
          .array(
            z.object({
              name: z.string(),
              activeIngredient: z.string().optional(),
              concentration: z.string().optional(),
              presentation: z.string().optional(),
              manufacturer: z.string().optional(),
              supplierId: z.number().optional(),
              supplierName: z.string().optional(),
              price: z.string().optional(),
            })
          )
          .max(3000),
      })
    )
    .query(({ input }) => {
      try {
        const consolidationReport = detectDuplicatesInBatch(input.products);
        const stats = calculateConsolidationStats(consolidationReport);

        return {
          consolidationReport,
          stats,
          previewData: {
            willCreateProducts: consolidationReport.uniqueProducts,
            willConsolidateDuplicates: consolidationReport.duplicatesFound,
            totalSuppliersInImport: consolidationReport.newSuppliers.length,
            productsWithMultipleSuppliers: consolidationReport.consolidatedGroups.filter(
              (g: any) => g.suppliers.length > 1
            ).length,
          },
        }
      } catch (error) {
        console.error("Error in previewConsolidation:", error);
        throw new Error("Falha ao visualizar consolidação");
      }
    }),
});
