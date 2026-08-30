import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regressão: mesmo defeito de db.audit.test.ts — db.execute() do mysql2/
 * drizzle devolve a tupla [rows, fields], não a lista de linhas. Sem
 * desestruturar, os dois .map() rodavam sobre a tupla de 2 elementos.
 * Este módulo não tinha nenhum consumidor (achado do pente-fino), então o
 * bug nunca apareceu em runtime — agora está exposto via
 * auditRouter.schemaFingerprint.
 */
const execute = vi.fn();
vi.mock("../db", () => ({ getDb: async () => ({ execute }) }));

beforeEach(() => execute.mockReset());

describe("databaseSchemaFingerprint — desempacota a tupla [rows, fields]", () => {
  it("devolve colunas e índices como listas, não arrays aninhados", async () => {
    const columns = [
      { tableName: "users", columnName: "id", columnType: "int", isNullable: "NO", defaultValue: null, extra: "auto_increment" },
    ];
    const indexes = [
      { tableName: "users", indexName: "PRIMARY", nonUnique: 0, sequence: 1, columnName: "id" },
    ];
    execute
      .mockResolvedValueOnce([columns, [{ name: "tableName" }]])
      .mockResolvedValueOnce([indexes, [{ name: "tableName" }]]);

    const { getDatabaseSchemaFingerprint } = await import("./databaseSchemaFingerprint");
    const out = await getDatabaseSchemaFingerprint();

    expect(out.columns).toHaveLength(1);
    expect(out.columns[0]).toMatchObject({ tableName: "users", columnName: "id", nullable: false });
    expect(out.indexes).toHaveLength(1);
    expect(out.indexes[0]).toMatchObject({ tableName: "users", indexName: "PRIMARY", nonUnique: false });
  });
});
