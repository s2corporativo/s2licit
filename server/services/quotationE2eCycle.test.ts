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
 * pipeline, sem quebras. Match por nome é somente sugestão; apenas código de
 * catálogo exato pode dispensar revisão humana.
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
  it("descricao quase idêntica recebe sugestão por nome, mas exige revisão humana", async () => {
    const item: ExtractedItem = { descricao: "AMOXICILINA 500MG CAIXA C/20 COMPRIMIDOS", quantidade: 100, unidade: "CX" };
    const matched = await matchQuotationItem(item, CATALOG);
    expect(matched.produtoMatchId).toBe(100);
    expect(matched.matchMethod).toBe("nome");
    expect(matched.precoSugerido).toBe("45.00");
    expect(Number(matched.matchScore ?? 0)).toBeGreaterThanOrEqual(nameMatchThreshold());
    expect(shouldAutoConfirm(toCandidate(matched.produtoMatchId, matched.matchMethod, matched.matchScore))).toBe(false);
  });

  it("item com código CATMAS cruza exato (score 1) e é auto-confirmado", async () => {
    const item: ExtractedItem = { descricao: "amoxi 500", quantidade: 1, unidade: "CX", codigoCatalogo: "14280123" };
    const matched = await matchQuotationItem(item, CATALOG);
    expect(matched.produtoMatchId).toBe(100);
    expect(matched.matchMethod).toBe("catmas");
    expect(matched.matchScore).toBe(1);
    expect(shouldAutoConfirm(toCandidate(matched.produtoMatchId, matched.matchMethod, matched.matchScore))).toBe(true);
  });

  it("limiar 0.68 controla sugestões; threshold legado não libera nome", () => {
    expect(nameMatchThreshold()).toBe(0.68);
    expect(autoConfirmThreshold()).toBe(0.82);
    expect(shouldAutoConfirm(toCandidate(100, "nome", 0.75))).toBe(false);
    expect(shouldAutoConfirm(toCandidate(100, "nome", 0.99))).toBe(false);
    process.env.QUOTATION_AUTO_CONFIRM_THRESHOLD = "0.50";
    expect(autoConfirmThreshold()).toBe(0.50);
    expect(shouldAutoConfirm(toCandidate(100, "nome", 1))).toBe(false);
  });

  it("descricao distante do catálogo não recebe match — nada é confirmado", async () => {
    const item: ExtractedItem = { descricao: "MESA DE OPERAÇÕES CIRÚRGICA HIDRÁULICA", quantidade: 2, unidade: "UN" };
    const matched = await matchQuotationItem(item, CATALOG);
    expect(matched.produtoMatchId).toBeNull();
    expect(shouldAutoConfirm(toCandidate(matched.produtoMatchId, matched.matchMethod, matched.matchScore))).toBe(false);
  });

  it("item sem preço de custo bloqueia a auto-confirmação mesmo com match determinístico", async () => {
    const cand = toCandidate(200, "catmas", 1, null);
    expect(shouldAutoConfirm(cand)).toBe(false);
  });

  it("match manual ou ausente nunca é auto-confirmado", () => {
    expect(shouldAutoConfirm(toCandidate(100, "manual", 1))).toBe(false);
    expect(shouldAutoConfirm(toCandidate(null, "nenhum", null))).toBe(false);
  });
});