import { describe, it, expect } from "vitest";
import { compararMateriais, compararAtributo, extrairNumero } from "./materialEquivalence";

describe("extrairNumero", () => {
  it("extrai números de textos com unidade e vírgula", () => {
    expect(extrairNumero("100 W")).toBe(100);
    expect(extrairNumero("10,5 mm")).toBe(10.5);
    expect(extrairNumero("1.200 kg")).toBe(1200);
    expect(extrairNumero(42)).toBe(42);
    expect(extrairNumero("sem número")).toBeNull();
  });
});

describe("compararAtributo", () => {
  it("numérico dentro da tolerância vale 1", () => {
    expect(compararAtributo({ nome: "dim", solicitado: "100mm", ofertado: "102mm", toleranciaPct: 5 })).toBe(1);
  });
  it("numérico fora da tolerância decai", () => {
    const s = compararAtributo({ nome: "dim", solicitado: "100mm", ofertado: "115mm", toleranciaPct: 5 })!;
    expect(s).toBeLessThan(1);
    expect(s).toBeGreaterThanOrEqual(0);
  });
  it("texto igual/contido/diferente", () => {
    expect(compararAtributo({ nome: "mat", solicitado: "Aço inox", ofertado: "aço inox" })).toBe(1);
    expect(compararAtributo({ nome: "mat", solicitado: "Aço inox 304", ofertado: "Aço inox" })).toBe(0.75);
    expect(compararAtributo({ nome: "mat", solicitado: "Aço", ofertado: "Alumínio" })).toBe(0);
  });
  it("sem dados retorna null", () => {
    expect(compararAtributo({ nome: "x", solicitado: null, ofertado: "y" })).toBeNull();
  });

  it("unidades diferentes não equivalem, mesmo com o mesmo número", () => {
    expect(compararAtributo({ nome: "pot", solicitado: "100 W", ofertado: "100 V" })).toBe(0);
    expect(compararAtributo({ nome: "dim", solicitado: "10 mm", ofertado: "10 cm", toleranciaPct: 5 })).toBe(0);
  });

  it("mesma unidade dentro da tolerância ainda vale 1", () => {
    expect(compararAtributo({ nome: "pot", solicitado: "100 W", ofertado: "102 W", toleranciaPct: 5 })).toBe(1);
  });
});

describe("compararMateriais (§6)", () => {
  it("materiais equivalentes com diferenças irrelevantes → alto score", () => {
    const r = compararMateriais([
      { nome: "Material", solicitado: "Aço inox", ofertado: "Aço inox 304" },
      { nome: "Potência", solicitado: "100W", ofertado: "102W", toleranciaPct: 5 },
      { nome: "Norma", solicitado: "ABNT NBR 5410", ofertado: "ABNT NBR 5410" },
    ]);
    expect(r.score).toBeGreaterThanOrEqual(0.9);
    expect(r.classificacao.usoAutomaticoPermitido).toBe(true);
    expect(r.justificativa.length).toBe(3);
  });

  it("atributo CRÍTICO divergente impede uso automático (< 75%)", () => {
    const r = compararMateriais([
      { nome: "Material", solicitado: "Aço inox", ofertado: "Aço inox" },
      { nome: "Norma", solicitado: "ABNT NBR 5410", ofertado: "Sem certificação", critico: true },
    ]);
    expect(r.classificacao.naoUsarAutomaticamente).toBe(true);
    expect(r.score).toBeLessThan(0.75);
    expect(r.divergencias.some((d) => d.startsWith("Norma"))).toBe(true);
  });

  it("não equivale só pela semelhança de um atributo textual", () => {
    const r = compararMateriais([
      { nome: "Nome", solicitado: "Cabo elétrico", ofertado: "Cabo elétrico" },
      { nome: "Bitola", solicitado: "2,5mm²", ofertado: "6mm²", toleranciaPct: 5, critico: true },
    ]);
    expect(r.classificacao.naoUsarAutomaticamente).toBe(true);
  });

  it("registra justificativa objetiva por atributo", () => {
    const r = compararMateriais([{ nome: "Capacidade", solicitado: "500L", ofertado: "500L" }]);
    expect(r.justificativa[0]).toContain("✓");
    expect(r.justificativa[0]).toContain("Capacidade");
  });
});
