import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regressão: `db.execute()` do drizzle/mysql2 devolve a tupla [rows, fields].
 * As quatro funções deste módulo tratavam o retorno como se fosse a lista de
 * linhas. O efeito não era um erro visível, e sim um diagnóstico invertido:
 * /admin/database-health acusava "76 tabela(s) ausente(s)" e status "critical"
 * num banco íntegro, e contava 2 foreign keys onde havia 67.
 */
const execute = vi.fn();
vi.mock("./db", () => ({ getDb: async () => ({ execute }) }));

const COLS = [
  { table_name: "users", column_name: "id" },
  { table_name: "users", column_name: "email" },
];
const FIELDS = [{ name: "table_name" }, { name: "column_name" }];

beforeEach(() => execute.mockReset());

describe("db.audit — desempacota a tupla [rows, fields] do mysql2", () => {
  it("checkForeignKeyIntegrity conta as linhas, não os elementos da tupla", async () => {
    const fks = [{ CONSTRAINT_NAME: "a" }, { CONSTRAINT_NAME: "b" }, { CONSTRAINT_NAME: "c" }];
    execute.mockResolvedValue([fks, FIELDS]);
    const { checkForeignKeyIntegrity } = await import("./db.audit");
    const out = await checkForeignKeyIntegrity();
    expect(out.status).toBe("ok");
    // Antes da correção isto era 2 (o tamanho da tupla) para qualquer banco.
    expect(out.count).toBe(3);
    expect(out.foreignKeys).toEqual(fks);
  });

  it("getDatabaseStats devolve as linhas, não um array aninhado", async () => {
    const tables = [{ TABLE_NAME: "users", TABLE_ROWS: 2 }];
    const indexes = [{ TABLE_NAME: "users", INDEX_NAME: "PRIMARY" }];
    execute
      .mockResolvedValueOnce([tables, FIELDS])
      .mockResolvedValueOnce([indexes, FIELDS]);
    const { getDatabaseStats } = await import("./db.audit");
    const out = await getDatabaseStats();
    expect(out.tables).toEqual(tables);
    expect(out.indexes).toEqual(indexes);
    // O aninhamento antigo fazia a tela renderizar uma linha sem `key`.
    expect(Array.isArray(out.tables[0])).toBe(false);
  });

  it("checkDatabaseIntegrity enxerga as colunas reais em vez de acusar tudo ausente", async () => {
    execute.mockResolvedValue([COLS, FIELDS]);
    const { checkDatabaseIntegrity } = await import("./db.audit");
    const out = await checkDatabaseIntegrity();
    // Com o bug, TODAS as tabelas esperadas caíam em missingTables.
    expect(out.missingTables).not.toContain("users");
    const users = out.tables.find((t: any) => t.name === "users");
    expect(users?.exists).toBe(true);
  });
});
