import { readFile } from "node:fs/promises";

// Gate estático das correções da auditoria.
//
// Duas listas: o que PRECISA estar presente e o que NÃO PODE aparecer. A
// segunda foi acrescentada em 24/08/2026 — sem ela o gate só sabia cobrar
// presença, e uma regressão que REINTRODUZISSE um controle removido (senha em
// linha de comando, verificação de host desligada) passava despercebida.
const obrigatorios = [
  // O deploy publica a imagem fixada pelo SHA do commit, não por tag móvel:
  // `:latest` poderia apontar para outro build entre o push e o pull.
  [".github/workflows/deploy-vps.yml", "${GITHUB_SHA}"],
  // Gate integral antes de publicar. Até 24/08/2026 esta asserção falhava: o
  // deploy construía e subia em produção sem rodar teste nenhum, e a única
  // validação era o readiness — depois de já estar no ar.
  [".github/workflows/deploy-vps.yml", "pnpm test"],
  // SAST versionado. A asserção original cobrava `codeql-action`, substituído
  // deliberadamente em `a7a56f2` porque CodeQL exige GitHub Advanced Security,
  // indisponível neste repositório privado. Cobrar a ferramenta que não pode
  // rodar deixava o gate vermelho por um motivo que ninguém podia resolver.
  [".github/workflows/security.yml", "semgrep"],
  [".github/workflows/production-smoke.yml", "schedule:"],
  ["docker-compose.yml", "127.0.0.1:${APP_LOCAL_PORT:-3000}:3000"],
  ["docker-compose.yml", 'DAILY_REPORT_ENABLED: "false"'],
  ["scripts/docker-entrypoint.sh", "check-migration-drift.mjs"],
  ["server/services/pricingSafety.ts", "PRICING_DEFAULT_TAX_PERCENT"],
  ["server/_core/trpc.ts", "system.fixCatalogIntegrity"],
  ["server/routers/auditRouter.ts", "Eventos operacionais sensíveis"],
];

// Regressões que o gate precisa reprovar de forma explícita.
const proibidos = [
  // Senha em linha de comando: fica no histórico de shell e na lista de
  // processos. Foi a origem da credencial exposta tratada na PR #154.
  [".github/workflows/deploy-vps.yml", "sshpass"],
  [".github/workflows/rollback-vps.yml", "sshpass -p"],
  // Aceitar qualquer host key anula a proteção contra MITM.
  [".github/workflows/deploy-vps.yml", "StrictHostKeyChecking=no"],
  // A porta da aplicação não pode voltar a ser publicada em todas as
  // interfaces; ela fica em loopback atrás do proxy.
  ["docker-compose.yml", '"3000:3000"'],
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
