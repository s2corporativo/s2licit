import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./backfill-price-history.mjs", import.meta.url), "utf8");

describe("backfill de histórico de preços", () => {
  it("usa somente colunas reais de timestamp do price_history", () => {
    expect(source).toContain("data, recordedAt");
    expect(source).not.toMatch(/price_history[\s\S]{0,300}createdAt/);
  });

  it("preserva o timestamp observado da oferta", () => {
    expect(source).toContain("COALESCE(o.updatedAt, o.createdAt) AS observedAt");
    expect(source.match(/COALESCE\(o\.updatedAt, o\.createdAt\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(source).not.toContain("NOW())");
  });

  it("revalida ausência de histórico no mesmo INSERT", () => {
    expect(source).toContain("INSERT INTO price_history");
    expect(source).toContain("AND NOT EXISTS (");
    expect(source).toContain("WHERE h.productId = o.productId");
    expect(source).toContain("AND h.supplierId = o.supplierId");
  });

  it("continua dry-run por padrão e exige flag explícita para escrita", () => {
    expect(source).toContain('process.argv.includes("--aplicar")');
    expect(source).toContain("DRY-RUN — nada foi gravado");
  });
});
