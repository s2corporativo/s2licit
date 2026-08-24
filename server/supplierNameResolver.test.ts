import { describe, expect, it } from "vitest";
import {
  normalizarNomeFornecedor,
  resolverFornecedorPorNome,
} from "./services/supplierNameResolver";

/**
 * Rastreabilidade do fornecedor no item de proposta — Ressalva 4 do Módulo 06.
 * Exercita as funções de produção, não objetos literais.
 */

const CADASTRO = [
  { id: 1, name: "Tambasa" },
  { id: 2, name: "Fundep Distribuidora" },
  { id: 3, name: "Cirúrgica São José" },
];

describe("normalizarNomeFornecedor", () => {
  it("iguala variações de caixa e espaço, que é a origem da duplicidade", () => {
    expect(normalizarNomeFornecedor("  TAMBASA  ")).toBe(normalizarNomeFornecedor("Tambasa"));
    expect(normalizarNomeFornecedor("Fundep   Distribuidora")).toBe(
      normalizarNomeFornecedor("fundep distribuidora"),
    );
  });

  it("iguala acentuação, porque a digitação varia", () => {
    expect(normalizarNomeFornecedor("Cirúrgica São José")).toBe(
      normalizarNomeFornecedor("Cirurgica Sao Jose"),
    );
  });

  it("NÃO iguala sufixo societário diferente — podem ser PJ distintas", () => {
    expect(normalizarNomeFornecedor("Alfa Ltda")).not.toBe(normalizarNomeFornecedor("Alfa S/A"));
  });
});

describe("resolverFornecedorPorNome", () => {
  it("resolve o fornecedor apesar da variação de caixa e espaço", () => {
    expect(resolverFornecedorPorNome("  tambasa ", CADASTRO)).toBe(1);
  });

  it("resolve apesar da acentuação ausente", () => {
    expect(resolverFornecedorPorNome("Cirurgica Sao Jose", CADASTRO)).toBe(3);
  });

  it("nome sem correspondência devolve null — não inventa vínculo", () => {
    expect(resolverFornecedorPorNome("Fornecedor Que Não Existe", CADASTRO)).toBeNull();
  });

  it("nome vazio, só espaços, null ou undefined devolvem null", () => {
    expect(resolverFornecedorPorNome("", CADASTRO)).toBeNull();
    expect(resolverFornecedorPorNome("   ", CADASTRO)).toBeNull();
    expect(resolverFornecedorPorNome(null, CADASTRO)).toBeNull();
    expect(resolverFornecedorPorNome(undefined, CADASTRO)).toBeNull();
  });

  it("ambiguidade devolve null em vez de escolher um dos dois", () => {
    const ambiguo = [
      { id: 10, name: "Alfa" },
      { id: 11, name: " alfa " },
    ];
    expect(resolverFornecedorPorNome("Alfa", ambiguo)).toBeNull();
  });

  it("cadastro vazio devolve null sem quebrar", () => {
    expect(resolverFornecedorPorNome("Tambasa", [])).toBeNull();
  });

  it("não cria fornecedor: a função só devolve id existente ou null", () => {
    const antes = CADASTRO.length;
    resolverFornecedorPorNome("Empresa Nova Nunca Cadastrada", CADASTRO);
    expect(CADASTRO).toHaveLength(antes);
  });
});
