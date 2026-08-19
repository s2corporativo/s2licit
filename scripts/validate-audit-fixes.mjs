import { readFile } from "node:fs/promises";

const checks = [
  [".github/workflows/deploy-vps.yml", "VPS_SSH_PRIVATE_KEY"],
  [".github/workflows/deploy-vps.yml", "pnpm test"],
  [".github/workflows/security.yml", "codeql-action"],
  [".github/workflows/production-smoke.yml", "schedule:"],
  ["docker-compose.yml", "127.0.0.1:${APP_LOCAL_PORT:-3000}:3000"],
  ["docker-compose.yml", "DAILY_REPORT_ENABLED: \"false\""],
  ["scripts/docker-entrypoint.sh", "check-migration-drift.mjs"],
  ["server/services/pricingSafety.ts", "PRICING_DEFAULT_TAX_PERCENT"],
  ["server/_core/trpc.ts", "system.fixCatalogIntegrity"],
  ["server/routers/auditRouter.ts", "Eventos operacionais sensíveis"],
];

let failed = false;
for (const [file, needle] of checks) {
  const content = await readFile(file, "utf8");
  if (!content.includes(needle)) {
    console.error(`FAIL ${file}: ausente ${needle}`);
    failed = true;
  } else {
    console.log(`OK ${file}: ${needle}`);
  }
}
if (failed) process.exit(1);
