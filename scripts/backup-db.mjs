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
import { createWriteStream, mkdirSync } from "node:fs";
import { createGzip } from "node:zlib";
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

dump.on("close", (code) => {
  if (code !== 0) {
    console.error(`[backup] mysqldump saiu com código ${code}.`);
    if (stderr) console.error(stderr.trim());
    process.exit(1);
  }
});

out.on("finish", () => {
  console.log(`[backup] Concluído: ${outFile}`);
});

out.on("error", (err) => {
  console.error("[backup] Erro ao escrever o arquivo:", err.message);
  process.exit(1);
});
