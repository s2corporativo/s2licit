import { describe, it, expect } from "vitest";
import { fornecedoresFaltantes, FORNECEDORES_INICIAIS } from "./seedFornecedores";

describe("fornecedoresFaltantes — seed idempotente dos fornecedores iniciais", () => {
  it("retorna todos quando a base está vazia", () => {
    expect(fornecedoresFaltantes([])).toEqual([...FORNECEDORES_INICIAIS]);
  });

  it("não retorna nada quando todos já existem", () => {
    expect(fornecedoresFaltantes([...FORNECEDORES_INICIAIS])).toEqual([]);
  });

  it("é case-insensitive e ignora espaços em volta", () => {
    const existentes = ["  tambasa ", "BARTOFIL", "basso pancotte", "magazine médica", "Utilidades Clínicas"];
    expect(fornecedoresFaltantes(existentes)).toEqual([]);
  });

  it("retorna apenas os que faltam, preservando o nome canônico", () => {
    const faltam = fornecedoresFaltantes(["Tambasa", "Bartofil"]);
    expect(faltam).toEqual(["Basso Pancotte", "Magazine Médica", "Utilidades Clínicas"]);
  });

  it("tolera nomes vazios/nulos na base sem quebrar", () => {
    // Nome já cadastrado + ruído — não deve reintroduzir Tambasa.
    const faltam = fornecedoresFaltantes(["", "Tambasa", " "]);
    expect(faltam).not.toContain("Tambasa");
    expect(faltam).toContain("Bartofil");
  });
});
