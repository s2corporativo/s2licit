import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const productionIdentityFiles = [
  ".env.production.example",
  "LEIA-ME.txt",
  "DEPLOY-CONTABO.md",
  ".github/workflows/deploy-vps.yml",
  "scripts/vps-bootstrap.sh",
  "server/_core/session.test.ts",
  "server/services/totp.test.ts",
  "server/proposalExcel.test.ts",
];

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("higiene de identidade do Sistema S2", () => {
  it("não reintroduz marca ou domínio de negócio legado em produção", () => {
    const legacyIdentity = ["vet", "mg"].join("");
    for (const relativePath of productionIdentityFiles) {
      expect(
        read(relativePath).toLocaleLowerCase("pt-BR"),
        `Identidade legada encontrada em ${relativePath}`,
      ).not.toContain(legacyIdentity);
    }
  });

  it("mantém o identificador técnico do pacote padronizado", () => {
    const packageJson = JSON.parse(read("package.json")) as { name?: string };
    expect(packageJson.name).toBe("s2-licit");
  });

  it("mantém o título público usado pelos verificadores", () => {
    const expectedTitle = "Sistema S2 — Licitações e Cotações";
    expect(read("client/index.html")).toContain(`<title>${expectedTitle}</title>`);
    expect(read("scripts/verify-public-s2.mjs")).toContain(expectedTitle);
  });
});
