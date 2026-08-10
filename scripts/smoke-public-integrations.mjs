#!/usr/bin/env node

const TIMEOUT_MS = Number(process.env.INTEGRATION_SMOKE_TIMEOUT_MS || 20000);

function yyyymmdd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

async function request(name, url, validate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "S2Licit/2.0 integration-smoke",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`resposta não JSON (${response.headers.get("content-type") || "sem content-type"})`);
    }
    validate(data);
    console.log(`✅ ${name} — ${response.status} — ${Date.now() - started} ms`);
    return true;
  } catch (error) {
    console.error(`❌ ${name} — ${error instanceof Error ? error.message : String(error)}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const now = new Date();
const start = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

const checks = [
  request(
    "PNCP publicações",
    `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=${yyyymmdd(start)}&dataFinal=${yyyymmdd(now)}&codigoModalidadeContratacao=8&pagina=1&tamanhoPagina=5`,
    (data) => {
      if (!data || typeof data !== "object" || !Array.isArray(data.data)) {
        throw new Error("contrato inesperado: esperado objeto com data[]");
      }
      if (typeof data.totalPaginas !== "number" && data.totalPaginas != null) {
        throw new Error("contrato inesperado: totalPaginas não numérico");
      }
    },
  ),
  request(
    "Compras.gov contratações 14.133",
    `https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?pagina=1&tamanhoPagina=5&dataPublicacaoPncpInicial=${isoDate(start)}&dataPublicacaoPncpFinal=${isoDate(now)}`,
    (data) => {
      if (!data || typeof data !== "object") throw new Error("contrato inesperado: resposta não objeto");
      const rows = data.resultado ?? data.data;
      if (!Array.isArray(rows)) {
        throw new Error("contrato inesperado: esperado resultado[] ou data[]");
      }
    },
  ),
];

const results = await Promise.all(checks);
if (results.some((ok) => !ok)) {
  console.error("\nSmoke test público falhou. Não trate falha externa como ausência de oportunidades.");
  process.exit(1);
}
console.log("\n✅ Smoke test público concluído com sucesso.");
