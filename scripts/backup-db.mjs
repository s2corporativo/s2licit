#!/usr/bin/env node
/**
 * Backup do banco de dados MySQL a partir de DATABASE_URL.
 *
 * Uso:
 *   node scripts/backup-db.mjs [diretorio-destino]
 *
 * Requer o cliente `mysqldump` instalado (pacote mysql-client).
 * Gera um arquivo comprimido `s2-backup-AAAA-MM-DD-HHMMSS.sql.gz`.
 *
 * Agendamento sugerido (cron diário às 2h):
 *   0 2 * * * cd /caminho/do/projeto && node scripts/backup-db.mjs /backups >> /var/log/s2-backup.log 2>&1
 */

import "dotenv/config";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { createGunzip, createGzip } from "node:zlib";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[backup] DATABASE_URL não definido no ambiente/.env");
  process.exit(1);
}

let url;
try {
  url = new URL(databaseUrl);
} catch {
  console.error("[backup] DATABASE_URL inválido.");
  process.exit(1);
}

const database = url.pathname.replace(/^\//, "");
if (!database) {
  console.error("[backup] Nome do banco ausente em DATABASE_URL.");
  process.exit(1);
}

const destDir = process.argv[2] || "backups";
mkdirSync(destDir, { recursive: true });

// Timestamp AAAA-MM-DD-HHMMSS
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const outFile = path.join(destDir, `s2-backup-${stamp}.sql.gz`);

const args = [
  `--host=${url.hostname}`,
  `--port=${url.port || "3306"}`,
  `--user=${decodeURIComponent(url.username)}`,
  "--single-transaction",
  "--quick",
  "--routines",
  "--triggers",
  database,
];

const env = { ...process.env };
if (url.password) env.MYSQL_PWD = decodeURIComponent(url.password);

console.log(`[backup] Exportando '${database}' para ${outFile} ...`);

const dump = spawn("mysqldump", args, { env });
const gzip = createGzip();
const out = createWriteStream(outFile);

dump.stdout.pipe(gzip).pipe(out);

let stderr = "";
dump.stderr.on("data", (d) => { stderr += d.toString(); });

dump.on("error", (err) => {
  console.error("[backup] Falha ao executar mysqldump. Ele está instalado?", err.message);
  process.exit(1);
});

/** Confere se o .gz gerado descomprime do início ao fim (integridade). */
function verifyGzip(file) {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    createReadStream(file)
      .pipe(gunzip)
      .on("data", () => {})
      .on("end", resolve)
      .on("error", reject);
    gunzip.on("error", reject);
  });
}

/** Remove backups mais antigos que BACKUP_KEEP_DAYS (padrão 14). */
function rotateOldBackups() {
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS) || 14;
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const name of readdirSync(destDir)) {
    if (!/^s2-backup-.*\.sql\.gz$/.test(name)) continue;
    const file = path.join(destDir, name);
    try {
      if (statSync(file).mtimeMs < cutoff) {
        unlinkSync(file);
        removed++;
      }
    } catch {
      // arquivo pode ter sido removido em paralelo — ignorar
    }
  }
  if (removed > 0) console.log(`[backup] Retenção: ${removed} backup(s) com mais de ${keepDays} dias removido(s).`);
}

const dumpClosed = new Promise((resolve, reject) => {
  dump.on("close", (code) => {
    if (code !== 0) {
      reject(new Error(`mysqldump saiu com código ${code}. ${stderr.trim()}`));
    } else {
      resolve();
    }
  });
});

const fileWritten = new Promise((resolve, reject) => {
  out.on("finish", resolve);
  out.on("error", reject);
});

/**
 * Cópia offsite (regra 3-2-1) — mesma convenção do backupService interno e do
 * docs/BACKUP-RESTORE.md: BACKUP_OFFSITE_COMMAND é um comando shell que recebe
 * o caminho em $BACKUP_FILE (ex.: rclone copy "$BACKUP_FILE" gdrive:s2-backups/).
 * Sem a variável é no-op; falha do envio não invalida o backup local, mas
 * encerra com erro para ficar visível no log do cron.
 */
function offsiteCopy(file) {
  const command = process.env.BACKUP_OFFSITE_COMMAND?.trim();
  if (!command) {
    console.log("[backup] Offsite desativado (defina BACKUP_OFFSITE_COMMAND para ativar).");
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const rc = spawn("sh", ["-c", command], {
      stdio: "inherit",
      env: { ...process.env, BACKUP_FILE: file },
    });
    rc.on("error", (err) => {
      console.error(`[backup] Falha ao executar o comando offsite: ${err.message}`);
      resolve(false);
    });
    rc.on("close", (code) => {
      if (code === 0) {
        console.log("[backup] Cópia offsite concluída.");
        resolve(true);
      } else {
        console.error(`[backup] Envio offsite falhou (código ${code}).`);
        resolve(false);
      }
    });
  });
}

try {
  await Promise.all([dumpClosed, fileWritten]);
  await verifyGzip(outFile);
  rotateOldBackups();
  console.log(`[backup] Concluído e verificado: ${outFile}`);
  const offsiteOk = await offsiteCopy(outFile);
  if (!offsiteOk) process.exit(1);
} catch (err) {
  console.error(`[backup] FALHOU: ${err.message}`);
  try { unlinkSync(outFile); } catch { /* arquivo parcial pode nem existir */ }
  process.exit(1);
}
