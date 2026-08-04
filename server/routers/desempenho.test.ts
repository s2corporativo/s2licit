import { describe, expect, it } from "vitest";
import { resultadoDaProposta } from "./desempenho";

describe("resultadoDaProposta (deriva ganhou/perdeu/cancelada do status da proposta)", () => {
  it("considera ganhou quando a proposta virou pedido, está em trânsito ou foi entregue", () => {
    expect(resultadoDaProposta("order", null, null)).toBe("ganhou");
    expect(resultadoDaProposta("in_transit", null, null)).toBe("ganhou");
    expect(resultadoDaProposta("delivered", null, null)).toBe("ganhou");
  });

  it("considera perdeu quando cancelada com motivo ou valor do concorrente", () => {
    expect(resultadoDaProposta("cancelled", "preço acima do concorrente", null)).toBe("perdeu");
    expect(resultadoDaProposta("cancelled", null, "150.00")).toBe("perdeu");
    expect(resultadoDaProposta("cancelled", "motivo", "150.00")).toBe("perdeu");
  });

  it("considera cancelamento interno (não perda) quando cancelada sem motivo nem valor", () => {
    expect(resultadoDaProposta("cancelled", null, null)).toBe("cancelada");
    expect(resultadoDaProposta("cancelled", "", null)).toBe("cancelada");
  });

  it("considera pendente enquanto a proposta está em rascunho ou já foi enviada", () => {
    expect(resultadoDaProposta("draft", null, null)).toBe("pendente");
    expect(resultadoDaProposta("sent", null, null)).toBe("pendente");
  });
});
