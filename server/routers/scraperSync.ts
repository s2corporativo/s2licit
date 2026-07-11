import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  syncScraperWithComparisonTable,
  getTableSyncSummary,
  getHighlightedPriceChanges,
} from "../services/scraperTableSyncService";

// ─── Schemas ──────────────────────────────────────────────────────────────

const syncWithTableSchema = z.object({
  supplierId: z.number(),
  products: z.array(
    z.object({
      productName: z.string(),
      price: z.number(),
      ean: z.string().optional(),
      code: z.string().optional(),
    })
  ),
});

const getTableSyncSummarySchema = z.object({ supplierId: z.number() });

const getHighlightedChangesSchema = z.object({
  supplierId: z.number(),
  hoursBack: z.number().default(24),
});

// ─── Router ───────────────────────────────────────────────────────────────

export const scraperSyncRouter = router({
  /**
   * Sincroniza preços do scraper com a tabela de comparação
   * Atualiza preços existentes e cria novos produtos
   */
  syncWithTable: protectedProcedure
    .input(syncWithTableSchema)
    .mutation(async ({ input }: { input: z.infer<typeof syncWithTableSchema> }) => {
      const result = await syncScraperWithComparisonTable(
        input.supplierId,
        input.products
      );
      return result;
    }),

  /**
   * Obtém resumo de mudanças de preço para exibição na tabela
   */
  getTableSyncSummary: protectedProcedure
    .input(getTableSyncSummarySchema)
    .query(async ({ input }: { input: z.infer<typeof getTableSyncSummarySchema> }) => {
      const summary = await getTableSyncSummary(input.supplierId);
      return summary;
    }),

  /**
   * Obtém lista de mudanças de preço com cores para destaque
   */
  getHighlightedChanges: protectedProcedure
    .input(getHighlightedChangesSchema)
    .query(async ({ input }: { input: z.infer<typeof getHighlightedChangesSchema> }) => {
      const changes = await getHighlightedPriceChanges(
        input.supplierId,
        input.hoursBack
      );
      return changes;
    }),
});
