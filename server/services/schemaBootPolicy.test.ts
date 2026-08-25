import { afterEach, describe, expect, it } from "vitest";
import { schemaBootDdlEnabled } from "./schemaBootPolicy";

const oldNodeEnv = process.env.NODE_ENV;
const oldFlag = process.env.SCHEMA_BOOT_DDL_ENABLED;

afterEach(() => {
  process.env.NODE_ENV = oldNodeEnv;
  process.env.SCHEMA_BOOT_DDL_ENABLED = oldFlag;
});

describe("schemaBootPolicy", () => {
  it("bloqueia DDL de boot por padrão em produção", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SCHEMA_BOOT_DDL_ENABLED;
    expect(schemaBootDdlEnabled()).toBe(false);
  });
});
