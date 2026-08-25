import { describe, expect, it } from "vitest";
import { assertSchemaBootDdlAllowed } from "./schemaBootPolicy";

describe("schema boot ddl", () => {
  it("falha em produção quando explicitamente desabilitado", () => {
    const oldEnv = process.env.NODE_ENV;
    const oldFlag = process.env.SCHEMA_BOOT_DDL_ENABLED;
    process.env.NODE_ENV = "production";
    process.env.SCHEMA_BOOT_DDL_ENABLED = "false";
    try { expect(() => assertSchemaBootDdlAllowed("ALTER TABLE")).toThrow(/migration/i); }
    finally { process.env.NODE_ENV = oldEnv; process.env.SCHEMA_BOOT_DDL_ENABLED = oldFlag; }
  });
});
