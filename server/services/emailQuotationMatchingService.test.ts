import { describe, expect, it } from "vitest";
import { calculateStringSimilarity } from "./productMatchingService";
import {
  bestNameMatchFromIndex,
  buildNameMatchIndex,
  type CatalogProduct,
} from "./emailQuotationMatchingService";

function bruteForce(
  query: string,
  catalog: CatalogProduct[],
  threshold: number,
): { id: number; score: number } | null {
  const normalized = query.toLowerCase().trim();
  let best: { id: number; score: number } | null = null;
  for (const product of catalog) {
    const score = calculateStringSimilarity(normalized, product.name.toLowerCase().trim());
    if (score >= threshold && (!best || score > best.score)) {
      best = { id: product.id, score };
      if (score === 1) break;
    }
  }
  return best;
}

function deterministicCatalog(size: number): CatalogProduct[] {
  const vocabulary = [
    "seringa",
    "descartavel",
    "agulha",
    "luva",
    "nitrilica",
    "medicamento",
    "veterinario",
    "solucao",
    "equipamento",
    "laboratorio",
    "compressa",
    "esteril",
    "material",
    "odontologico",
    "hospitalar",
  ];
  return Array.from({ length: size }, (_value, index) => {
    const words = Array.from({ length: 2 + (index % 5) }, (_word, offset) =>
      vocabulary[(index * 7 + offset * 3) % vocabulary.length],
    );
    return {
      id: index + 1,
      name: `${words.join(" ")} ${index % 11}`,
      price: index % 3 === 0 ? String((index + 1) / 10) : null,
    };
  });
}

describe("indexed fuzzy matching", () => {
  it("returns the same winner and score as brute force across thresholds", () => {
    const catalog = deterministicCatalog(500);
    const index = buildNameMatchIndex(catalog);
    const queries = [
      "seringa descartavel agulha",
      "luva nitrilica hospitalar",
      "equipamento laboratorio esteril",
      "medicamento veterinario solucao",
      "material odontologico compressa",
      "produto inexistente completamente diferente",
    ];
    const thresholds = [0.5, 0.68, 0.8, 0.95];

    for (const threshold of thresholds) {
      for (const query of queries) {
        const expected = bruteForce(query, catalog, threshold);
        const actual = bestNameMatchFromIndex(query, index, threshold);
        expect(actual?.product.id ?? null).toBe(expected?.id ?? null);
        expect(actual?.score ?? null).toBeCloseTo(expected?.score ?? 0, 12);
      }
    }
  });

  it("handles empty catalogs and empty queries without allocating candidate work", () => {
    expect(bestNameMatchFromIndex("produto", buildNameMatchIndex([]), 0.68)).toBeNull();
    expect(
      bestNameMatchFromIndex("   ", buildNameMatchIndex([{ id: 1, name: "produto", price: null }]), 0.68),
    ).toBeNull();
  });

  it("preserves exact matches at threshold 1", () => {
    const catalog: CatalogProduct[] = [
      { id: 1, name: "Luva Nitrílica", price: "10.00" },
      { id: 2, name: "Luva Nitrílica Azul", price: "11.00" },
    ];
    const actual = bestNameMatchFromIndex("luva nitrílica", buildNameMatchIndex(catalog), 1);
    expect(actual?.product.id).toBe(1);
    expect(actual?.score).toBe(1);
  });
});
