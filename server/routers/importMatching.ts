import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  processImportedProductsWithMatching,
  calculateImportMatchingStats,
  validateImportedProductsForMatching,
  detectDuplicatesInImportBatch,
  generateImportMatchingReport,
} from "../services/importMatchingService";
import { listMasterProducts } from "../db";

export const importMatchingRouter = router({
  /**
   * Preview de importação com matching automático
   * Não salva no banco, apenas mostra o que seria feito
   */
  previewImportWithMatching: protectedProcedure
    .input(
      z.object({
        products: z.array(
          z.object({
            name: z.string().min(1),
            ean: z.string().optional().nullable(),
            codigoMapa: z.string().optional().nullable(),
            concentration: z.string().optional().nullable(),
            presentation: z.string().optional().nullable(),
            manufacturer: z.string().optional().nullable(),
            price: z.number().optional().nullable(),
            supplierId: z.number().optional().nullable(),
            supplierName: z.string().optional().nullable(),
          })
        ),
        minSimilarity: z.number().min(0).max(1).default(0.7),
      })
    )
    .query(async ({ input }) => {
      try {
        // Validar produtos importados
        const { valid, invalid } = validateImportedProductsForMatching(input.products);

        if (invalid.length > 0) {
          return {
            success: false,
            message: `${invalid.length} produto(s) inválido(s)`,
            report: null,
            warnings: invalid.map(i => i.reason),
          };
        }

        // Detectar duplicatas no lote
        const { duplicates: duplicatesInBatch } = detectDuplicatesInImportBatch(valid);

        // Obter Master Products
        const masterProducts = await listMasterProducts();

        if (!masterProducts || masterProducts.length === 0) {
          return {
            success: false,
            message: "Nenhum Master Product disponível para matching",
            report: null,
            warnings: [],
          };
        }

        // Processar matching
        const existingProducts = new Map();
        const results = await processImportedProductsWithMatching(valid, masterProducts as any, existingProducts, input.minSimilarity);

        // Calcular estatísticas
        const stats = await calculateImportMatchingStats(results);

        // Gerar relatório
        const warnings: string[] = [];
        if (duplicatesInBatch.length > 0) {
          warnings.push(`${duplicatesInBatch.length} duplicata(s) detectada(s) no lote`);
        }

        const report = await generateImportMatchingReport(results, stats, duplicatesInBatch.length, warnings);

        return {
          success: true,
          message: `Preview concluído: ${stats.newProducts} novo(s), ${stats.updatedProducts} atualização(ões)`,
          report,
          warnings,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          message: `Erro ao processar preview: ${errorMessage}`,
          report: null,
          warnings: [],
        };
      }
    }),

  /**
   * Importar com matching automático e salvar no banco
   */
  importWithMatching: protectedProcedure
    .input(
      z.object({
        products: z.array(
          z.object({
            name: z.string().min(1),
            ean: z.string().optional().nullable(),
            codigoMapa: z.string().optional().nullable(),
            concentration: z.string().optional().nullable(),
            presentation: z.string().optional().nullable(),
            manufacturer: z.string().optional().nullable(),
            price: z.number().optional().nullable(),
            supplierId: z.number().optional().nullable(),
            supplierName: z.string().optional().nullable(),
          })
        ),
        minSimilarity: z.number().min(0).max(1).default(0.7),
        confirmDuplicates: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Validar produtos importados
        const { valid, invalid } = validateImportedProductsForMatching(input.products);

        if (invalid.length > 0) {
          return {
            success: false,
            message: `${invalid.length} produto(s) inválido(s) - importação cancelada`,
            report: null,
          };
        }

        // Detectar duplicatas no lote
        const { duplicates: duplicatesInBatch } = detectDuplicatesInImportBatch(valid);

        if (duplicatesInBatch.length > 0 && !input.confirmDuplicates) {
          return {
            success: false,
            message: `${duplicatesInBatch.length} duplicata(s) detectada(s). Confirme para prosseguir.`,
            report: null,
            requiresConfirmation: true,
          };
        }

        // Obter Master Products
        const masterProducts = await listMasterProducts();

        if (!masterProducts || masterProducts.length === 0) {
          return {
            success: false,
            message: "Nenhum Master Product disponível para matching",
            report: null,
          };
        }

        // Processar matching
        const existingProducts = new Map();
        const results = await processImportedProductsWithMatching(valid, masterProducts as any, existingProducts, input.minSimilarity);

        // Calcular estatísticas
        const stats = await calculateImportMatchingStats(results);

        // Gerar relatório
        const warnings: string[] = [];
        if (duplicatesInBatch.length > 0) {
          warnings.push(`${duplicatesInBatch.length} duplicata(s) consolidada(s)`);
        }

        await generateImportMatchingReport(results, stats, duplicatesInBatch.length, warnings);

        // O salvamento no banco (criar produtos, atualizar preços, consolidar fornecedores)
        // ainda não foi implementado — não fingir sucesso.
        throw new TRPCError({
          code: "METHOD_NOT_SUPPORTED",
          message:
            "Funcionalidade ainda não implementada: a persistência da importação com matching não está disponível. Use previewImportWithMatching para simular o resultado.",
        });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          message: `Erro ao importar: ${errorMessage}`,
          report: null,
        };
      }
    }),

  /**
   * Obter estatísticas de matching para um lote
   */
  getMatchingStats: protectedProcedure
    .input(
      z.object({
        products: z.array(
          z.object({
            name: z.string(),
            ean: z.string().optional().nullable(),
            codigoMapa: z.string().optional().nullable(),
            concentration: z.string().optional().nullable(),
            presentation: z.string().optional().nullable(),
          })
        ),
      })
    )
    .query(async ({ input }) => {
      try {
        const masterProducts = await listMasterProducts();

        if (!masterProducts || masterProducts.length === 0) {
          return {
            success: false,
            stats: null,
            message: "Nenhum Master Product disponível",
          };
        }

        const existingProducts = new Map();
        const results = await processImportedProductsWithMatching(input.products, masterProducts as any, existingProducts);
        const stats = await calculateImportMatchingStats(results);

        return {
          success: true,
          stats,
          message: `Análise concluída: ${stats.totalImported} produto(s) processado(s)`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          stats: null,
          message: `Erro ao calcular estatísticas: ${errorMessage}`,
        };
      }
    }),

  /**
   * Obter detalhes de um matching específico
   */
  getMatchingDetails: protectedProcedure
    .input(
      z.object({
        productName: z.string().min(1),
        ean: z.string().optional().nullable(),
        codigoMapa: z.string().optional().nullable(),
        concentration: z.string().optional().nullable(),
        presentation: z.string().optional().nullable(),
      })
    )
    .query(async ({ input }) => {
      try {
        const masterProducts = await listMasterProducts();

        if (!masterProducts || masterProducts.length === 0) {
          return {
            success: false,
            details: null,
            message: "Nenhum Master Product disponível",
          };
        }

        const existingProducts = new Map();
        const results = await processImportedProductsWithMatching([{ ...input, name: input.productName }], masterProducts as any, existingProducts);

        if (results.length === 0) {
          return {
            success: false,
            details: null,
            message: "Erro ao processar matching",
          };
        }

        const result = results[0];

        return {
          success: true,
          details: {
            productName: input.productName,
            matchType: result.matchType,
            masterProductId: result.masterProductId,
            masterProductName: result.masterProductName,
            similarity: result.similarity,
            action: result.action,
            reason: result.reason,
          },
          message: result.reason || "Matching processado",
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
        return {
          success: false,
          details: null,
          message: `Erro ao obter detalhes: ${errorMessage}`,
        };
      }
    }),
});
