import { readFile } from "node:fs/promises";

// Gate estático das correções da auditoria.
const obrigatorios = [
  [".github/workflows/deploy-vps.yml", "${GITHUB_SHA}"],
  [".github/workflows/deploy-vps.yml", "pnpm test"],
  [".github/workflows/security.yml", "semgrep"],
  [".github/workflows/production-smoke.yml", "schedule:"],
  ["docker-compose.yml", "127.0.0.1:${APP_LOCAL_PORT:-3000}:3000"],
  ["docker-compose.yml", 'DAILY_REPORT_ENABLED: "false"'],
  ["scripts/docker-entrypoint.sh", "check-migration-drift.mjs"],
  ["server/services/pricingSafety.ts", "PRICING_DEFAULT_TAX_PERCENT"],
  ["server/_core/trpc.ts", "system.fixCatalogIntegrity"],
  ["server/routers/auditRouter.ts", "Eventos operacionais sensíveis"],
  // Quantidade comercial: contrato decimal e fonte única de validação.
  ["drizzle/schema.ts", 'quantity: decimal("quantity", { precision: 15, scale: 4 })'],
  ["shared/proposalQuantity.ts", "tryParseProposalQuantity"],
  ["drizzle/0032_proposal_quantity_decimal.sql", "DECIMAL(15,4)"],
  ["drizzle/0031_email_settings_filters.sql", "senderFilter"],
  ["server/services/quotationPortalHandoffService.ts", "preserveProposalQuantity"],
];

const proibidos = [
  [".github/workflows/deploy-vps.yml", "sshpass"],
  [".github/workflows/rollback-vps.yml", "sshpass -p"],
  [".github/workflows/deploy-vps.yml", "StrictHostKeyChecking=no"],
  ["docker-compose.yml", '"3000:3000"'],
  // Regra específica: quantidade não pode voltar a ser truncada/arredondada.
  ["client/src/pages/PropostaEditor.tsx", "parseInt(qty)"],
  ["client/src/pages/PropostaEditor.tsx", "parseInt(manualForm.quantity)"],
  ["server/services/quotationPortalHandoffService.ts", "Math.round(item.quantidade)"],
];

let falhou = false;

for (const [arquivo, trecho] of obrigatorios) {
  const conteudo = await readFile(arquivo, "utf8");
  if (!conteudo.includes(trecho)) {
    console.error(`FAIL ${arquivo}: ausente ${trecho}`);
    falhou = true;
  } else {
    console.log(`OK   ${arquivo}: ${trecho}`);
  }
}

for (const [arquivo, trecho] of proibidos) {
  const conteudo = await readFile(arquivo, "utf8");
  if (conteudo.includes(trecho)) {
    console.error(`FAIL ${arquivo}: reintroduziu ${trecho}`);
    falhou = true;
  } else {
    console.log(`OK   ${arquivo}: sem ${trecho}`);
  }
}

if (falhou) process.exit(1);
console.log("\nGate estático da auditoria aprovado.");
