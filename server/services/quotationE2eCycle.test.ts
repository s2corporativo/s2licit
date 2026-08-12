import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractedItem } from "./emailQuotationExtractor";
import { matchQuotationItem } from "./emailQuotationMatchingService";
import {
  autoConfirmThreshold,
  nameMatchThreshold,
  shouldAutoConfirm,
  type AutoConfirmCandidate,
} from "./quotationAutoPipelineService";

/**
 * Teste ponta a ponta do ciclo central do sistema:
 *   item extraído de planilha/anexo → match com o catálogo (CATMAS/CATMAT/nome)
 *   → decisão de auto-confirmação → verificação de preço → pipeline.
 *
 * Objetivo: garantir que o ciclo FECHA — da extração à decisão final do
 * pipeline, sem quebras. Sem banco de dados (os mocks de DB já existem em
 * quotationAutoPipeline.test.ts). O match por código consulta o banco via
 * findProductByCatmas/Catmat — mockamos apenas esse lookup.
 */

const CATALOG = [
  { id: 100, name: "AMOXICILINA 500MG CAIXA C/ 20 COMPRIMIDOS", price: "45.00" },
  { id: 101, name: "SERINGA HIPODERMICA 5ML COM AGULHA", price: "1.20" },
  { id: 102, name: "GEL ALOE VERA 500G", price: "18.90" },
  { id: 103, name: "ALGODAO HIDROFILO TIPO 1 1KG", price: "12.00" },
];

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return {
    ...actual,
    findProductByCatmas: vi.fn(async (code: string) =>
      code === "14280123" ? { id: 100, name: CATALOG[0].name, price: "45.00", active: true } : null,
    ),
    findProductByCatmat: vi.fn(async () => null),
  };
});

function toCandidate(
  produtoMatchId: number | null,
  matchMethod: string,
  matchScore: number | null,
  preco: string | null = "45.00",
): AutoConfirmCandidate {
  return {
    matchConfirmado: false,
    matchMethod,
    matchScore: matchScore == null ? null : String(matchScore),
    produtoMatchId,
    precoSugerido: preco,
  };
}

afterEach(() => {
  delete process.env.QUOTATION_AUTO_CONFIRM_THRESHOLD;
  delete process.env.QUOTATION_NAME_MATCH_THRESHOLD;
});

describe("ciclo completo extração → match → auto-confirmação", () => {
  it("descricao quase idêntica ao cadastro recebe match por nome e fecha o ciclo", async () => {
    const item: ExtractedItem = { descricao: "AMOXICILINA 500MG CAIXA C/20 COMPRIMIDOS", quantidade: 100, unidade: "CX" };
    const matched = await matchQuotationItem(item, CATALOG);
    expect(matched.produtoMatchId).toBe(100);
    expect(matched.matchMethod).toBe("nome");
    expect(matched.precoSugerido).toBe("45.00");
    if (Number(matched.matchScore ?? 0) >= autoConfirmThreshold()) {
      expect(shouldAutoConfirm(toCandidate(matched.produtoMatchId, matched.matchMethod, matched.matchScore))).toBe(true);
    } else {
      expect(shouldAutoConfirm(toCandidate(matched.produtoMatchId, matched.matchMethod, matched.matchScore))).toBe(false);
    }
  });

  it("item com código CATMAS cruza exato (score 1) e é auto-confirmado", async () => {
    const item: ExtractedItem = { descricao: "amoxi 500", quantidade: 1, unidade: "CX", codigoCatalogo: "14280123" };
    const matched = await matchQuotationItem(item, CATALOG);
    expect(matched.produtoMatchId).toBe(100);
    expect(matched.matchMethod).toBe("catmas");
    expect(matched.matchScore).toBe(1);
    expect(shouldAutoConfirm(toCandidate(matched.produtoMatchId, matched.matchMethod, matched.matchScore))).toBe(true);
  });

  it("limiares padrão 0.68 (entrada) e 0.82 (auto-confirmação) separam revisão de geração", () => {
    expect(nameMatchThreshold()).toBe(0.68);
    expect(autoConfirmThreshold()).toBe(0.82);
    expect(shouldAutoConfirm(toCandidate(100, "nome", 0.75))).toBe(false); // revisão humana
    expect(shouldAutoConfirm(toCandidate(100, "nome", 0.85))).toBe(true);  // auto-confirma
    process.env.QUOTATION_AUTO_CONFIRM_THRESHOLD = "0.75";
    expect(shouldAutoConfirm(toCandidate(100, "nome", 0.75))).toBe(true);
  });

  it("descricao distante do catálogo não recebe match — nada é confirmado", async () => {
    const item: ExtractedItem = { descricao: "MESA DE OPERAÇÕES CIRÚRGICA HIDRÁULICA", quantidade: 2, unidade: "UN" };
    const matched = await matchQuotationItem(item, CATALOG);
    expect(matched.produtoMatchId).toBeNull();
    expect(shouldAutoConfirm(toCandidate(matched.produtoMatchId, matched.matchMethod, matched.matchScore))).toBe(false);
  });

  it("item sem preço de custo bloqueia a auto-confirmação mesmo com match perfeito", async () => {
    const item: ExtractedItem = { descricao: "GEL ALOE VERA 500G", quantidade: 30, unidade: "UN" };
    const catSemPreco = [{ id: 200, name: "GEL ALOE VERA 500G", price: null }];
    const matched = await matchQuotationItem(item, catSemPreco);
    expect(matched.produtoMatchId).toBe(200);
    expect(matched.precoSugerido).toBeNull();
    const cand = toCandidate(matched.produtoMatchId, matched.matchMethod, matched.matchScore, null);
    expect(shouldAutoConfirm(cand)).toBe(false);
  });

  it("match manual ou ausente nunca é auto-confirmado", () => {
    expect(shouldAutoConfirm(toCandidate(100, "manual", 1))).toBe(false);
    expect(shouldAutoConfirm(toCandidate(null, "nenhum", null))).toBe(false);
  });
});
