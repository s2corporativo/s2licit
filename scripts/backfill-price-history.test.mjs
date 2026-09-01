import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./backfill-price-history.mjs", import.meta.url), "utf8");

describe("backfill de histórico de preços", () => {
  it("usa somente colunas reais de timestamp na lista de destino", () => {
    expect(source).toContain("(productId, supplierId, price, origem, data, recordedAt)");
    expect(source).not.toContain("(productId, supplierId, price, origem, createdAt)");
  });

  it("não rejuvenesce preço por updatedAt genérico da oferta", () => {
    expect(source).toContain("o.createdAt AS observedAt");
    expect(source).toContain("o.createdAt,\n        o.createdAt");
    expect(source).not.toContain("o.updatedAt");
    expect(source).not.toContain("NOW())");
  });

  it("serializa execuções e revalida ausência no mesmo INSERT", () => {
    expect(source).toContain("SELECT GET_LOCK(?, 30) AS acquired");
    expect(source).toContain("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    expect(source).toContain("INSERT INTO price_history");
    expect(source).toContain("AND NOT EXISTS (");
    expect(source).toContain("WHERE h.productId = o.productId");
    expect(source).toContain("AND h.supplierId = o.supplierId");
    expect(source).toContain("SELECT RELEASE_LOCK(?)");
  });

  it("continua dry-run por padrão e exige flag explícita para escrita", () => {
    expect(source).toContain('process.argv.includes("--aplicar")');
    expect(source).toContain("DRY-RUN — nada foi gravado");
  });
});
