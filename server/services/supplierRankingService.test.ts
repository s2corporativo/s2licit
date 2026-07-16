import { describe, it, expect } from "vitest";
import { ranquearFornecedores, PESOS_PADRAO } from "./supplierRankingService";

describe("ranquearFornecedores (§10)", () => {
  it("não escolhe apenas pelo menor preço quando a técnica/prazo pesam", () => {
    const { melhor } = ranquearFornecedores([
      // Mais barato, mas baixa compatibilidade e prazo longo.
      { fornecedor: "A", custoTotal: 100, compatibilidade: 0.6, prazoDias: 30 },
      // Um pouco mais caro, alta compatibilidade e prazo curto.
      { fornecedor: "B", custoTotal: 110, compatibilidade: 0.98, prazoDias: 5 },
    ]);
    expect(melhor?.fornecedor).toBe("B");
  });

  it("com tudo igual exceto preço, escolhe o mais barato", () => {
    const { melhor, opcoes } = ranquearFornecedores([
      { fornecedor: "A", custoTotal: 120, compatibilidade: 0.9, prazoDias: 10 },
      { fornecedor: "B", custoTotal: 100, compatibilidade: 0.9, prazoDias: 10 },
    ]);
    expect(melhor?.fornecedor).toBe("B");
    expect(opcoes[0].posicao).toBe(1);
  });

  it("penaliza fortemente a opção indisponível", () => {
    const { melhor } = ranquearFornecedores([
      { fornecedor: "A", custoTotal: 100, compatibilidade: 0.99, prazoDias: 5, disponivel: false },
      { fornecedor: "B", custoTotal: 130, compatibilidade: 0.8, prazoDias: 20, disponivel: true },
    ]);
    // Mesmo sendo mais barato e mais compatível, A está indisponível.
    expect(melhor?.fornecedor).toBe("B");
  });

  it("melhor é a melhor opção DISPONÍVEL quando existe", () => {
    const { melhor, opcoes } = ranquearFornecedores([
      { fornecedor: "A", custoTotal: 100, compatibilidade: 1, disponivel: false },
      { fornecedor: "B", custoTotal: 105, compatibilidade: 0.95, disponivel: true },
    ]);
    expect(melhor?.fornecedor).toBe("B");
    // A ainda aparece na lista, mas com score penalizado.
    const a = opcoes.find((o) => o.fornecedor === "A")!;
    expect(a.score).toBeLessThan(melhor!.score);
  });

  it("confiabilidade e risco influenciam o desempate", () => {
    const { melhor } = ranquearFornecedores([
      { fornecedor: "A", custoTotal: 100, compatibilidade: 0.9, prazoDias: 10, confiabilidade: 0.5, risco: 0.8 },
      { fornecedor: "B", custoTotal: 100, compatibilidade: 0.9, prazoDias: 10, confiabilidade: 0.95, risco: 0.1 },
    ]);
    expect(melhor?.fornecedor).toBe("B");
  });

  it("lista vazia retorna melhor nulo; pesos padrão somam 1", () => {
    expect(ranquearFornecedores([]).melhor).toBeNull();
    const soma = Object.values(PESOS_PADRAO).reduce((s, v) => s + v, 0);
    expect(soma).toBeCloseTo(1);
  });
});
