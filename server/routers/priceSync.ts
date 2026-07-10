import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  calculateSyncStats,
  comparePriceSnapshots,
  enrichPriceUpdates,
  generateSyncSummary,
  getAffectedProducts,
  getPriceSnapshot,
} from "../services/priceSyncService";

/**
 * Price sync router for real-time synchronization of prices after NFe import
 */
export const priceSyncRouter = router({
  /**
   * Get sync statistics for a list of product IDs
   * Compares before and after snapshots to detect price changes
   */
  getSyncStats: protectedProcedure
    .input(
      z.object({
        productIds: z.array(z.number()),
        beforeSnapshot: z.record(z.string(), z.record(z.string(), z.number())),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Convert string keys back to numbers
        const beforeMap = new Map<number, Map<number, number>>();
        for (const [productIdStr, supplierPrices] of Object.entries(
          input.beforeSnapshot
        )) {
          const productId = Number(productIdStr);
          const supplierMap = new Map<number, number>();
          for (const [supplierId, price] of Object.entries(supplierPrices)) {
            supplierMap.set(Number(supplierId), price);
          }
          beforeMap.set(productId, supplierMap);
        }

        // Get current snapshot
        const afterSnapshot = await getPriceSnapshot(input.productIds);

        // Compare snapshots
        const updates = comparePriceSnapshots(beforeMap, afterSnapshot);

        // Enrich with product and supplier names
        const enrichedUpdates = await enrichPriceUpdates(updates);

        // Calculate stats
        const stats = calculateSyncStats(enrichedUpdates);

        // Get affected products
        const affectedProducts = await getAffectedProducts(enrichedUpdates);

        // Generate summary
        const summary = generateSyncSummary(stats);

        return {
          success: true,
          stats,
          affectedProducts,
          summary,
          timestamp: new Date(),
        };
      } catch (error) {
        return {
          success: false,
          error: `Erro ao sincronizar preços: ${error instanceof Error ? error.message : "Unknown error"}`,
          stats: null,
          affectedProducts: [],
          summary: "",
        };
      }
    }),

  /**
   * Get price snapshot before import
   * Used to capture current state before making changes
   */
  getBeforeSnapshot: protectedProcedure
    .input(z.object({ productIds: z.array(z.number()) }))
    .query(async ({ input }) => {
      try {
        const snapshot = await getPriceSnapshot(input.productIds);

        // Convert Map to serializable object
        const snapshotObj: Record<string, Record<string, number>> = {};
        const snapshotEntries = Array.from(snapshot.entries());
        for (const [productId, supplierPrices] of snapshotEntries) {
          snapshotObj[productId.toString()] = {};
          const supplierEntries = Array.from(supplierPrices.entries());
          for (const [supplierId, price] of supplierEntries) {
            snapshotObj[productId.toString()][supplierId.toString()] = price;
          }
        }

        return {
          success: true,
          snapshot: snapshotObj,
          timestamp: new Date(),
        };
      } catch (error) {
        return {
          success: false,
          error: `Erro ao capturar snapshot: ${error instanceof Error ? error.message : "Unknown error"}`,
          snapshot: {},
        };
      }
    }),

  /**
   * Get price change summary for display
   * Returns formatted message with key statistics
   */
  getPriceSummary: protectedProcedure
    .input(
      z.object({
        productIds: z.array(z.number()),
        beforeSnapshot: z.record(z.string(), z.record(z.string(), z.number())),
      })
    )
    .query(async ({ input }) => {
      try {
        // Convert string keys back to numbers
        const beforeMap = new Map<number, Map<number, number>>();
        for (const [productIdStr, supplierPrices] of Object.entries(
          input.beforeSnapshot
        )) {
          const productId = Number(productIdStr);
          const supplierMap = new Map<number, number>();
          for (const [supplierId, price] of Object.entries(supplierPrices)) {
            supplierMap.set(Number(supplierId), price);
          }
          beforeMap.set(productId, supplierMap);
        }

        // Get current snapshot
        const afterSnapshot = await getPriceSnapshot(input.productIds);

        // Compare snapshots
        const updates = comparePriceSnapshots(beforeMap, afterSnapshot);

        // Enrich with product and supplier names
        const enrichedUpdates = await enrichPriceUpdates(updates);

        // Calculate stats
        const stats = calculateSyncStats(enrichedUpdates);

        // Generate summary
        const summary = generateSyncSummary(stats);

        return {
          success: true,
          summary,
          stats: {
            totalProductsUpdated: stats.totalProductsUpdated,
            totalPriceChanges: stats.totalPriceChanges,
            newSuppliersAdded: stats.newSuppliersAdded,
            priceIncreases: stats.priceIncreases,
            priceDecreases: stats.priceDecreases,
            averagePriceChange: stats.averagePriceChange,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: `Erro ao gerar resumo: ${error instanceof Error ? error.message : "Unknown error"}`,
          summary: "",
          stats: null,
        };
      }
    }),
});
