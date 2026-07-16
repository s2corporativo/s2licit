import { describe, expect, it } from "vitest";
import {
  isIgnorableMigrationError,
  splitMigrationStatements,
} from "./migrate-production.mjs";

describe("migrate-production", () => {
  it("separa os comandos pelos breakpoints do Drizzle", () => {
    expect(
      splitMigrationStatements(
        "CREATE TABLE a (id int);--> statement-breakpoint\nALTER TABLE a ADD name text;",
      ),
    ).toEqual(["CREATE TABLE a (id int);", "ALTER TABLE a ADD name text;"]);
  });

  it("remove comandos vazios", () => {
    expect(splitMigrationStatements("  --> statement-breakpoint\n  ")).toEqual([]);
  });

  it.each([
    [1050, "ER_TABLE_EXISTS_ERROR"],
    [1060, "ER_DUP_FIELDNAME"],
    [1061, "ER_DUP_KEYNAME"],
    [1826, "ER_FK_DUP_NAME"],
  ])("aceita erro idempotente %s/%s", (errno, code) => {
    expect(isIgnorableMigrationError({ errno, code })).toBe(true);
  });

  it("não ignora erro de dados ou conexão", () => {
    expect(isIgnorableMigrationError({ errno: 1062, code: "ER_DUP_ENTRY" })).toBe(false);
    expect(isIgnorableMigrationError({ errno: 1045, code: "ER_ACCESS_DENIED_ERROR" })).toBe(false);
  });
});
