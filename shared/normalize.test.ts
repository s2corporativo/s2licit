import { describe, expect, it } from "vitest";
import {
  normalizeText,
  normalizeProductKey,
  normalizeNameLegacy,
  stageWhitespace,
  stageCase,
  stageAccents,
  stagePunctuation,
  stageStopwords,
  stageQuantityNoise,
} from "./normalize";
import { normalizeGtin, sameGtin, sameManufacturerRef } from "./productOntology";

describe("normalizeText (compatibilidade com o engine histórico)", () => {
  it("minúsculas, sem acentos, sem marcas e pontuação", () => {
    expect(normalizeText("Amoxilina® 500mg, Cápsulas")).toBe("amoxilina 500mg capsulas");
  });
  it("texto vazio retorna vazio", () => {
    expect(normalizeText("")).toBe("");
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
  it("normaliza espaços múltiplos", () => {
    expect(normalizeText("  Dipirona   sódica   1g  ")).toBe("dipirona sodica 1g");
  });
});

describe("normalizeProductKey (chave canônica completa)", () => {
  it("expande abreviações e padroniza embalagem", () => {
    const key = normalizeProductKey("Amoxilina 500mg Cápsulas Caixa c/ 21");
    // "cápsulas" → "capsula" (plural), "c/ 21" → "caixa 21" (abreviação),
    // "caixa" duplicada é inofensiva na comparação de similaridade.
    expect(key).toContain("capsula");
    expect(key).toContain("amoxilina");
    expect(key).toContain("21");
    expect(key).not.toMatch(/\bc\b/);
  });
  it("remove ruído comercial de quantidade", () => {
    const a = normalizeProductKey("Kit Duplo Desinfetante 5L");
    const b = normalizeProductKey("Desinfetante 5L");
    // "kit duplo" sai; a unidade "L" é preservada (expandir "l" ambíguo).
    expect(a).toBe(b);
  });
  it("normaliza variações de plural, abreviação e embalagem na chave", () => {
    // "cx" → "caixa", "un" → "unidade", "Luvas" → "luva", quantificador
    // "com 100 unidades" → removido (embalagem preservada).
    expect(normalizeProductKey("Luva Procedimento M cx 100 un")).toBe(
      "luva procedimento m caixa 100 unidade"
    );
    expect(normalizeProductKey("Luvas de Procedimento M Caixa com 100 Unidades")).toBe(
      "luva de procedimento m caixa"
    );
  });
  it("preserva concentração e modelo (atributos críticos)", () => {
    const a = normalizeProductKey("Agulha 13x4.5");
    const b = normalizeProductKey("Agulha 13x08");
    expect(a).not.toBe(b);
  });
});

describe("estágios individuais", () => {
  it("stageCase", () => expect(stageCase("ABC def")).toBe("abc def"));
  it("stageAccents", () => expect(stageAccents("ú é ã ç")).toBe("u e a c"));
  it("stagePunctuation", () => {
    // Símbolos especiais (®™©) já foram removidos pelo stageBrandNoise na
    // pipeline completa; aqui pontuação e parênteses viram espaço.
    expect(stageWhitespace(stagePunctuation("a.b, c: d (10)"))).toBe("a b c d 10");
  });
  it("stageStopwords remove conectivos e unidades comuns", () => {
    // O texto entra já minúsculo e sem acentos (pipeline completo), conforme
    // a ordem do engine.
    expect(stageStopwords("caixa de luvas com po")).toBe("luvas po");
  });
  it("stageQuantityNoise remove quantidades comerciais", () => {
    // O estágio opera sobre texto já minúsculo e sem acentos (ordem do engine).
    const input = "soro fisiologico caixa com 12 frascos 500ml";
    expect(stageQuantityNoise(input)).not.toContain("com 12 frascos");
  });
});

describe("normalizeNameLegacy (compatibilidade db/_helpers)", () => {
  it("minúsculas sem acentos e sem pontuação", () => {
    expect(normalizeNameLegacy("Soro Fisiológico 0,9%")).toBe("soro fisiologico 0 9");
  });
});

describe("productOntology helpers", () => {
  it("normalizeGtin zera à esquerda e ignora não-dígitos", () => {
    expect(normalizeGtin(" 07891234567890 ")).toBe("7891234567890");
    expect(normalizeGtin("")).toBeNull();
    expect(normalizeGtin(null)).toBeNull();
  });
  it("sameGtin ignora zeros à esquerda", () => {
    expect(sameGtin("07891234567890", "7891234567890")).toBe(true);
    expect(sameGtin("7891234567890", "7891234567891")).toBe(false);
    expect(sameGtin("", "789")).toBe(false);
  });
  it("sameManufacturerRef ignora acentos e espaços", () => {
    expect(sameManufacturerRef("Cristália Lab.", "cristalia lab")).toBe(true);
    expect(sameManufacturerRef("Zoetis Brasil", "zoetis brasil")).toBe(true);
    expect(sameManufacturerRef("A", "B")).toBe(false);
    expect(sameManufacturerRef("", "A")).toBe(false);
  });
});
