import { useState, useCallback, useMemo } from "react";

/**
 * Price highlight information for a cell
 */
export interface PriceHighlight {
  productId: number;
  supplierId: number;
  oldPrice: number | null;
  newPrice: number;
  changePercent: number | null;
  changeAmount: number | null;
  highlightType: "increase" | "decrease" | "neutral";
  isSignificant: boolean;
}

/**
 * Hook for managing price highlights in comparison table
 */
export function usePriceHighlight() {
  const [highlights, setHighlights] = useState<Map<string, PriceHighlight>>(
    new Map()
  );
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  /**
   * Generate key for price highlight
   */
  const generateKey = useCallback((productId: number, supplierId: number) => {
    return `${productId}-${supplierId}`;
  }, []);

  /**
   * Add or update price highlight
   */
  const addHighlight = useCallback(
    (
      productId: number,
      supplierId: number,
      oldPrice: number | null,
      newPrice: number,
      changePercent: number | null = null,
      changeAmount: number | null = null
    ) => {
      const key = generateKey(productId, supplierId);

      const highlightType =
        changePercent === null || changePercent === 0
          ? "neutral"
          : changePercent > 0
            ? "increase"
            : "decrease";

      const isSignificant =
        changePercent !== null && Math.abs(changePercent) >= 5;

      const highlight: PriceHighlight = {
        productId,
        supplierId,
        oldPrice,
        newPrice,
        changePercent,
        changeAmount,
        highlightType,
        isSignificant,
      };

      setHighlights((prev) => {
        const updated = new Map(prev);
        updated.set(key, highlight);
        return updated;
      });

      setLastUpdateTime(new Date());
    },
    [generateKey]
  );

  /**
   * Remove price highlight
   */
  const removeHighlight = useCallback((productId: number, supplierId: number) => {
    const key = generateKey(productId, supplierId);
    setHighlights((prev) => {
      const updated = new Map(prev);
      updated.delete(key);
      return updated;
    });
  }, [generateKey]);

  /**
   * Get highlight for specific cell
   */
  const getHighlight = useCallback(
    (productId: number, supplierId: number): PriceHighlight | undefined => {
      const key = generateKey(productId, supplierId);
      return highlights.get(key);
    },
    [highlights, generateKey]
  );

  /**
   * Check if cell should be highlighted
   */
  const isHighlighted = useCallback(
    (productId: number, supplierId: number): boolean => {
      return getHighlight(productId, supplierId) !== undefined;
    },
    [getHighlight]
  );

  /**
   * Get highlight color class
   */
  const getHighlightClass = useCallback(
    (productId: number, supplierId: number): string => {
      const highlight = getHighlight(productId, supplierId);
      if (!highlight) return "";

      if (highlight.highlightType === "increase") {
        return highlight.isSignificant
          ? "bg-red-200 text-red-900"
          : "bg-red-100 text-red-800";
      } else if (highlight.highlightType === "decrease") {
        return highlight.isSignificant
          ? "bg-green-200 text-green-900"
          : "bg-green-100 text-green-800";
      }

      return "";
    },
    [getHighlight]
  );

  /**
   * Get formatted change text
   */
  const getChangeText = useCallback(
    (productId: number, supplierId: number): string => {
      const highlight = getHighlight(productId, supplierId);
      if (!highlight || highlight.changePercent === null) return "";

      const sign = highlight.changePercent > 0 ? "+" : "";
      const arrow = highlight.changePercent > 0 ? "↑" : "↓";

      return `${arrow} ${sign}${highlight.changePercent.toFixed(2)}%`;
    },
    [getHighlight]
  );

  /**
   * Get tooltip text
   */
  const getTooltipText = useCallback(
    (productId: number, supplierId: number): string => {
      const highlight = getHighlight(productId, supplierId);
      if (!highlight) return "";

      const lines = [];
      lines.push(`Preço anterior: R$ ${highlight.oldPrice?.toFixed(2) || "—"}`);
      lines.push(`Preço atual: R$ ${highlight.newPrice.toFixed(2)}`);

      if (highlight.changePercent !== null) {
        const sign = highlight.changePercent > 0 ? "+" : "";
        lines.push(
          `Variação: ${sign}${highlight.changePercent.toFixed(2)}% (R$ ${sign}${highlight.changeAmount?.toFixed(2) || "0.00"})`
        );
      }

      return lines.join("\n");
    },
    [getHighlight]
  );

  /**
   * Clear all highlights
   */
  const clearHighlights = useCallback(() => {
    setHighlights(new Map());
    setLastUpdateTime(null);
  }, []);

  /**
   * Batch add highlights
   */
  const addBatchHighlights = useCallback(
    (
      highlightData: Array<{
        productId: number;
        supplierId: number;
        oldPrice: number | null;
        newPrice: number;
        changePercent?: number | null | undefined;
        changeAmount?: number | null | undefined;
      }>
    ) => {
      const newHighlights = new Map(highlights);

      for (const data of highlightData) {
        const key = generateKey(data.productId, data.supplierId);

        const changePercent = data.changePercent ?? null;
        const changeAmount = data.changeAmount ?? null;

        const highlightType =
          changePercent === null || changePercent === 0
            ? "neutral"
            : changePercent > 0
              ? "increase"
              : "decrease";

        const isSignificant =
          changePercent !== null &&
          Math.abs(changePercent) >= 5;

        newHighlights.set(key, {
          productId: data.productId,
          supplierId: data.supplierId,
          oldPrice: data.oldPrice,
          newPrice: data.newPrice,
          changePercent,
          changeAmount,
          highlightType,
          isSignificant,
        });
      }

      setHighlights(newHighlights);
      setLastUpdateTime(new Date());
    },
    [highlights, generateKey]
  );

  /**
   * Get all highlights
   */
  const getAllHighlights = useCallback((): PriceHighlight[] => {
    return Array.from(highlights.values());
  }, [highlights]);

  /**
   * Get summary statistics
   */
  const getSummary = useMemo(() => {
    const all = Array.from(highlights.values());
    const increases = all.filter((h) => h.highlightType === "increase");
    const decreases = all.filter((h) => h.highlightType === "decrease");
    const significant = all.filter((h) => h.isSignificant);

    return {
      total: all.length,
      increases: increases.length,
      decreases: decreases.length,
      significant: significant.length,
      averageChange:
        all.length > 0
          ? all.reduce((sum, h) => sum + (h.changePercent || 0), 0) /
            all.length
          : 0,
    };
  }, [highlights]);

  return {
    highlights,
    lastUpdateTime,
    addHighlight,
    removeHighlight,
    getHighlight,
    isHighlighted,
    getHighlightClass,
    getChangeText,
    getTooltipText,
    clearHighlights,
    addBatchHighlights,
    getAllHighlights,
    getSummary,
  };
}
