import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Dashboard shortcuts", () => {
  it("mantém o atalho de importação XML apontando para a rota de importação NFe/XML", () => {
    const source = readFileSync(resolve(__dirname, "Dashboard.tsx"), "utf8");

    expect(source).toContain('href="/importar-nfe"');
    expect(source).toContain("Importar XML");
  });

  it("oferece importação de produtos por planilha, XML e PDF", () => {
    const source = readFileSync(resolve(__dirname, "Dashboard.tsx"), "utf8");

    expect(source).toContain("Importar produtos");
    expect(source).toContain('href="/importar"');
    expect(source).toContain("Importar planilha");
    expect(source).toContain('href="/importar-nfe"');
    expect(source).toContain('href="/captura-inteligente?origem=documento"');
    expect(source).toContain("Importar PDF");
  });
});
