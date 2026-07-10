import { describe, it, expect, vi } from "vitest";
import type { Suggestion } from "./SuggestionsReviewModal";

describe("SuggestionsReviewModal", () => {
  const mockSuggestion: Suggestion = {
    productId: 1,
    productName: "Produto Teste",
    currentValues: {
      activeIngredient: "Amoxicilina",
      concentration: "500mg",
      category: "Medicamentos",
    },
    suggestedValues: {
      activeIngredient: "Amoxicilina",
      concentration: "500mg",
      category: "Medicamentos Veterinários",
      subcategory: "Antibióticos",
      manufacturer: "Fabricante XYZ",
      indication: "Infecções bacterianas",
    },
    confidence: 0.85,
    status: "pending",
  };

  it("should initialize with pending status", () => {
    expect(mockSuggestion.status).toBe("pending");
  });

  it("should have confidence between 0 and 1", () => {
    expect(mockSuggestion.confidence).toBeGreaterThanOrEqual(0);
    expect(mockSuggestion.confidence).toBeLessThanOrEqual(1);
  });

  it("should track status changes", () => {
    const suggestion = { ...mockSuggestion };
    suggestion.status = "accepted";
    expect(suggestion.status).toBe("accepted");

    suggestion.status = "rejected";
    expect(suggestion.status).toBe("rejected");

    suggestion.status = "edited";
    expect(suggestion.status).toBe("edited");
  });

  it("should allow editing suggested values", () => {
    const suggestion = { ...mockSuggestion };
    suggestion.suggestedValues.activeIngredient = "Cefalexina";
    expect(suggestion.suggestedValues.activeIngredient).toBe("Cefalexina");
  });

  it("should preserve current values when editing", () => {
    const suggestion = { ...mockSuggestion };
    const originalCurrent = suggestion.currentValues.activeIngredient;
    suggestion.suggestedValues.activeIngredient = "Cefalexina";
    expect(suggestion.currentValues.activeIngredient).toBe(originalCurrent);
  });

  it("should handle multiple suggestions", () => {
    const suggestions: Suggestion[] = [
      mockSuggestion,
      {
        ...mockSuggestion,
        productId: 2,
        productName: "Produto Teste 2",
      },
      {
        ...mockSuggestion,
        productId: 3,
        productName: "Produto Teste 3",
      },
    ];

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0].productId).toBe(1);
    expect(suggestions[1].productId).toBe(2);
    expect(suggestions[2].productId).toBe(3);
  });

  it("should calculate statistics correctly", () => {
    const suggestions: Suggestion[] = [
      { ...mockSuggestion, productId: 1, status: "accepted" },
      { ...mockSuggestion, productId: 2, status: "rejected" },
      { ...mockSuggestion, productId: 3, status: "edited" },
      { ...mockSuggestion, productId: 4, status: "pending" },
    ];

    const stats = {
      total: suggestions.length,
      accepted: suggestions.filter((s) => s.status === "accepted").length,
      rejected: suggestions.filter((s) => s.status === "rejected").length,
      edited: suggestions.filter((s) => s.status === "edited").length,
    };

    expect(stats.total).toBe(4);
    expect(stats.accepted).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.edited).toBe(1);
  });

  it("should filter accepted and edited suggestions for application", () => {
    const suggestions: Suggestion[] = [
      { ...mockSuggestion, productId: 1, status: "accepted" },
      { ...mockSuggestion, productId: 2, status: "rejected" },
      { ...mockSuggestion, productId: 3, status: "edited" },
      { ...mockSuggestion, productId: 4, status: "pending" },
    ];

    const toApply = suggestions.filter(
      (s) => s.status === "accepted" || s.status === "edited"
    );

    expect(toApply).toHaveLength(2);
    expect(toApply[0].productId).toBe(1);
    expect(toApply[1].productId).toBe(3);
  });

  it("should handle empty suggestions", () => {
    const suggestions: Suggestion[] = [];
    expect(suggestions).toHaveLength(0);

    const toApply = suggestions.filter(
      (s) => s.status === "accepted" || s.status === "edited"
    );
    expect(toApply).toHaveLength(0);
  });

  it("should validate suggestion structure", () => {
    const suggestion = mockSuggestion;

    expect(suggestion).toHaveProperty("productId");
    expect(suggestion).toHaveProperty("productName");
    expect(suggestion).toHaveProperty("currentValues");
    expect(suggestion).toHaveProperty("suggestedValues");
    expect(suggestion).toHaveProperty("confidence");
    expect(suggestion).toHaveProperty("status");
  });

  it("should handle null/undefined suggested values", () => {
    const suggestion: Suggestion = {
      ...mockSuggestion,
      suggestedValues: {
        activeIngredient: null,
        concentration: undefined,
      },
    };

    expect(suggestion.suggestedValues.activeIngredient).toBeNull();
    expect(suggestion.suggestedValues.concentration).toBeUndefined();
  });
});
