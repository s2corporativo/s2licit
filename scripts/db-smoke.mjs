#!/usr/bin/env node
/**
 * Smoke test local do S2 Licit — pente-fino automatizado.
 *
 * Substitui o que só existia ad hoc: aplica as migrações reais, confere que
 * `drizzle/schema.ts` não divergiu do banco, sobe o servidor de verdade
 * (AUTH_DISABLED=true, para não exigir credenciais) e varre TODAS as
 * queries tRPC em busca de INTERNAL_SERVER_ERROR — a classe de bug que a
 * suíte com mock não pega, porque ela testa a lógica isolada, não o SELECT
 * batendo nas colunas reais do banco.
 *
 * Achou de verdade, na auditoria que o originou: drift de coluna em
 * email_settings (500 em 3 telas) e o diagnóstico de banco invertido em
 * /admin/database-health.
 *
 * NÃO apaga nem recria o banco — as migrações são idempotentes (o runner de
 * produção trata ER_DUP_FIELDNAME como no-op), então é seguro rodar contra
 * um banco de dev já em uso. Escritas do smoke ficam restritas ao próprio
 * boot do servidor; a varredura só faz leitura (queries, não mutations).
 *
 * Uso:
 *   DATABASE_URL=mysql://root:root@127.0.0.1:3307/s2licit pnpm smoke
 *
 * Requer um MySQL acessível — não sobe container sozinho. Para um banco
 * descartável rápido:
 *   docker run -d --name s2licit-smoke -e MYSQL_ROOT_PASSWORD=root \
 *     -e MYSQL_DATABASE=s2licit -p 3307:3306 mysql:8.0
 *
 * Variáveis:
 *  DATABASE_URL   obrigatória — banco a verificar (nunca aponte para produção)
 *  SMOKE_PORT     porta do servidor efêmero (padrão: 3099)
 *  SMOKE_TIMEOUT_MS  tempo máximo de boot em ms (padrão: 30000)
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.DATABASE_URL;
const port = Number(process.env.SMOKE_PORT || 3099);
const bootTimeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 30_000);

if (!databaseUrl) {
  console.error("[db-smoke] DATABASE_URL é obrigatória. Nunca aponte para produção.");
  process.exit(1);
}

let failed = false;
const fail = (msg) => {
  console.error(`[db-smoke] ❌ ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`[db-smoke] ✅ ${msg}`);
const info = (msg) => console.log(`[db-smoke] ${msg}`);

// ── 1. Migrações reais (idempotentes — seguro repetir) ──────────────────
info("Aplicando migrações...");
{
  const { runProductionMigrations } = await import(path.join(rootDir, "scripts", "migrate-production.mjs"));
  try {
    await runProductionMigrations({ databaseUrl });
    ok("Migrações aplicadas/confirmadas.");
  } catch (err) {
    fail(`Migração falhou: ${err.message}`);
    process.exit(1); // sem banco íntegro, o resto não tem base para rodar
  }
}

// ── 2. Drift schema.ts × banco (mesma checagem usada na auditoria) ──────
info("Conferindo drift entre drizzle/schema.ts e o banco...");
{
  const { getTableConfig } = await import("drizzle-orm/mysql-core");
  const schema = await import(path.join(rootDir, "drizzle", "schema.ts"));
  const conn = await mysql.createConnection(databaseUrl);
  try {
    const [rows] = await conn.query(
      "SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE()"
    );
    const live = new Map();
    for (const r of rows) {
      if (!live.has(r.t)) live.set(r.t, new Set());
      live.get(r.t).add(r.c);
    }
    const missingTables = [];
    const missingCols = [];
    for (const val of Object.values(schema)) {
      let cfg;
      try { cfg = getTableConfig(val); } catch { continue; }
      if (!cfg?.name) continue;
      if (!live.has(cfg.name)) { missingTables.push(cfg.name); continue; }
      const have = live.get(cfg.name);
      for (const col of cfg.columns) {
        if (!have.has(col.name)) missingCols.push(`${cfg.name}.${col.name}`);
      }
    }
    if (missingTables.length || missingCols.length) {
      fail(`Drift de schema: ${missingTables.length} tabela(s), ${missingCols.length} coluna(s) ausente(s).`);
      [...missingTables, ...missingCols].forEach((x) => console.error(`    - ${x}`));
    } else {
      ok("schema.ts bate com o banco — sem drift.");
    }
  } finally {
    await conn.end();
  }
}

// ── 3. Sobe o servidor de verdade (AUTH_DISABLED=true, dev-only) ────────
info(`Subindo o servidor na porta ${port} (AUTH_DISABLED=true)...`);
const server = spawn(
  process.execPath,
  ["--import", "tsx", "server/_core/index.ts"],
  {
    cwd: rootDir,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: "development",
      AUTH_DISABLED: "true",
      PORT: String(port),
      JWT_SECRET: process.env.JWT_SECRET || "x".repeat(48),
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "y".repeat(48),
      SCRAPER_SCHEDULE_ENABLED: "false",
      EMAIL_SYNC_ENABLED: "false",
      ALERTS_ENABLED: "false",
      BACKUP_ENABLED: "false",
      PORTAL_LOGIN_SMOKETEST_ENABLED: "false",
      QUOTATION_AUTO_PIPELINE_ENABLED: "false",
      PORTAL_AUTH_DISCOVERY_ENABLED: "false",
      FAILURE_ALERTS_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });

const baseUrl = `http://127.0.0.1:${port}`;
const deadline = Date.now() + bootTimeoutMs;
let booted = false;
while (Date.now() < deadline) {
  try {
    const r = await fetch(`${baseUrl}/healthz`);
    if (r.ok) { booted = true; break; }
  } catch { /* ainda subindo */ }
  await new Promise((r) => setTimeout(r, 500));
}

if (!booted) {
  fail(`Servidor não respondeu /healthz em ${bootTimeoutMs}ms.`);
  console.error(serverLog.slice(-4000));
  server.kill("SIGKILL");
  process.exit(1);
}
ok("Servidor no ar.");

// ── 4. Varredura de todas as queries tRPC ────────────────────────────────
info("Varrendo procedimentos tRPC (queries)...");
try {
  const { appRouter } = await import(path.join(rootDir, "server", "routers.ts"));
  const procs = Object.entries(appRouter._def.procedures)
    .filter(([, p]) => (p._def.type ?? (p._def.query ? "query" : "mutation")) === "query")
    .map(([path_]) => path_);

  const results = [];
  const CONC = 6;
  async function hit(p) {
    try {
      const r = await fetch(`${baseUrl}/api/trpc/${p}`);
      const j = await r.json().catch(() => null);
      const err = j?.error?.json ?? j?.error;
      const code = err?.data?.code ?? err?.code ?? "OK";
      results.push({ p, code, msg: (err?.message ?? "").split("\n")[0].slice(0, 160) });
    } catch (e) {
      results.push({ p, code: "NETWORK", msg: String(e.message).slice(0, 120) });
    }
  }
  for (let i = 0; i < procs.length; i += CONC) {
    await Promise.all(procs.slice(i, i + CONC).map(hit));
  }

  const bugs = results.filter((r) => r.code === "INTERNAL_SERVER_ERROR" || r.code === "NETWORK");
  const authBlocked = results.filter((r) => ["UNAUTHORIZED", "FORBIDDEN"].includes(r.code));

  info(`${results.length} queries testadas — ${results.filter((r) => r.code === "OK").length} OK.`);
  if (authBlocked.length > 0) {
    fail(`${authBlocked.length} query(s) bloqueada(s) por auth mesmo com AUTH_DISABLED=true:`);
    authBlocked.forEach((b) => console.error(`    - ${b.p}`));
  }
  if (bugs.length > 0) {
    fail(`${bugs.length} query(s) com erro de servidor:`);
    bugs.forEach((b) => console.error(`    - ${b.p}: ${b.msg}`));
  }
  if (bugs.length === 0 && authBlocked.length === 0) ok("Nenhum erro de servidor nem bloqueio de auth.");
} catch (err) {
  fail(`Varredura não pôde rodar: ${err.message}`);
}

// ── 5. Saúde do banco reportada pelo próprio sistema ─────────────────────
info("Conferindo /admin/database-health (audit.checkDatabaseIntegrity)...");
try {
  const r = await fetch(`${baseUrl}/api/trpc/audit.checkDatabaseIntegrity`);
  const j = await r.json();
  const d = j?.result?.data?.json;
  if (d?.status === "critical") {
    fail(`Saúde do banco: critical — ${d.summary}`);
  } else {
    ok(`Saúde do banco: ${d?.status ?? "?"} — ${d?.summary ?? ""}`);
  }
} catch (err) {
  fail(`Não foi possível checar a saúde do banco: ${err.message}`);
}

// ── Encerramento ──────────────────────────────────────────────────────────
server.kill("SIGKILL");
await new Promise((r) => setTimeout(r, 300));

if (failed) {
  console.error("\n[db-smoke] RESULTADO: FALHOU — veja os ❌ acima.");
  process.exit(1);
} else {
  console.log("\n[db-smoke] RESULTADO: OK.");
  process.exit(0);
}
