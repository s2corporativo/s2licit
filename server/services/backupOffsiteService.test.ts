import { describe, expect, it } from "vitest";
import {
  isOffsiteBackupConfigured,
  isOffsiteBackupRequired,
} from "./backupOffsiteService";

describe("backupOffsiteService", () => {
  it("não exige destino externo quando nenhum comando foi configurado", () => {
    expect(isOffsiteBackupConfigured({})).toBe(false);
    expect(isOffsiteBackupRequired({})).toBe(false);
  });

  it("considera a cópia externa obrigatória por padrão quando configurada", () => {
    const env = { BACKUP_OFFSITE_COMMAND: "rclone copy $BACKUP_FILE remote:s2" };
    expect(isOffsiteBackupConfigured(env)).toBe(true);
    expect(isOffsiteBackupRequired(env)).toBe(true);
  });

  it("permite best-effort somente por configuração explícita", () => {
    const env = {
      BACKUP_OFFSITE_COMMAND: "rclone copy $BACKUP_FILE remote:s2",
      BACKUP_OFFSITE_REQUIRED: "false",
    };
    expect(isOffsiteBackupRequired(env)).toBe(false);
  });
});
