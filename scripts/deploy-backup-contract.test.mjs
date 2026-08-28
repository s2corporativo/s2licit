import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const deploy = read("deploy-free.sh");
const dbCron = read("backup-db-cron.sh");
const dbDump = read("backup-db.mjs");
const uploads = read("backup-uploads.sh");

describe("contratos operacionais de deploy e backup", () => {
  it("rollback usa SHA homologado persistido, nunca o HEAD inicial", () => {
    expect(deploy).toContain('STATE_FILE="$STATE_DIR/production-sha"');
    expect(deploy).toContain('ROLLBACK_SHA="${S2_DEPLOYED_SHA:-}"');
    expect(deploy).toContain('registrar_sha_publicado "$NOVO_SHA"');
    expect(deploy).not.toContain('PREV_SHA="$(git rev-parse HEAD)"');
  });

  it("backup pré-deploy não torna o offsite uma dependência da publicação", () => {
    expect(deploy).toContain("BACKUP_OFFSITE_COMMAND=");
    expect(deploy).toContain("node scripts/backup-db.mjs /app/backups");
  });

  it("cron do banco executa o dump no container e o offsite no host", () => {
    expect(dbCron).toContain("docker compose exec -T app");
    expect(dbCron).toContain("node scripts/backup-db.mjs /app/backups");
    expect(dbCron).toContain('BACKUP_FILE="$HOST_FILE" sh -c "$BACKUP_OFFSITE_COMMAND"');
    expect(dbDump).not.toContain("BACKUP_OFFSITE_COMMAND");
  });

  it("backup de uploads recupera configuração sem executar o .env", () => {
    expect(uploads).toContain("read_env_key BACKUP_OFFSITE_COMMAND");
    expect(uploads).toContain('BACKUP_FILE="$ARQ" sh -c "$BACKUP_OFFSITE_COMMAND"');
    expect(uploads).not.toMatch(/(?:^|\n)\s*(?:source|\.)\s+[^\n]*\.env/);
  });
});
