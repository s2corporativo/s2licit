import { describe, expect, it } from "vitest";
import { copyBackupOffsite } from "./backupOffsiteService";

describe("backupOffsiteService", () => {
  it("não tenta copiar quando comando externo não foi configurado", async () => {
    const old = process.env.BACKUP_OFFSITE_COMMAND;
    delete process.env.BACKUP_OFFSITE_COMMAND;
    try {
      await expect(copyBackupOffsite("/tmp/x.sql.gz")).resolves.toEqual({ attempted: false, success: false });
    } finally {
      process.env.BACKUP_OFFSITE_COMMAND = old;
    }
  });
});
