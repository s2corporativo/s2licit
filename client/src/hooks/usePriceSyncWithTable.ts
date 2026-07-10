import { useCallback, useEffect } from "react";
import { usePriceHighlight } from "./usePriceHighlight";
import { usePriceSync } from "./usePriceSync";

/**
 * Hook to integrate price sync with table highlights
 */
export function usePriceSyncWithTable() {
  const priceHighlight = usePriceHighlight();
  const priceSync = usePriceSync();

  /**
   * Apply sync results to highlights
   */
  const applySyncResults = useCallback(
    async (
      importedProductIds: number[],
      beforeSnapshot: Map<number, Map<number, number>> | null
    ) => {
      if (!beforeSnapshot || importedProductIds.length === 0) {
        return;
      }

      try {
        // Get sync stats
        // Convert Map to Record format expected by syncPrices
        const snapshotRecord: Record<string, Record<string, number>> = {};
        if (beforeSnapshot instanceof Map) {
          beforeSnapshot.forEach((supplierMap, productId) => {
            snapshotRecord[productId] = {};
            if (supplierMap instanceof Map) {
              supplierMap.forEach((price, supplierId) => {
                snapshotRecord[productId][supplierId] = price;
              });
            }
          });
        }

        const syncResult = await priceSync.syncPrices(
          importedProductIds,
          snapshotRecord
        );

        if (syncResult && syncResult.affectedProducts && syncResult.affectedProducts.length > 0) {
          const syncStats = syncResult;
          // Convert affected products to highlights
          const highlightData = syncStats.affectedProducts.map((update: any) => ({
            productId: update.productId,
            supplierId: update.supplierId,
            oldPrice: update.oldPrice,
            newPrice: update.newPrice,
            changePercent: update.changePercent,
            changeAmount: update.changeAmount,
          }));

          // Apply batch highlights
          priceHighlight.addBatchHighlights(highlightData);
        }
      } catch (error) {
        console.error("Error applying sync results to highlights:", error);
      }
    },
    [priceHighlight, priceSync]
  );

  /**
   * Clear highlights after timeout
   */
  const clearHighlightsAfterDelay = useCallback(
    (delayMs: number = 10000) => {
      const timer = setTimeout(() => {
        priceHighlight.clearHighlights();
      }, delayMs);

      return () => clearTimeout(timer);
    },
    [priceHighlight]
  );

  /**
   * Get highlight for cell
   */
  const getCellHighlight = useCallback(
    (productId: number, supplierId: number) => {
      return priceHighlight.getHighlight(productId, supplierId);
    },
    [priceHighlight]
  );

  /**
   * Get cell styling
   */
  const getCellStyling = useCallback(
    (productId: number, supplierId: number) => {
      const highlight = priceHighlight.getHighlight(productId, supplierId);

      if (!highlight) {
        return {
          className: "",
          changeText: "",
          tooltipText: "",
        };
      }

      const highlightClass = priceHighlight.getHighlightClass(
        productId,
        supplierId
      );
      const changeText = priceHighlight.getChangeText(productId, supplierId);
      const tooltipText = priceHighlight.getTooltipText(
        productId,
        supplierId
      );

      return {
        className: highlightClass,
        changeText,
        tooltipText,
      };
    },
    [priceHighlight]
  );

  /**
   * Get summary of highlights
   */
  const getSummary = useCallback(() => {
    return priceHighlight.getSummary;
  }, [priceHighlight]);

  return {
    priceHighlight,
    applySyncResults,
    clearHighlightsAfterDelay,
    getCellHighlight,
    getCellStyling,
    getSummary,
  };
}
