import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL obrigatória para verificar migrations.");

const rootDir = process.cwd();
const journal = JSON.parse(await readFile(path.join(rootDir, "drizzle", "meta", "_journal.json"), "utf8"));
const connection = await mysql.createConnection(databaseUrl);
try {
  const [tables] = await connection.query(
    "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '__drizzle_migrations'",
  );
  if (Number(tables?.[0]?.n ?? 0) === 0) {
    console.log("[Migration drift] Histórico ainda não existe; instalação inicial.");
    process.exit(0);
  }
  const [appliedRows] = await connection.query(
    "SELECT hash, created_at FROM `__drizzle_migrations` ORDER BY created_at ASC",
  );
  const appliedByTimestamp = new Map(appliedRows.map((row) => [Number(row.created_at), String(row.hash)]));
  const drifts = [];
  for (const entry of [...(journal.entries ?? [])].sort((a, b) => a.idx - b.idx)) {
    const appliedHash = appliedByTimestamp.get(Number(entry.when));
    if (!appliedHash) continue;
    const filePath = path.join(rootDir, "drizzle", `${entry.tag}.sql`);
    const sql = await readFile(filePath, "utf8");
    const currentHash = createHash("sha256").update(sql).digest("hex");
    if (currentHash !== appliedHash) {
      drifts.push(`${entry.tag}: banco=${appliedHash.slice(0, 12)}… arquivo=${currentHash.slice(0, 12)}…`);
    }
  }
  if (drifts.length > 0 && process.env.MIGRATION_STRICT !== "false") {
    throw new Error(
      "Migration aplicada foi alterada. Crie nova migration em vez de reescrever histórico:\n" + drifts.join("\n"),
    );
  }
  if (drifts.length > 0) console.warn("[Migration drift] Drift detectado, mas MIGRATION_STRICT=false:\n" + drifts.join("\n"));
  else console.log("[Migration drift] Histórico imutável confirmado.");
} finally {
  await connection.end();
}
