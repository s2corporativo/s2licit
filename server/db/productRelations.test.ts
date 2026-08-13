/**
 * Testes do módulo de relações entre produtos.
 *
 * Obs.: os testes que dependem de banco (upsertRelation, decideRelation...)
 * não são executados aqui — a camada de dados é coberta pelos testes já
 * existentes dos módulos consumidores. Este arquivo valida o contrato puro
 * (tipos, ordenação do par, validação de relationType).
 */
import { describe, expect, it } from "vitest";
import {
  VALID_RELATION_TYPES,
  canonicalPair,
  isAllowedRelationType,
} from "./productRelations";

describe("productRelations — contrato puro", () => {
  it("VALID_RELATION_TYPES cobre os 7 tipos da ontologia", () => {
    expect(VALID_RELATION_TYPES).toEqual([
      "EXACT_DUPLICATE",
      "SAME_PRODUCT_DIFFERENT_SOURCE",
      "EQUIVALENT",
      "COMPATIBLE",
      "SUBSTITUTE",
      "SIMILAR",
      "NOT_EQUIVALENT",
    ]);
  });

  it("canonicalPair ordena A < B", () => {
    expect(canonicalPair(10, 3)).toEqual({ productIdA: 3, productIdB: 10 });
    expect(canonicalPair(3, 10)).toEqual({ productIdA: 3, productIdB: 10 });
  });

  it("canonicalPair rejeita pares inválidos", () => {
    expect(() => canonicalPair(5, 5)).toThrow();
    expect(() => canonicalPair(1.5, 2)).toThrow();
    // Mesmo com ids >= 0, a ordenação é consistente.
    expect(canonicalPair(0, 1)).toEqual({ productIdA: 0, productIdB: 1 });
  });

  it("isAllowedRelationType valida só os tipos do catálogo", () => {
    expect(isAllowedRelationType("EQUIVALENT")).toBe(true);
    expect(isAllowedRelationType("equivalent")).toBe(false);
    expect(isAllowedRelationType("FAKE_TYPE")).toBe(false);
  });
});
