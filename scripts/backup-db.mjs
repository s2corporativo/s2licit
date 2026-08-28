#!/usr/bin/env node
/**
 * Backup local do banco MySQL a partir de DATABASE_URL.
 *
 * Uso interno:
 *   node scripts/backup-db.mjs [diretorio-destino]
 *
 * Em produção use `scripts/backup-db-cron.sh`: ele executa este dump dentro
 * do container (onde DATABASE_URL e o hostname `db` são válidos), copia a
 * evidência verificada para o host e só então executa a etapa offsite.
 *
 * Requer `mysqldump`. Gera `s2-backup-AAAA-MM-DD-HHMMSS.sql.gz`.
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
      // arquivo pode ter sido removido em paralelo
    }
  }
  if (removed > 0) console.log(`[backup] Retenção: ${removed} backup(s) com mais de ${keepDays} dias removido(s).`);
}

const dumpClosed = new Promise((resolve, reject) => {
  dump.on("close", (code) => {
    if (code !== 0) reject(new Error(`mysqldump saiu com código ${code}. ${stderr.trim()}`));
    else resolve();
  });
});

const fileWritten = new Promise((resolve, reject) => {
  out.on("finish", resolve);
  out.on("error", reject);
});

try {
  await Promise.all([dumpClosed, fileWritten]);
  await verifyGzip(outFile);
  rotateOldBackups();
  console.log(`[backup] Concluído e verificado: ${outFile}`);
} catch (err) {
  console.error(`[backup] FALHOU: ${err.message}`);
  try { unlinkSync(outFile); } catch { /* arquivo parcial pode nem existir */ }
  process.exit(1);
}
