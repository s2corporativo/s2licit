import { describe, expect, it } from "vitest";
import { avaliarRegularidade, classificarValidade } from "./routers/certidoes";

/**
 * Vínculo entre certidões e fornecedores — Ressalva 2 do Módulo 06.
 *
 * Estes testes exercitam a função de produção `avaliarRegularidade`, que é o
 * que a rota `certidoes.bySupplier` usa para responder "este fornecedor está
 * regular?". Não são asserções sobre objeto literal: a entrada é uma lista de
 * certidões e a saída é a decisão de habilitação derivada delas.
 */

const REF = new Date("2026-08-24T12:00:00Z");
const emDias = (n: number) => new Date(REF.getTime() + n * 24 * 60 * 60 * 1000);

describe("avaliarRegularidade", () => {
  it("fornecedor sem certidão NÃO é regular — ausência de prova não é regularidade", () => {
    const r = avaliarRegularidade([], REF);
    expect(r.regular).toBe(false);
    expect(r.vencidas).toBe(0);
    expect(r.certidoes).toHaveLength(0);
  });

  it("uma certidão válida basta para regularidade", () => {
    const r = avaliarRegularidade([{ dataValidade: emDias(120) }], REF);
    expect(r.regular).toBe(true);
    expect(r.certidoes[0].status).toBe("valida");
  });

  it("uma única certidão vencida derruba a regularidade, mesmo com outras válidas", () => {
    const r = avaliarRegularidade(
      [{ dataValidade: emDias(120) }, { dataValidade: emDias(-1) }, { dataValidade: emDias(200) }],
      REF,
    );
    expect(r.regular).toBe(false);
    expect(r.vencidas).toBe(1);
  });

  it("certidão vencendo em breve conta no alerta mas NÃO quebra a regularidade", () => {
    const r = avaliarRegularidade([{ dataValidade: emDias(10) }], REF);
    expect(r.regular).toBe(true);
    expect(r.vencendo).toBe(1);
    expect(r.vencidas).toBe(0);
  });

  it("a janela de alerta é configurável e move a fronteira vence_em_breve/valida", () => {
    const certidao = [{ dataValidade: emDias(45) }];
    expect(avaliarRegularidade(certidao, REF, 30).vencendo).toBe(0);
    expect(avaliarRegularidade(certidao, REF, 60).vencendo).toBe(1);
    // Em ambos os casos segue regular: vencer em breve não é vencida.
    expect(avaliarRegularidade(certidao, REF, 60).regular).toBe(true);
  });

  it("aceita dataValidade como string ISO, que é como o driver devolve DATE", () => {
    const iso = emDias(90).toISOString().slice(0, 10);
    const r = avaliarRegularidade([{ dataValidade: iso }], REF);
    expect(r.regular).toBe(true);
    expect(r.certidoes[0].status).toBe("valida");
  });

  it("preserva os campos originais da certidão além do status", () => {
    const r = avaliarRegularidade(
      [{ dataValidade: emDias(90), id: 42, tipo: "CND Federal" }],
      REF,
    );
    expect(r.certidoes[0]).toMatchObject({ id: 42, tipo: "CND Federal", status: "valida" });
  });

  it("vencidas e vencendo são contadas de forma independente", () => {
    const r = avaliarRegularidade(
      [{ dataValidade: emDias(-5) }, { dataValidade: emDias(-1) }, { dataValidade: emDias(15) }, { dataValidade: emDias(300) }],
      REF,
    );
    expect(r.vencidas).toBe(2);
    expect(r.vencendo).toBe(1);
    expect(r.regular).toBe(false);
  });
});

describe("classificarValidade — fronteiras", () => {
  it("hoje ainda é válida, não vencida", () => {
    expect(classificarValidade(REF, REF, 30)).toBe("vence_em_breve");
  });

  it("ontem é vencida", () => {
    expect(classificarValidade(emDias(-1), REF, 30)).toBe("vencida");
  });

  it("exatamente no limite do alerta ainda é vence_em_breve", () => {
    expect(classificarValidade(emDias(30), REF, 30)).toBe("vence_em_breve");
  });

  it("um dia além do limite já é valida", () => {
    expect(classificarValidade(emDias(31), REF, 30)).toBe("valida");
  });
});
