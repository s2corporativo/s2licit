import { describe, it, expect } from "vitest";
import {
  parseDatabaseUrl,
  buildMysqldumpArgs,
  backupFileName,
  isBackupFile,
  backupTimestamp,
  deveRemoverBackup,
} from "./backupService";

describe("parseDatabaseUrl", () => {
  it("extrai host/porta/usuário/senha/banco", () => {
    const p = parseDatabaseUrl("mysql://s2user:s3nh%40@db.local:3307/sistema_s2");
    expect(p).toEqual({ database: "sistema_s2", host: "db.local", port: "3307", user: "s2user", password: "s3nh@" });
  });

  it("usa 3306 como porta padrão", () => {
    expect(parseDatabaseUrl("mysql://u:p@host/base")?.port).toBe("3306");
  });

  it("rejeita URL ausente, inválida ou sem banco", () => {
    expect(parseDatabaseUrl(null)).toBeNull();
    expect(parseDatabaseUrl("não-é-url")).toBeNull();
    expect(parseDatabaseUrl("mysql://u:p@host/")).toBeNull();
  });
});

describe("buildMysqldumpArgs", () => {
  it("monta os argumentos sem expor a senha", () => {
    const args = buildMysqldumpArgs({ database: "base", host: "h", port: "3306", user: "u", password: "secreta" });
    expect(args).toContain("--host=h");
    expect(args).toContain("--single-transaction");
    expect(args[args.length - 1]).toBe("base");
    expect(args.join(" ")).not.toContain("secreta");
  });
});

describe("nomes e retenção de backup", () => {
  it("gera e reconhece o nome com timestamp", () => {
    const nome = backupFileName(new Date(2026, 6, 16, 3, 5, 9));
    expect(nome).toBe("s2-backup-2026-07-16-030509.sql.gz");
    expect(isBackupFile(nome)).toBe(true);
    expect(isBackupFile("outro.sql.gz")).toBe(false);
  });

  it("extrai o timestamp do nome", () => {
    const t = backupTimestamp("s2-backup-2026-07-16-030509.sql.gz");
    expect(t).toBe(new Date(2026, 6, 16, 3, 5, 9).getTime());
    expect(backupTimestamp("invalido.gz")).toBeNull();
  });

  it("remove apenas backups além da retenção", () => {
    const agora = new Date(2026, 6, 16, 12, 0, 0).getTime();
    const antigo = "s2-backup-2026-07-01-020000.sql.gz"; // 15 dias
    const recente = "s2-backup-2026-07-15-020000.sql.gz"; // 1 dia
    expect(deveRemoverBackup(antigo, agora, 14)).toBe(true);
    expect(deveRemoverBackup(recente, agora, 14)).toBe(false);
    expect(deveRemoverBackup("nao-backup.txt", agora, 14)).toBe(false);
  });
});
