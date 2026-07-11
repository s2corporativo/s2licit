import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Dashboard shortcuts", () => {
  it("mantém o atalho de importação XML apontando para a rota de importação NFe/XML", () => {
    const source = readFileSync(resolve(__dirname, "Dashboard.tsx"), "utf8");

    expect(source).toContain('href="/importar-nfe"');
    expect(source).toContain("Importar XML");
  });
});
