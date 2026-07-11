import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Dashboard shortcut for XML import", () => {
  it("mantém no dashboard o link de Importar XML para a rota /importar-nfe", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Dashboard.tsx"), "utf8");

    expect(source).toContain('href="/importar-nfe"');
    expect(source).toContain("Importar XML");
  });
});
