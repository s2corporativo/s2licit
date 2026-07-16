import { describe, expect, it } from "vitest";
import {
  isIgnorableMigrationError,
  isObsoleteMigrationStatement,
  normalizeMysqlIdentifiers,
  shortenMysqlIdentifier,
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

  it("mantém identificadores MySQL válidos", () => {
    expect(shortenMysqlIdentifier("fk_products_supplier")).toBe("fk_products_supplier");
  });

  it("encurta identificadores longos de forma estável e única", () => {
    const original =
      "bulk_pricing_application_details_applicationId_bulk_pricing_applications_id_fk";
    const shortened = shortenMysqlIdentifier(original);

    expect(shortened).toHaveLength(64);
    expect(shortened).toBe(shortenMysqlIdentifier(original));
    expect(shortened).not.toBe(shortenMysqlIdentifier(`${original}_other`));
  });

  it("normaliza constraint e índice sem alterar tabelas ou colunas", () => {
    const longConstraint =
      "bulk_pricing_application_details_applicationId_bulk_pricing_applications_id_fk";
    const longIndex =
      "bulk_pricing_application_details_applicationId_createdAt_search_index";
    const sql = [
      `ALTER TABLE \`bulk_pricing_application_details\` ADD CONSTRAINT \`${longConstraint}\` FOREIGN KEY (\`applicationId\`) REFERENCES \`bulk_pricing_applications\`(\`id\`)`,
      `CREATE INDEX \`${longIndex}\` ON \`bulk_pricing_application_details\` (\`applicationId\`,\`createdAt\`)`,
    ].join("; ");

    const normalized = normalizeMysqlIdentifiers(sql);

    expect(normalized).toContain("ALTER TABLE `bulk_pricing_application_details`");
    expect(normalized).toContain("FOREIGN KEY (`applicationId`)");
    expect(normalized).not.toContain(`\`${longConstraint}\``);
    expect(normalized).not.toContain(`\`${longIndex}\``);
    for (const match of normalized.matchAll(/`([^`]+)`/g)) {
      if (match[1] === "bulk_pricing_application_details") continue;
      expect(match[1].length).toBeLessThanOrEqual(64);
    }
  });

  it("marca somente o índice legado inválido de ficha técnica como obsoleto", () => {
    expect(
      isObsoleteMigrationStatement(
        "CREATE INDEX `idx_products_active_ficha` ON `products` (`isActive`,`fichaTecnica`);",
      ),
    ).toBe(true);
    expect(
      isObsoleteMigrationStatement(
        "CREATE INDEX `idx_products_active_name` ON `products` (`isActive`,`name`);",
      ),
    ).toBe(false);
    expect(
      isObsoleteMigrationStatement(
        "DROP INDEX `idx_products_active_ficha` ON `products`;",
      ),
    ).toBe(false);
  });

  it.each([
    [1050, "ER_TABLE_EXISTS_ERROR"],
    [1060, "ER_DUP_FIELDNAME"],
    [1061, "ER_DUP_KEYNAME"],
    [1826, "ER_FK_DUP_NAME"],
  ])("aceita erro idempotente %s/%s", (errno, code) => {
    expect(isIgnorableMigrationError({ errno, code })).toBe(true);
  });

  it("não ignora erro de dados, conexão, identificador ou índice TEXT", () => {
    expect(isIgnorableMigrationError({ errno: 1062, code: "ER_DUP_ENTRY" })).toBe(false);
    expect(isIgnorableMigrationError({ errno: 1045, code: "ER_ACCESS_DENIED_ERROR" })).toBe(false);
    expect(isIgnorableMigrationError({ errno: 1059, code: "ER_TOO_LONG_IDENT" })).toBe(false);
    expect(isIgnorableMigrationError({ errno: 1170, code: "ER_BLOB_KEY_WITHOUT_LENGTH" })).toBe(false);
  });
});
