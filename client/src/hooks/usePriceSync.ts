import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

/**
 * Price sync statistics
 */
export interface PriceSyncStats {
  totalProductsUpdated: number;
  totalPriceChanges: number;
  newSuppliersAdded: number;
  priceIncreases: number;
  priceDecreases: number;
  averagePriceChange: number;
}

/**
 * Affected product info
 */
export interface AffectedProduct {
  id: number;
  name: string;
  oldPrice: number | null;
  newPrice: number;
  supplierCount: number;
}

/**
 * Hook for real-time price synchronization
 */
export function usePriceSync() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStats, setSyncStats] = useState<PriceSyncStats | null>(null);
  const [affectedProducts, setAffectedProducts] = useState<AffectedProduct[]>([]);
  const [summary, setSummary] = useState<string>("");

  // tRPC mutations
  const getSyncStatsMutation = trpc.priceSync.getSyncStats.useMutation();
  const getBeforeSnapshotQuery = trpc.priceSync.getBeforeSnapshot.useQuery;
  const getPriceSummaryQuery = trpc.priceSync.getPriceSummary.useQuery;

  /**
   * Capture price snapshot before import
   */
  const captureBeforeSnapshot = useCallback(
    async (productIds: number[]) => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await getBeforeSnapshotQuery(
          { productIds },
          { enabled: true }
        );

        if (!response.data?.success) {
          throw new Error(
            response.data?.error || "Failed to capture snapshot"
          );
        }

        return response.data.snapshot;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [getBeforeSnapshotQuery]
  );

  /**
   * Synchronize prices after import
   */
  const syncPrices = useCallback(
    async (
      productIds: number[],
      beforeSnapshot: Record<string, Record<string, number>>
    ) => {
      try {
        setIsLoading(true);
        setError(null);

        const result = await getSyncStatsMutation.mutateAsync({
          productIds,
          beforeSnapshot,
        });

        if (!result.success || !result.stats) {
          throw new Error(result.error || "Failed to sync prices");
        }

        setSyncStats({
          totalProductsUpdated: result.stats.totalProductsUpdated,
          totalPriceChanges: result.stats.totalPriceChanges,
          newSuppliersAdded: result.stats.newSuppliersAdded,
          priceIncreases: result.stats.priceIncreases,
          priceDecreases: result.stats.priceDecreases,
          averagePriceChange: result.stats.averagePriceChange,
        });

        if (result.affectedProducts) {
          setAffectedProducts(result.affectedProducts);
        }
        if (result.summary) {
          setSummary(result.summary);
        }

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [getSyncStatsMutation]
  );

  /**
   * Get price summary without full sync
   */
  const getPriceSummary = useCallback(
    async (
      productIds: number[],
      beforeSnapshot: Record<string, Record<string, number>>
    ) => {
      try {
        setIsLoading(true);
        setError(null);

        const result = await getPriceSummaryQuery(
          { productIds, beforeSnapshot },
          { enabled: true }
        );

        if (!result.data?.success) {
          throw new Error(result.data?.error || "Failed to get summary");
        }

        setSummary(result.data.summary);
        setSyncStats(result.data.stats);

        return result.data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [getPriceSummaryQuery]
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setSyncStats(null);
    setAffectedProducts([]);
    setSummary("");
  }, []);

  return {
    isLoading,
    error,
    syncStats,
    affectedProducts,
    summary,
    captureBeforeSnapshot,
    syncPrices,
    getPriceSummary,
    reset,
  };
}
