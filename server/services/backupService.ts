/**
 * backupService.ts
 *
 * Backup automático do banco (spec §16). Executa mysqldump + gzip a partir da
 * DATABASE_URL e aplica retenção (remove backups além de N dias). Agendado no
 * scheduledJobs; também disponível via `pnpm db:backup` (script manual).
 *
 * As funções de montagem/parse são puras e testáveis; a execução (spawn/fs)
 * fica isolada.
 */

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { createGzip } from "node:zlib";
import path from "node:path";
import {
  copyBackupOffsite,
  isOffsiteBackupRequired,
  type OffsiteCopyResult,
} from "./backupOffsiteService";

export interface ParsedDbUrl {
  database: string;
  host: string;
  port: string;
  user: string;
  password?: string;
}

/** Extrai os campos de conexão de uma DATABASE_URL (puro). Null se inválida. */
export function parseDatabaseUrl(databaseUrl?: string | null): ParsedDbUrl | null {
  if (!databaseUrl) return null;
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null;
  }
  const database = url.pathname.replace(/^\//, "");
  if (!database) return null;
  return {
    database,
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: url.password ? decodeURIComponent(url.password) : undefined,
  };
}

/** Argumentos do mysqldump (puro), sem a senha (vai por MYSQL_PWD). */
export function buildMysqldumpArgs(p: ParsedDbUrl): string[] {
  return [
    `--host=${p.host}`,
    `--port=${p.port}`,
    `--user=${p.user}`,
    "--single-transaction",
    "--quick",
    "--routines",
    "--triggers",
    p.database,
  ];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Nome do arquivo de backup com timestamp (puro). */
export function backupFileName(now: Date): string {
  const s = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `s2-backup-${s}.sql.gz`;
}

const BACKUP_RE = /^s2-backup-(\d{4})-(\d{2})-(\d{2})-(\d{6})\.sql\.gz$/;

export function isBackupFile(name: string): boolean {
  return BACKUP_RE.test(name);
}

/** Extrai o epoch (ms) do nome do backup, ou null se não casar (puro). */
export function backupTimestamp(name: string): number | null {
  const m = BACKUP_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, hms] = m;
  const dt = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hms.slice(0, 2)),
    Number(hms.slice(2, 4)),
    Number(hms.slice(4, 6)),
  );
  const t = dt.getTime();
  return Number.isFinite(t) ? t : null;
}

/** Decide se um backup deve ser removido pela política de retenção (puro). */
export function deveRemoverBackup(name: string, agora: number, manterDias: number): boolean {
  const t = backupTimestamp(name);
  if (t == null) return false;
  const idadeDias = (agora - t) / (24 * 60 * 60 * 1000);
  return idadeDias > manterDias;
}

export interface BackupResult {
  success: boolean;
  file?: string;
  error?: string;
  offsite?: OffsiteCopyResult;
}

/** Executa o backup (impuro). Resolve com o resultado, nunca lança. */
export function runDatabaseBackup(opts?: { destDir?: string; databaseUrl?: string }): Promise<BackupResult> {
  return new Promise((resolve) => {
    const parsed = parseDatabaseUrl(opts?.databaseUrl ?? process.env.DATABASE_URL);
    if (!parsed) {
      resolve({ success: false, error: "DATABASE_URL ausente ou inválida" });
      return;
    }
    const destDir = opts?.destDir || process.env.BACKUP_DIR || "backups";
    try {
      mkdirSync(destDir, { recursive: true });
    } catch (err) {
      resolve({ success: false, error: `Não foi possível criar ${destDir}: ${(err as Error).message}` });
      return;
    }

    const outFile = path.join(destDir, backupFileName(new Date()));
    const env = { ...process.env };
    if (parsed.password) env.MYSQL_PWD = parsed.password;

    const dump = spawn("mysqldump", buildMysqldumpArgs(parsed), { env });
    const gzip = createGzip();
    const out = createWriteStream(outFile);
    let stderr = "";
    let settled = false;
    let dumpCompleted = false;
    let outputCompleted = false;

    const done = (r: BackupResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };

    const finalizeSuccess = async () => {
      if (settled || !dumpCompleted || !outputCompleted) return;
      const offsite = await copyBackupOffsite(outFile);
      if (offsite.attempted && !offsite.success && isOffsiteBackupRequired()) {
        done({
          success: false,
          file: outFile,
          offsite,
          error: `Backup local concluído, mas a cópia externa obrigatória falhou: ${offsite.error ?? "erro desconhecido"}`,
        });
        return;
      }
      done({ success: true, file: outFile, offsite });
    };

    dump.stderr.on("data", (d) => { stderr += d.toString(); });
    dump.on("error", (err) => done({ success: false, error: `mysqldump indisponível: ${err.message}` }));
    dump.on("close", (code) => {
      if (code !== 0) {
        done({ success: false, error: `mysqldump saiu com código ${code}. ${stderr.trim()}` });
        return;
      }
      dumpCompleted = true;
      void finalizeSuccess();
    });
    gzip.on("error", (err) => done({ success: false, error: `Erro ao comprimir backup: ${err.message}` }));
    out.on("finish", () => {
      outputCompleted = true;
      void finalizeSuccess();
    });
    out.on("error", (err) => done({ success: false, error: `Erro ao gravar backup: ${err.message}` }));

    dump.stdout.pipe(gzip).pipe(out);
  });
}

/** Remove backups além da retenção. Retorna quantos foram removidos (impuro). */
export function cleanupOldBackups(destDir: string, manterDias: number, agora: number): number {
  let removidos = 0;
  let arquivos: string[];
  try {
    arquivos = readdirSync(destDir);
  } catch {
    return 0;
  }
  for (const nome of arquivos) {
    if (!deveRemoverBackup(nome, agora, manterDias)) continue;
    try {
      const full = path.join(destDir, nome);
      if (statSync(full).isFile()) {
        unlinkSync(full);
        removidos++;
      }
    } catch {
      /* ignora arquivo que não pôde ser removido */
    }
  }
  return removidos;
}
