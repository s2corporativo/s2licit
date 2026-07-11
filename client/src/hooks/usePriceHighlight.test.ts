import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePriceHighlight } from "./usePriceHighlight";

describe("usePriceHighlight", () => {
  let hook: any;

  beforeEach(() => {
    const { result } = renderHook(() => usePriceHighlight());
    hook = result;
  });

  describe("addHighlight", () => {
    it("should add a price highlight", () => {
      act(() => {
        hook.current.addHighlight(1, 1, 100, 110, 10, 10);
      });

      const highlight = hook.current.getHighlight(1, 1);
      expect(highlight).toBeDefined();
      expect(highlight?.newPrice).toBe(110);
      expect(highlight?.changePercent).toBe(10);
    });

    it("should mark increase highlights correctly", () => {
      act(() => {
        hook.current.addHighlight(1, 1, 100, 115, 15, 15);
      });

      const highlight = hook.current.getHighlight(1, 1);
      expect(highlight?.highlightType).toBe("increase");
      expect(highlight?.isSignificant).toBe(true);
    });

    it("should mark decrease highlights correctly", () => {
      act(() => {
        hook.current.addHighlight(1, 1, 100, 85, -15, -15);
      });

      const highlight = hook.current.getHighlight(1, 1);
      expect(highlight?.highlightType).toBe("decrease");
      expect(highlight?.isSignificant).toBe(true);
    });

    it("should mark neutral highlights for small changes", () => {
      act(() => {
        hook.current.addHighlight(1, 1, 100, 102, 2, 2);
      });

      const highlight = hook.current.getHighlight(1, 1);
      expect(highlight?.highlightType).toBe("neutral");
      expect(highlight?.isSignificant).toBe(false);
    });
  });

  describe("removeHighlight", () => {
    it("should remove a highlight", () => {
      act(() => {
        hook.current.addHighlight(1, 1, 100, 110, 10, 10);
      });

      expect(hook.current.isHighlighted(1, 1)).toBe(true);

      act(() => {
        hook.current.removeHighlight(1, 1);
      });

      expect(hook.current.isHighlighted(1, 1)).toBe(false);
    });
  });

  describe("getHighlightClass", () => {
    it("should return red class for price increase", () => {
      act(() => {
        hook.current.addHighlight(1, 1, 100, 115, 15, 15);
      });

      const className = hook.current.getHighlightClass(1, 1);
      expect(className).toContain("red");
    });

    it("should return green class for price decrease", () => {
      act(() => {
        hook.current.addHighlight(1, 1, 100, 85, -15, -15);
      });

      const className = hook.current.getHighlightClass(1, 1);
      expect(className).toContain("green");
    });

    it("should return empty string for non-highlighted cells", () => {
      const className = hook.current.getHighlightClass(1, 1);
      expect(className).toBe("");
    });
  });

  describe("getChangeText", () => {
    it("should format positive change", () => {
      act(() => {
        hook.current.addHighlight(1, 1, 100, 115, 15, 15);
      });

      const text = hook.current.getChangeText(1, 1);
      expect(text).toContain("↑");
      expect(text).toContain("+");
      expect(text).toContain("15.00%");
    });

    it("should format negative change", () => {
      act(() => {
        hook.current.addHighlight(1, 1, 100, 85, -15, -15);
      });

      const text = hook.current.getChangeText(1, 1);
      expect(text).toContain("↓");
      expect(text).toContain("15.00%");
    });
  });

  describe("addBatchHighlights", () => {
    it("should add multiple highlights at once", () => {
      act(() => {
        hook.current.addBatchHighlights([
          {
            productId: 1,
            supplierId: 1,
            oldPrice: 100,
            newPrice: 110,
            changePercent: 10,
            changeAmount: 10,
          },
          {
            productId: 2,
            supplierId: 2,
            oldPrice: 200,
            newPrice: 180,
            changePercent: -10,
            changeAmount: -20,
          },
        ]);
      });

      expect(hook.current.isHighlighted(1, 1)).toBe(true);
      expect(hook.current.isHighlighted(2, 2)).toBe(true);
    });
  });

  describe("getSummary", () => {
    it("should calculate correct summary", () => {
      act(() => {
        hook.current.addBatchHighlights([
          {
            productId: 1,
            supplierId: 1,
            oldPrice: 100,
            newPrice: 110,
            changePercent: 10,
            changeAmount: 10,
          },
          {
            productId: 2,
            supplierId: 2,
            oldPrice: 200,
            newPrice: 180,
            changePercent: -10,
            changeAmount: -20,
          },
          {
            productId: 3,
            supplierId: 3,
            oldPrice: 300,
            newPrice: 303,
            changePercent: 1,
            changeAmount: 3,
          },
        ]);
      });

      const summary = hook.current.getSummary;
      expect(summary.total).toBe(3);
      expect(summary.increases).toBe(1);
      expect(summary.decreases).toBe(1);
      expect(summary.significant).toBe(2);
    });
  });

  describe("clearHighlights", () => {
    it("should clear all highlights", () => {
      act(() => {
        hook.current.addBatchHighlights([
          {
            productId: 1,
            supplierId: 1,
            oldPrice: 100,
            newPrice: 110,
            changePercent: 10,
            changeAmount: 10,
          },
        ]);
      });

      expect(hook.current.getAllHighlights().length).toBe(1);

      act(() => {
        hook.current.clearHighlights();
      });

      expect(hook.current.getAllHighlights().length).toBe(0);
    });
  });
});
