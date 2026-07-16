import { describe, it, expect } from "vitest";
import { ttlMs, avaliarValidade, precisaRevalidar, PRESET_HORAS } from "./priceValidityService";

const NOW = 1_700_000_000_000;
const HORA = 60 * 60 * 1000;

describe("ttlMs", () => {
  it("converte presets para ms", () => {
    expect(ttlMs("1h")).toBe(HORA);
    expect(ttlMs("24h")).toBe(24 * HORA);
    expect(ttlMs("3d")).toBe(72 * HORA);
    expect(PRESET_HORAS["6h"]).toBe(6);
  });

  it("usa horas personalizadas no preset custom", () => {
    expect(ttlMs("custom", 5)).toBe(5 * HORA);
  });

  it("rejeita custom sem horas válidas", () => {
    expect(() => ttlMs("custom")).toThrow();
    expect(() => ttlMs("custom", 0)).toThrow();
    expect(() => ttlMs("custom", -3)).toThrow();
  });
});

describe("avaliarValidade", () => {
  it("preço dentro da validade está vigente", () => {
    const consultadoEm = new Date(NOW - 2 * HORA);
    const r = avaliarValidade(consultadoEm, ttlMs("6h"), NOW);
    expect(r.vigente).toBe(true);
    expect(r.vencido).toBe(false);
    expect(r.restanteMs).toBe(4 * HORA);
    expect(r.expiraEm.getTime()).toBe(NOW - 2 * HORA + 6 * HORA);
  });

  it("preço mais velho que a validade está vencido", () => {
    const consultadoEm = new Date(NOW - 7 * HORA);
    const r = avaliarValidade(consultadoEm, ttlMs("6h"), NOW);
    expect(r.vencido).toBe(true);
    expect(r.restanteMs).toBe(0);
  });

  it("exatamente no limite ainda é vigente", () => {
    const r = avaliarValidade(new Date(NOW - 6 * HORA), ttlMs("6h"), NOW);
    expect(r.vigente).toBe(true);
    expect(r.restanteMs).toBe(0);
  });

  it("preço sem data de consulta é tratado como vencido", () => {
    expect(avaliarValidade(null, ttlMs("24h"), NOW).vencido).toBe(true);
    expect(avaliarValidade(undefined, ttlMs("24h"), NOW).vencido).toBe(true);
    expect(avaliarValidade("data-invalida", ttlMs("24h"), NOW).vencido).toBe(true);
  });

  it("aceita data como string ISO", () => {
    const r = avaliarValidade(new Date(NOW - HORA).toISOString(), ttlMs("6h"), NOW);
    expect(r.vigente).toBe(true);
  });
});

describe("precisaRevalidar", () => {
  it("sinaliza revalidação apenas para preço vencido", () => {
    expect(precisaRevalidar(new Date(NOW - 2 * HORA), ttlMs("6h"), NOW)).toBe(false);
    expect(precisaRevalidar(new Date(NOW - 8 * HORA), ttlMs("6h"), NOW)).toBe(true);
    expect(precisaRevalidar(null, ttlMs("6h"), NOW)).toBe(true);
  });
});
