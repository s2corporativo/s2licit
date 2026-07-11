import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { parseNfeXml, validateNfeData } from "../services/nfeParserService";
import {
  validateSupplierData,
  detectPriceAnomalies,
  generateSupplierStats,
  type PriceUpdate,
} from "../services/nfeSupplierService";
import { processNfeForImport, validateProductsForImport } from "../services/nfeImportService";
import { summarizeBatchImportResults, summarizeBatchPreview } from "../services/nfeBatchImportUtils";
import { createOrGetSupplier, createProductsFromNfe } from "../services/nfeProductImportService";
import { getDb } from "../db";
import { eq, and } from "drizzle-orm";
import { products, suppliers, supplierImports, nfeImports } from "../../drizzle/schema";

const batchXmlFileSchema = z.object({
  fileName: z.string().min(1, "Nome do arquivo obrigatório"),
  xmlContent: z.string().min(1, "Conteúdo XML obrigatório"),
  supplierId: z.number().optional(),
});

function buildNfePreview(nfeData: any) {
  const prices = nfeData.products.map((product: any) => product.unitPrice);
  const totalValue = nfeData.products.reduce((sum: number, product: any) => sum + product.totalPrice, 0);

  const stats = {
    totalProducts: nfeData.products.length,
    totalValue,
    averagePrice: prices.length > 0 ? prices.reduce((sum: number, price: number) => sum + price, 0) / prices.length : 0,
    priceRangeMin: prices.length > 0 ? Math.min(...prices) : 0,
    priceRangeMax: prices.length > 0 ? Math.max(...prices) : 0,
  };

  return {
    nfeNumber: nfeData.nfeNumber,
    supplierName: nfeData.supplierName,
    supplierCnpj: nfeData.supplierCnpj,
    products: nfeData.products.map((product: any) => ({
      id: `${product.productName}-${product.ean || ""}`,
      productName: product.productName,
      ean: product.ean,
      quantity: product.quantity,
      unitPrice: product.unitPrice,
      totalPrice: product.totalPrice,
      unit: product.unit,
    })),
    stats,
    totalValue,
  };
}

function validateBatchNfe(nfeData: any) {
  const validation = validateNfeData(nfeData);
  const supplierValidation = validateSupplierData(nfeData.supplierName, nfeData.supplierCnpj);

  return {
    valid: validation.valid && supplierValidation.valid,
    errors: [...validation.errors, ...supplierValidation.errors],
  };
}

async function upsertNfeImportRecord(db: any, payload: {
  nfeNumber: string;
  supplierName: string;
  supplierCnpj: string;
  supplierId?: number | null;
  totalProducts: number;
  importedProducts: number;
  status: "pending" | "processing" | "completed" | "failed";
  xmlContent?: string;
  importDate: Date;
  notes?: string;
}) {
  try {
    // Chave composta: mesmo número de NFe pode existir para fornecedores diferentes
    const existing = await db
      .select({ id: nfeImports.id })
      .from(nfeImports)
      .where(
        and(
          eq(nfeImports.nfeNumber, payload.nfeNumber),
          eq(nfeImports.supplierCnpj, payload.supplierCnpj)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(nfeImports)
        .set({
          supplierName: payload.supplierName,
          supplierCnpj: payload.supplierCnpj,
          supplierId: payload.supplierId ?? null,
          totalProducts: payload.totalProducts,
          importedProducts: payload.importedProducts,
          status: payload.status,
          xmlContent: payload.xmlContent,
          importDate: payload.importDate,
          notes: payload.notes,
        })
        .where(eq(nfeImports.id, existing[0].id));

      return { reusedExisting: true };
    }

    await db.insert(nfeImports).values({
      nfeNumber: payload.nfeNumber,
      supplierName: payload.supplierName,
      supplierCnpj: payload.supplierCnpj,
      supplierId: payload.supplierId ?? null,
      totalProducts: payload.totalProducts,
      importedProducts: payload.importedProducts,
      status: payload.status,
      xmlContent: payload.xmlContent,
      importDate: payload.importDate,
      notes: payload.notes,
    });

    return { reusedExisting: false };
  } catch (error) {
    console.warn(`[upsertNfeImportRecord] Tabela nfe_imports não disponível, continuando sem persistência:`, error instanceof Error ? error.message : String(error));
    return { reusedExisting: false, skipped: true };
  }
}

export const nfeImportRouter = router({
  /**
   * Preview NFe import without saving
   */
  previewNfeImport: protectedProcedure
    .input(
      z.object({
        xmlContent: z.string().min(1, "XML content required"),
      })
    )
    .mutation(async ({ input }: { input: { xmlContent: string } }) => {
      try {
        // Parse XML
        const nfeData = await parseNfeXml(input.xmlContent);

        // Validate NFe data
        const validation = validateNfeData(nfeData);
        if (!validation.valid) {
          return {
            success: false,
            error: `Validação falhou: ${validation.errors.join(", ")}`,
          };
        }

        // Validate supplier data
        const supplierValidation = validateSupplierData(
          nfeData.supplierName,
          nfeData.supplierCnpj
        );
        if (!supplierValidation.valid) {
          return {
            success: false,
            error: `Fornecedor inválido: ${supplierValidation.errors.join(", ")}`,
          };
        }

        const preview = buildNfePreview(nfeData);

        return {
          success: true,
          preview,
        };
      } catch (error) {
        return {
          success: false,
          error: `Erro ao processar NFe: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }),

  /**
   * Import NFe with supplier and save to database
   */
  importNfeWithSupplier: protectedProcedure
    .input(
      z.object({
        xmlContent: z.string().min(1, "XML content required"),
        supplierId: z.number().optional(),
        selectedProductIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }: { input: { xmlContent: string; supplierId?: number; selectedProductIds?: string[] } }) => {
      const db = await getDb();
      if (!db) return { success: false, error: "Database unavailable" };

      try {
        // Parse XML
        const nfeData = await parseNfeXml(input.xmlContent);

        // Validate data
        const validation = validateNfeData(nfeData);
        if (!validation.valid) {
          return {
            success: false,
            error: `Validação falhou: ${validation.errors.join(", ")}`,
          };
        }

        const supplierValidation = validateSupplierData(
          nfeData.supplierName,
          nfeData.supplierCnpj
        );
        if (!supplierValidation.valid) {
          return {
            success: false,
            error: `Fornecedor inválido: ${supplierValidation.errors.join(", ")}`,
          };
        }

        // Filter selected products
        const productsToImport =
          input.selectedProductIds && input.selectedProductIds.length > 0
            ? nfeData.products.filter(p =>
                input.selectedProductIds?.includes(`${p.productName}-${p.ean || ""}`)
              )
            : nfeData.products;

        // Validate products for import
        const productValidation = validateProductsForImport(
          productsToImport.map(p => ({
            ...p,
            matchStatus: "new" as const,
          }))
        );

        let supplierId = input.supplierId;
        let supplierCreated = false;
        if (!supplierId) {
          try {
            const supplierResult = await createOrGetSupplier(nfeData.supplierName);
            supplierId = supplierResult.id;
            supplierCreated = supplierResult.isNew;
          } catch (err) {
            console.warn("[importNfeWithSupplier] Erro ao criar fornecedor:", err instanceof Error ? err.message : String(err));
          }
        }

        let createdProducts = [];
        if (supplierId && productsToImport.length > 0) {
          try {
            createdProducts = await createProductsFromNfe(supplierId, productsToImport.map(p => ({
              productName: p.productName,
              ean: p.ean,
              quantity: p.quantity,
              unitPrice: p.unitPrice,
              totalPrice: p.totalPrice,
              unit: p.unit,
            })));
          } catch (err) {
            console.warn("[importNfeWithSupplier] Erro ao criar produtos:", err instanceof Error ? err.message : String(err));
          }
        }

        const persistResult = await upsertNfeImportRecord(db, {
          nfeNumber: nfeData.nfeNumber,
          supplierName: nfeData.supplierName,
          supplierCnpj: nfeData.supplierCnpj,
          supplierId: supplierId || null,
          totalProducts: productsToImport.length,
          importedProducts: createdProducts.length,
          status: "completed",
          xmlContent: nfeData.rawXml ?? input.xmlContent,
          importDate: new Date(),
          notes: `Fornecedor: ${supplierCreated ? "criado" : "existente"} | Produtos: ${createdProducts.length}`,
        });

        return {
          success: true,
          message: persistResult.reusedExisting ? "NFe atualizada com sucesso" : "NFe importada com sucesso",
          nfeNumber: nfeData.nfeNumber,
          supplierName: nfeData.supplierName,
          supplierCnpj: nfeData.supplierCnpj,
          supplierId,
          supplierCreated,
          productsImported: createdProducts.length,
          totalValue: productsToImport.reduce((sum, p) => sum + p.totalPrice, 0),
          warnings: productValidation.warnings,
        };
      } catch (error) {
        return {
          success: false,
          error: `Erro ao importar NFe: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }),

  previewBatchXmlImport: protectedProcedure
    .input(
      z.object({
        files: z.array(batchXmlFileSchema).min(1, "Selecione ao menos um XML").max(30, "Limite de 30 arquivos por lote"),
      })
    )
    .mutation(async ({ input }: { input: { files: Array<{ fileName: string; xmlContent: string; supplierId?: number }> } }) => {
      const files = [] as Array<{
        index: number;
        fileName: string;
        status: "ready" | "error";
        nfeNumber?: string;
        supplierName?: string;
        supplierCnpj?: string;
        productsCount: number;
        totalValue: number;
        errors: string[];
      }>;

      for (const [index, file] of input.files.entries()) {
        try {
          const nfeData = await parseNfeXml(file.xmlContent);
          const validation = validateBatchNfe(nfeData);

          if (!validation.valid) {
            files.push({
              index,
              fileName: file.fileName,
              status: "error",
              productsCount: 0,
              totalValue: 0,
              errors: validation.errors,
            });
            continue;
          }

          const preview = buildNfePreview(nfeData);
          files.push({
            index,
            fileName: file.fileName,
            status: "ready",
            nfeNumber: preview.nfeNumber,
            supplierName: preview.supplierName,
            supplierCnpj: preview.supplierCnpj,
            productsCount: preview.products.length,
            totalValue: preview.totalValue,
            errors: [],
          });
        } catch (error) {
          files.push({
            index,
            fileName: file.fileName,
            status: "error",
            productsCount: 0,
            totalValue: 0,
            errors: [error instanceof Error ? error.message : "Erro desconhecido ao processar XML"],
          });
        }
      }

      return {
        success: true,
        files,
        summary: summarizeBatchPreview(files),
      };
    }),

  importBatchXml: protectedProcedure
    .input(
      z.object({
        files: z.array(batchXmlFileSchema).min(1, "Selecione ao menos um XML").max(30, "Limite de 30 arquivos por lote"),
        selectedIndexes: z.array(z.number().int().nonnegative()).optional(),
      })
    )
    .mutation(async ({ input }: { input: { files: Array<{ fileName: string; xmlContent: string; supplierId?: number }>; selectedIndexes?: number[] } }) => {
      const db = await getDb();
      if (!db) return { success: false, error: "Database unavailable" };

      const indexedFiles = input.files.map((file, index) => ({ ...file, index }));
      const filesToImport = input.selectedIndexes && input.selectedIndexes.length > 0
        ? indexedFiles.filter((file) => input.selectedIndexes?.includes(file.index))
        : indexedFiles;

      const results = [] as Array<{
        index: number;
        fileName: string;
        status: "imported" | "failed";
        nfeNumber?: string;
        supplierName?: string;
        supplierCnpj?: string;
        importedProducts: number;
        totalValue: number;
        warnings: string[];
        error?: string;
      }>;

      for (const file of filesToImport) {
        try {
          const nfeData = await parseNfeXml(file.xmlContent);
          const validation = validateBatchNfe(nfeData);

          if (!validation.valid) {
            results.push({
              index: file.index,
              fileName: file.fileName,
              status: "failed",
              importedProducts: 0,
              totalValue: 0,
              warnings: [],
              error: validation.errors.join(", "),
            });
            continue;
          }

          const productsToImport = nfeData.products;
          const productValidation = validateProductsForImport(
            productsToImport.map((product: any) => ({
              ...product,
              matchStatus: "new" as const,
            }))
          );

          // Criar ou obter fornecedor
          let supplierId = file.supplierId;
          let supplierCreated = false;
          if (!supplierId) {
            try {
              const supplierResult = await createOrGetSupplier(nfeData.supplierName);
              supplierId = supplierResult.id;
              supplierCreated = supplierResult.isNew;
            } catch (err) {
              console.warn("[importBatchXml] Erro ao criar fornecedor:", err instanceof Error ? err.message : String(err));
            }
          }

          // Criar produtos
          let createdProducts = [];
          if (supplierId && productsToImport.length > 0) {
            try {
              createdProducts = await createProductsFromNfe(supplierId, productsToImport.map((p: any) => ({
                productName: p.productName,
                ean: p.ean,
                quantity: p.quantity,
                unitPrice: p.unitPrice,
                totalPrice: p.totalPrice,
                unit: p.unit,
              })));
            } catch (err) {
              console.warn("[importBatchXml] Erro ao criar produtos:", err instanceof Error ? err.message : String(err));
            }
          }

          await upsertNfeImportRecord(db, {
            nfeNumber: nfeData.nfeNumber,
            supplierName: nfeData.supplierName,
            supplierCnpj: nfeData.supplierCnpj,
            supplierId: supplierId || null,
            totalProducts: productsToImport.length,
            importedProducts: createdProducts.length,
            status: "completed",
            xmlContent: nfeData.rawXml ?? file.xmlContent,
            importDate: new Date(),
            notes: `Fornecedor: ${supplierCreated ? "criado" : "existente"} | Produtos: ${createdProducts.length} | ${productValidation.warnings.join("; ")}`,
          });

          results.push({
            index: file.index,
            fileName: file.fileName,
            status: "imported",
            nfeNumber: nfeData.nfeNumber,
            supplierName: nfeData.supplierName,
            supplierCnpj: nfeData.supplierCnpj,
            importedProducts: createdProducts.length,
            totalValue: productsToImport.reduce((sum: number, product: any) => sum + product.totalPrice, 0),
            warnings: productValidation.warnings,
          });
        } catch (error) {
          results.push({
            index: file.index,
            fileName: file.fileName,
            status: "failed",
            importedProducts: 0,
            totalValue: 0,
            warnings: [],
            error: error instanceof Error ? error.message : "Erro desconhecido ao importar XML",
          });
        }
      }

      const summary = summarizeBatchImportResults(results.map((result) => ({
        status: result.status,
        importedProducts: result.importedProducts,
      })));

      return {
        success: summary.importedFiles > 0,
        summary,
        results,
      };
    }),

  /**
   * Link NFe products with existing master products
   */
  linkNfeProductsWithMaster: protectedProcedure
    .input(
      z.object({
        nfeNumber: z.string(),
        productMappings: z.array(
          z.object({
            nfeProductId: z.string(),
            masterId: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ input }: { input: { nfeNumber: string; productMappings: Array<{ nfeProductId: string; masterId: number }> } }) => {
      const db = await getDb();
      if (!db) return { success: false, error: "Database unavailable" };

      try {
        // Get NFe import record
        const nfeImport = await db
          .select()
          .from(nfeImports)
          .where(eq(nfeImports.nfeNumber, input.nfeNumber))
          .limit(1);

        if (!nfeImport || nfeImport.length === 0) {
          return { success: false, error: "NFe import not found" };
        }

        // O vínculo exigiria um campo nfeProductId na tabela de produtos,
        // que não existe no schema — não fingir sucesso.
        throw new TRPCError({
          code: "METHOD_NOT_SUPPORTED",
          message: "Funcionalidade ainda não implementada: o vínculo de produtos da NFe com master products não está disponível.",
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        return {
          success: false,
          error: `Erro ao vincular produtos: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }),

  /**
   * Get NFe import history
   */
  getImportHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(10),
        offset: z.number().default(0),
        supplierId: z.number().optional(),
      })
    )
    .query(async ({ input }: { input: { limit: number; offset: number; supplierId?: number } }) => {
      const db = await getDb();
      if (!db) return { imports: [], total: 0, limit: input.limit, offset: input.offset };

      try {
        const baseQuery = db.select().from(nfeImports);

        const imports = await (input.supplierId
          ? baseQuery.where(eq(nfeImports.supplierId, input.supplierId))
          : baseQuery)
          .limit(input.limit)
          .offset(input.offset)
          .execute();
        const countResult = await db.select().from(nfeImports).execute();

        return {
          imports: imports.map(imp => ({
            id: imp.id,
            nfeNumber: imp.nfeNumber,
            supplierName: imp.supplierName,
            supplierCnpj: imp.supplierCnpj,
            totalProducts: imp.totalProducts,
            importedProducts: imp.importedProducts,
            status: imp.status,
            importDate: imp.importDate,
          })),
          total: countResult.length,
          limit: input.limit,
          offset: input.offset,
        };
      } catch (error) {
        return {
          imports: [],
          total: 0,
          limit: input.limit,
          offset: input.offset,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Get NFe import details
   */
  getImportDetails: protectedProcedure
    .input(z.object({ importId: z.number() }))
    .query(async ({ input }: { input: { importId: number } }) => {
      const db = await getDb();
      if (!db) return { importId: input.importId, details: null };

      try {
        const importRecord = await db
          .select()
          .from(nfeImports)
          .where(eq(nfeImports.id, input.importId))
          .limit(1);

        if (!importRecord || importRecord.length === 0) {
          return { importId: input.importId, details: null };
        }

        const imp = importRecord[0];
        return {
          importId: input.importId,
          details: {
            id: imp.id,
            nfeNumber: imp.nfeNumber,
            supplierName: imp.supplierName,
            supplierCnpj: imp.supplierCnpj,
            totalProducts: imp.totalProducts,
            importedProducts: imp.importedProducts,
            status: imp.status,
            importDate: imp.importDate,
            notes: imp.notes,
            xmlContent: imp.xmlContent,
          },
        };
      } catch (error) {
        return {
          importId: input.importId,
          details: null,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Delete NFe import record
   */
  deleteImport: protectedProcedure
    .input(z.object({ importId: z.number() }))
    .mutation(async ({ input }: { input: { importId: number } }) => {
      const db = await getDb();
      if (!db) return { success: false, error: "Database unavailable" };

      try {
        await db.delete(nfeImports).where(eq(nfeImports.id, input.importId));

        return {
          success: true,
          message: "NFe import deleted successfully",
        };
      } catch (error) {
        return {
          success: false,
          error: `Erro ao deletar importação: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }),

  /**
   * Get price anomalies from NFe import
   */
  getPriceAnomalies: protectedProcedure
    .input(z.object({ importId: z.number() }))
    .query(async ({ input }: { input: { importId: number } }) => {
      const db = await getDb();
      if (!db) return { anomalies: [], total: 0 };

      try {
        const importRecord = await db
          .select()
          .from(nfeImports)
          .where(eq(nfeImports.id, input.importId))
          .limit(1);

        if (!importRecord || importRecord.length === 0) {
          return { anomalies: [], total: 0 };
        }

        const imp = importRecord[0];
        if (!imp.xmlContent) {
          return { anomalies: [], total: 0 };
        }

        // Parse XML to get products
        const nfeData = await parseNfeXml(imp.xmlContent);

        // Convert products to PriceUpdate format for anomaly detection
        const priceUpdates: PriceUpdate[] = nfeData.products.map((p: any) => ({
          productId: p.id || '',
          supplierId: imp.supplierId?.toString() || '',
          oldPrice: 0,
          newPrice: p.unitPrice || 0,
          priceChange: p.unitPrice || 0,
          priceChangePercentage: 0,
        }));

        // Detect price anomalies
        const anomalies = detectPriceAnomalies(priceUpdates);

        return {
          anomalies: anomalies.map(a => ({
            productId: a.productId,
            type: a.type,
            percentage: a.percentage,
          })),
          total: anomalies.length,
        };
      } catch (error) {
        return {
          anomalies: [],
          total: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),
});
