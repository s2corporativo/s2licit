import { describe, expect, it } from "vitest";
import { calcularImpostos, regrasVigentes, aliquotaTotal } from "./taxEngine";
import type { TaxRule } from "../../drizzle/schema";

function regra(parcial: Partial<TaxRule> & { id: number; percentual: string }): TaxRule {
  return {
    id: parcial.id,
    descricao: parcial.descricao ?? `Regra ${parcial.id}`,
    tipo: parcial.tipo ?? "simples_efetiva",
    ufOrigem: parcial.ufOrigem ?? null,
    ufDestino: parcial.ufDestino ?? null,
    percentual: parcial.percentual,
    vigenciaInicio: parcial.vigenciaInicio ?? new Date("2020-01-01"),
    vigenciaFim: parcial.vigenciaFim ?? null,
    ativo: parcial.ativo ?? true,
    observacoes: null,
    criadoPor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as TaxRule;
}

describe("taxEngine", () => {
  const simples = regra({ id: 1, percentual: "6.000", tipo: "simples_efetiva", descricao: "Simples efetiva" });
  const difalSP = regra({ id: 2, percentual: "6.000", tipo: "difal", ufDestino: "SP", descricao: "DIFAL p/ SP" });
  const vencida = regra({ id: 3, percentual: "9.999", vigenciaFim: new Date("2021-12-31") });
  const inativa = regra({ id: 4, percentual: "9.999", ativo: false });

  it("filtra vigência e atividade", () => {
    const vig = regrasVigentes([simples, vencida, inativa], new Date("2026-07-11"));
    expect(vig.map((r) => r.id)).toEqual([1]);
  });

  it("calcula linhas e totais sobre o valor de venda", () => {
    const res = calcularImpostos({ valorVenda: 1000, regras: [simples] });
    expect(res.linhas).toHaveLength(1);
    expect(res.totalValor).toBe(60);
    expect(res.valorLiquido).toBe(940);
  });

  it("aplica DIFAL só em operação interestadual", () => {
    const dentro = calcularImpostos({ valorVenda: 1000, ufOrigem: "MG", ufDestino: "MG", regras: [simples, difalSP] });
    expect(dentro.totalPercentual).toBe(6);
    const paraSP = calcularImpostos({ valorVenda: 1000, ufOrigem: "MG", ufDestino: "SP", regras: [simples, difalSP] });
    expect(paraSP.totalPercentual).toBe(12);
    expect(paraSP.totalValor).toBe(120);
  });

  it("regra com UF de destino não casa com outra UF", () => {
    const paraRJ = calcularImpostos({ valorVenda: 1000, ufOrigem: "MG", ufDestino: "RJ", regras: [difalSP] });
    expect(paraRJ.linhas).toHaveLength(0);
    expect(paraRJ.alertas.length).toBeGreaterThan(0); // sem regra vigente
  });

  it("calcula margem líquida quando o custo é informado", () => {
    const res = calcularImpostos({ valorVenda: 1000, custo: 700, regras: [simples] });
    expect(res.lucroLiquido).toBe(240); // 940 líquido - 700 custo
    expect(res.margemLiquidaPercentual).toBe(24);
  });

  it("alerta prejuízo quando líquido não cobre o custo", () => {
    const res = calcularImpostos({ valorVenda: 1000, custo: 950, regras: [simples] });
    expect(res.lucroLiquido).toBe(-10);
    expect(res.alertas.join(" ")).toContain("PREJUÍZO");
  });

  it("aliquotaTotal soma percentuais aplicáveis", () => {
    expect(aliquotaTotal({ ufOrigem: "MG", ufDestino: "SP", regras: [simples, difalSP] })).toBe(12);
  });
});
