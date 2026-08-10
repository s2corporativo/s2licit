#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const errors = [];
const warnings = [];

function requireFile(file) {
  if (!exists(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

function requireText(file, pattern, message) {
  if (!exists(file)) return errors.push(`Arquivo obrigatório ausente: ${file}`);
  if (!pattern.test(read(file))) errors.push(message);
}

function forbidText(file, pattern, message) {
  if (!exists(file)) return;
  if (pattern.test(read(file))) errors.push(message);
}

const required = [
  "server/integrations/core/types.ts",
  "server/integrations/core/integrationError.ts",
  "server/integrations/core/integrationRegistry.ts",
  "server/integrations/core/credentialResolver.ts",
  "server/integrations/core/externalHttpClient.ts",
  "server/integrations/core/integrationResult.ts",
  "server/integrations/core/integrationCache.ts",
  "server/services/integrationCopilotService.ts",
  "drizzle/integrationSchema.ts",
  "docs/ARQUITETURA-INTEGRACOES.md",
];
required.forEach(requireFile);

if (exists("server/utils/safeFetch.ts")) {
  errors.push("safeFetch.ts ainda existe; a plataforma deve possuir um único cliente HTTP externo.");
}

requireText(
  "server/_core/llm.ts",
  /https:\/\/api\.anthropic\.com\/v1\/messages/,
  "Gateway de IA não aponta para a Anthropic Messages API nativa.",
);
forbidText(
  "server/_core/llm.ts",
  /api\.anthropic\.com\/v1\/chat\/completions/,
  "Endpoint Anthropic OpenAI-style legado ainda está presente.",
);
requireText(
  "server/_core/llm.ts",
  /anthropic-version/,
  "Gateway Anthropic não envia anthropic-version.",
);
requireText(
  "server/_core/llm.ts",
  /x-api-key/,
  "Gateway Anthropic não envia x-api-key.",
);

requireText(
  "server/routers/pncpRadar.ts",
  /editorProcedure/,
  "Radar não está protegido por editorProcedure no backend.",
);
requireText(
  "client/src/App.tsx",
  /path="\/radar-pncp"[\s\S]{0,300}minRole="editor"/,
  "Rota do Radar no frontend não exige papel editor.",
);

for (const file of [
  "server/services/integrationSettingsService.ts",
  "server/services/emailConfigService.ts",
  "server/services/aiConfigService.ts",
]) {
  forbidText(
    file,
    /process\.env\s*\[[^\]]+\]\s*=|process\.env\.[A-Z0-9_]+\s*=/,
    `${file} ainda muta process.env em runtime.`,
  );
}

forbidText(
  "server/integrations/core/externalHttpClient.ts",
  /OrcaBudget|orcabudget\.manus\.space/i,
  "User-Agent legado OrcaBudget ainda está presente no cliente HTTP.",
);

const sourceFiles = [
  "server/connectors/brasilApiConnector.ts",
  "server/connectors/comprasGovConnector.ts",
  "server/connectors/pncpConnector.ts",
  "server/connectors/fiemgConnector.ts",
];
for (const file of sourceFiles) {
  if (!exists(file)) continue;
  forbidText(
    file,
    /\.catch\([^)]*=>\s*\[\s*\]\s*\)/,
    `${file} possui padrão suspeito que pode transformar falha externa em lista vazia silenciosa.`,
  );
}

if (exists("server/services/integrationStatusService.ts") && /PRODEMGE_API_KEY/.test(read("server/services/integrationStatusService.ts"))) {
  errors.push("PRODEMGE_API_KEY órfã continua sendo tratada como integração ativa no Diagnóstico.");
}

if (!exists(".github/workflows/ci.yml")) {
  warnings.push("Workflow de CI não existe. Execute pnpm check/test/build localmente antes do merge.");
}

if (errors.length) {
  console.error("\n❌ Plataforma de Integrações: invariantes violadas\n");
  errors.forEach((error) => console.error(` - ${error}`));
  if (warnings.length) {
    console.error("\nAvisos:");
    warnings.forEach((warning) => console.error(` - ${warning}`));
  }
  process.exit(1);
}

console.log("\n✅ Plataforma de Integrações: invariantes arquiteturais verificadas.");
if (warnings.length) {
  console.log("\nAvisos:");
  warnings.forEach((warning) => console.log(` - ${warning}`));
}
