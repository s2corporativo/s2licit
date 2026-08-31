/**
 * browserUseConnector.ts
 *
 * Coletor de FALLBACK via browser-use (github.com/browser-use/browser-use,
 * MIT, Python) para portais de licitação sem API nem dados abertos — nunca
 * o caminho principal. Hierarquia obrigatória (decidida no cadastro do
 * alvo em portalCollectionTargets, não em runtime): 1º PNCP/API oficial
 * (pncpConnector), 2º Compras.gov/dados abertos (comprasGovConnector), 3º
 * este connector — só quando 1 e 2 não cobrem o portal.
 *
 * Segue o mesmo contrato funcional dos demais connectors (baseConnector.ts):
 * normalizeBrowserUseLicitacao (pura, testável) + buscarLicitacoesBrowserUse
 * (I/O). Reaproveita logApiCall/generateDedupeKey/parseDate — mesma trilha
 * de auditoria do resto do Radar.
 *
 * GUARDAS OBRIGATÓRIAS (PROMPT 2):
 *  a) LEGALIDADE — portal só coleta com registro de conformidade explícito
 *     (enabled=true E termsVerifiedAt preenchido em portalCollectionTargets).
 *     Sem isso, DESABILITADO por padrão — nunca presume permissão.
 *  b) CUSTO — teto de gasto por execução (maxUsdPerExecution), passado ao
 *     script Python; a execução é marcada cost_capped se o gasto relatado
 *     ultrapassar o teto (auditoria pós-fato — o backstop de verdade é o
 *     timeout do processo, abaixo).
 *  c) FRAGILIDADE — resultado só conta como válido se tiver todos os
 *     requiredFields preenchidos; taxa de sucesso das últimas execuções
 *     abaixo de minSuccessRate gera alerta (log + status na execução, não
 *     autodesabilita — decisão de manter ligado é humana).
 *  d) EDUCAÇÃO — intervalo mínimo entre execuções do mesmo alvo
 *     (minIntervalSeconds); robots.txt do domínio do alvo é consultado e
 *     respeitado ANTES de invocar o coletor (checarRobotsTxt/caminhoPermitidoPorRobots,
 *     puras) — path desautorizado bloqueia a coleta, mesmo com conformidade
 *     verificada; falha ao buscar/ausência de robots.txt libera (nenhuma
 *     regra = nenhuma restrição declarada pelo site).
 *
 * ISOLAMENTO — roda em subprocesso próprio (spawn, mesmo padrão de
 * server/services/backupService.ts com mysqldump) com timeout duro
 * (BROWSER_USE_TIMEOUT_MS). Falha/timeout do subprocesso NUNCA propaga
 * como exceção não tratada — sempre retorna [] e registra o erro.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { browserUseExecutions, portalCollectionTargets } from "../../drizzle/schema";
import { logApiCall, generateDedupeKey } from "./baseConnector";
import type { NormalizedLicitacao } from "./baseConnector";
import { logger } from "../_core/logger";

const TIMEOUT_MS = Number(process.env.BROWSER_USE_TIMEOUT_MS) || 180_000;
const PYTHON_BIN = process.env.BROWSER_USE_PYTHON_BIN || "python3";
const SCRIPT_PATH = path.resolve(process.cwd(), "scripts/browser-use/collector.py");

interface ScriptOutput {
  results: Record<string, string>[];
  pagesVisited: number;
  estimatedCostUsd: number;
  error: string | null;
}

export interface BrowserUseCollectionResult {
  status: "success" | "error" | "timeout" | "cost_capped" | "compliance_blocked" | "rate_limited";
  licitacoes: NormalizedLicitacao[];
  executionId: number | null;
  detail?: string;
}

/** Normaliza um item bruto do script Python para NormalizedLicitacao. Pura
 * (sem I/O) — testável sem subir o subprocesso, mesmo padrão das demais
 * normalize* do repo. */
export function normalizeBrowserUseLicitacao(
  raw: Record<string, string>,
  targetSlug: string
): NormalizedLicitacao {
  const objeto = raw.objeto || raw.descricao || "";
  const orgao = raw.orgao || "";
  const dataAbertura = raw.dataAbertura ? new Date(raw.dataAbertura) : null;
  const dataAberturaValida = dataAbertura && !isNaN(dataAbertura.getTime()) ? dataAbertura : null;
  return {
    source: `browseruse:${targetSlug}`,
    sourceId: raw.numero || raw.link || `${targetSlug}:${objeto.slice(0, 80)}`,
    orgao,
    unidadeCompradora: raw.unidadeCompradora || orgao,
    modalidade: raw.modalidade || "",
    numeroProcesso: raw.numero || "",
    objeto,
    descricaoDetalhada: raw.descricao || objeto,
    uf: (raw.uf || "").toUpperCase().slice(0, 2),
    municipio: raw.municipio || "",
    dataPublicacao: raw.dataPublicacao ? new Date(raw.dataPublicacao) : null,
    dataAbertura: dataAberturaValida,
    dataEncerramento: raw.dataEncerramento ? new Date(raw.dataEncerramento) : null,
    valorEstimado: Number(raw.valorEstimado) || 0,
    status: raw.status || "ativa",
    links: raw.link ? [raw.link] : [],
    dedupeKey: generateDedupeKey(orgao, objeto, dataAberturaValida),
  };
}

/** Um resultado bruto só conta como válido se todo requiredField do alvo
 * estiver preenchido — guarda de fragilidade (c). Pura — testável sem
 * subprocesso nem banco. */
export function resultadoValido(raw: Record<string, string>, requiredFields: string[]): boolean {
  return requiredFields.every((campo) => (raw[campo] ?? "").toString().trim().length > 0);
}

/** Guarda de legalidade (a): nunca presume permissão — só coleta com
 * enabled=true E termsVerifiedAt preenchido. Pura. */
export function alvoTemConformidadeVerificada(target: {
  enabled: boolean;
  termsVerifiedAt: Date | string | null;
}): boolean {
  return target.enabled === true && target.termsVerifiedAt != null;
}

/** Guarda de educação (d): intervalo mínimo entre execuções do mesmo alvo.
 * `ultimaExecucaoStartedAt` null = nunca rodou, sempre libera. Pura. */
export function respeitaIntervaloMinimo(
  minIntervalSeconds: number,
  ultimaExecucaoStartedAt: Date | string | null,
  agora: Date = new Date()
): boolean {
  if (!ultimaExecucaoStartedAt) return true;
  const segundosDesdeUltima = (agora.getTime() - new Date(ultimaExecucaoStartedAt).getTime()) / 1000;
  return segundosDesdeUltima >= minIntervalSeconds;
}

/** Guarda de custo (b): estourou o teto declarado para a execução. Pura. */
export function custoEstourouTeto(estimatedCostUsd: number, maxUsdPerExecution: number): boolean {
  return estimatedCostUsd > maxUsdPerExecution;
}

/** Taxa de sucesso de uma coleta (válidos / encontrados). Sem resultado
 * algum conta como 100% (nada para falhar) — evita falso alarme de
 * fragilidade quando o portal genuinamente não tinha licitação nova. Pura. */
export function calcularTaxaSucesso(resultsFound: number, resultsValid: number): number {
  return resultsFound > 0 ? resultsValid / resultsFound : 1;
}

/** Guarda de fragilidade (c): taxa de sucesso abaixo do limiar do alvo —
 * sinal de layout mudou. Pura. */
export function taxaAbaixoDoLimiar(taxaSucesso: number, minSuccessRate: number): boolean {
  return taxaSucesso < minSuccessRate;
}

/** Guarda de educação (d): o `path` de `url` é permitido pelo robots.txt
 * (conteúdo já buscado) para `userAgent`? Parser minimalista (Disallow/
 * Allow/User-agent — regras REP mais comuns; não implementa Crawl-delay
 * nem wildcard `*`/`$` em Disallow, suficiente para o caso de uso: uma
 * decisão binária por path antes de navegar). Pura — sem I/O.
 *
 * Sem grupo aplicável a `userAgent` nem a `*`, ou robotsTxt vazio: libera
 * (nenhuma regra declarada pelo site == nenhuma restrição). */
export function caminhoPermitidoPorRobots(robotsTxt: string, path: string, userAgent: string): boolean {
  if (!robotsTxt.trim()) return true;

  const linhas = robotsTxt.split(/\r?\n/).map((l) => l.split("#")[0].trim());
  const grupos: { agents: string[]; regras: { tipo: "allow" | "disallow"; caminho: string }[] }[] = [];
  let atual: (typeof grupos)[number] | null = null;

  for (const linha of linhas) {
    if (!linha) continue;
    const [chaveBruta, ...resto] = linha.split(":");
    const chave = chaveBruta.trim().toLowerCase();
    const valor = resto.join(":").trim();
    if (chave === "user-agent") {
      if (!atual || atual.regras.length > 0) {
        atual = { agents: [], regras: [] };
        grupos.push(atual);
      }
      atual.agents.push(valor.toLowerCase());
    } else if ((chave === "disallow" || chave === "allow") && atual) {
      // "Disallow:" sem valor é, pela especificação (REP), "não desautoriza
      // nada" — equivalente a um Allow universal, não a bloquear tudo.
      const tipo = chave === "disallow" && valor === "" ? "allow" : chave;
      atual.regras.push({ tipo, caminho: valor });
    }
  }

  const uaLower = userAgent.toLowerCase();
  const grupo =
    grupos.find((g) => g.agents.some((a) => a !== "*" && uaLower.includes(a))) ??
    grupos.find((g) => g.agents.includes("*"));
  if (!grupo) return true;

  // Regra mais específica (caminho mais longo) vence — mesmo critério do REP.
  let melhor: { tipo: "allow" | "disallow"; caminho: string } | null = null;
  for (const regra of grupo.regras) {
    if (path.startsWith(regra.caminho)) {
      if (!melhor || regra.caminho.length > melhor.caminho.length) melhor = regra;
    }
  }
  return !melhor || melhor.tipo === "allow";
}

const BROWSER_USE_USER_AGENT = "S2LicitBrowserUseBot/1.0 (+https://s2.com.br/bots)";

/** Busca e interpreta o robots.txt do domínio de `url`. NUNCA lança —
 * ausência/erro de rede libera a coleta (nenhuma regra declarada). */
async function respeitaRobotsTxt(url: string): Promise<boolean> {
  try {
    const alvo = new URL(url);
    const robotsUrl = `${alvo.origin}/robots.txt`;
    const resp = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": BROWSER_USE_USER_AGENT },
    });
    if (!resp.ok) return true; // sem robots.txt publicado == sem restrição
    const texto = await resp.text();
    return caminhoPermitidoPorRobots(texto, alvo.pathname, BROWSER_USE_USER_AGENT);
  } catch {
    return true; // falha de rede não pode travar a coleta por conta própria
  }
}

function runCollectorScript(config: {
  url: string;
  agentTask: string;
  maxCostUsd: number;
  requiredFields: string[];
}): Promise<{ output: ScriptOutput | null; timedOut: boolean; spawnError: string | null }> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    const child = spawn(PYTHON_BIN, [SCRIPT_PATH, JSON.stringify(config)], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ output: null, timedOut: true, spawnError: null });
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve({ output: null, timedOut: false, spawnError: err.message });
    });

    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      if (stderr) logger.warn(`[browseruse] stderr: ${stderr.slice(0, 2000)}`);
      try {
        // Última linha não vazia — o script pode emitir logs de biblioteca
        // em stdout antes do JSON final em algumas versões.
        const linhas = stdout.trim().split("\n").filter(Boolean);
        const parsed = JSON.parse(linhas[linhas.length - 1] || "{}") as ScriptOutput;
        resolve({ output: parsed, timedOut: false, spawnError: null });
      } catch (e: any) {
        resolve({ output: null, timedOut: false, spawnError: `stdout não parseável: ${e.message}` });
      }
    });
  });
}

/** Busca licitações de um alvo cadastrado. NUNCA lança — mesmo princípio
 * "à prova de falha" de comprasGovConnector.ts. */
export async function buscarLicitacoesBrowserUse(targetSlug: string): Promise<NormalizedLicitacao[]> {
  const db = await getDb();
  if (!db) return [];

  const target = (
    await db.select().from(portalCollectionTargets).where(eq(portalCollectionTargets.slug, targetSlug))
  )[0];

  if (!target) {
    logger.warn(`[browseruse] alvo desconhecido: ${targetSlug}`);
    return [];
  }

  // GUARDA (a) LEGALIDADE — nunca presume permissão.
  if (!alvoTemConformidadeVerificada(target)) {
    await registrarExecucao(db, target.id, {
      status: "compliance_blocked",
      pagesVisited: 0,
      estimatedCostUsd: 0,
      resultsFound: 0,
      resultsValid: 0,
      errorMessage: "Portal sem registro de conformidade verificado (termsVerifiedAt ausente) ou desabilitado.",
    });
    return [];
  }

  // GUARDA (d) EDUCAÇÃO — intervalo mínimo entre execuções deste alvo.
  const ultima = (
    await db
      .select()
      .from(browserUseExecutions)
      .where(eq(browserUseExecutions.targetId, target.id))
      .orderBy(desc(browserUseExecutions.startedAt))
      .limit(1)
  )[0];
  if (!respeitaIntervaloMinimo(target.minIntervalSeconds, ultima?.startedAt ?? null)) {
    logger.info(
      `[browseruse] ${targetSlug}: intervalo mínimo de ${target.minIntervalSeconds}s não atingido desde a última execução — pulando.`
    );
    return [];
  }

  // GUARDA (d) EDUCAÇÃO — robots.txt do portal.
  if (!(await respeitaRobotsTxt(target.url))) {
    await registrarExecucao(db, target.id, {
      status: "compliance_blocked",
      pagesVisited: 0,
      estimatedCostUsd: 0,
      resultsFound: 0,
      resultsValid: 0,
      errorMessage: `robots.txt de ${new URL(target.url).origin} desautoriza ${new URL(target.url).pathname}.`,
    });
    return [];
  }

  const requiredFields = Array.isArray(target.requiredFields) ? (target.requiredFields as string[]) : [];
  const maxCostUsd = Number(target.maxUsdPerExecution);
  const startedAt = Date.now();

  const { output, timedOut, spawnError } = await runCollectorScript({
    url: target.url,
    agentTask: target.agentTask,
    maxCostUsd,
    requiredFields,
  });

  const durationMs = Date.now() - startedAt;

  if (timedOut) {
    await registrarExecucao(db, target.id, {
      status: "timeout",
      pagesVisited: 0,
      estimatedCostUsd: 0,
      resultsFound: 0,
      resultsValid: 0,
      errorMessage: `Timeout após ${TIMEOUT_MS}ms — subprocesso encerrado (SIGKILL).`,
    });
    await logApiCall({
      source: `browseruse:${targetSlug}`, endpoint: target.url, requestUrl: target.url,
      statusCode: 0, contentType: "", errorMessage: "timeout", rawSample: "", durationMs, success: false,
    });
    return [];
  }

  if (spawnError || !output) {
    await registrarExecucao(db, target.id, {
      status: "error",
      pagesVisited: 0,
      estimatedCostUsd: 0,
      resultsFound: 0,
      resultsValid: 0,
      errorMessage: spawnError || "saída do coletor vazia/não parseável",
    });
    await logApiCall({
      source: `browseruse:${targetSlug}`, endpoint: target.url, requestUrl: target.url,
      statusCode: 0, contentType: "", errorMessage: spawnError || "sem saída", rawSample: "",
      durationMs, success: false,
    });
    return [];
  }

  if (output.error) {
    await registrarExecucao(db, target.id, {
      status: "error",
      pagesVisited: output.pagesVisited,
      estimatedCostUsd: output.estimatedCostUsd,
      resultsFound: 0,
      resultsValid: 0,
      errorMessage: output.error,
    });
    return [];
  }

  // GUARDA (b) CUSTO — auditoria pós-fato (o teto de verdade é imposto ao
  // script via maxCostUsd/passos; aqui só classificamos e alertamos).
  const custoEstourou = custoEstourouTeto(output.estimatedCostUsd, maxCostUsd);

  // GUARDA (c) FRAGILIDADE — só conta como válido quem tem os campos mínimos.
  const validos = output.results.filter((r) => resultadoValido(r, requiredFields));
  const taxaSucesso = calcularTaxaSucesso(output.results.length, validos.length);
  const abaixoDoLimiar = taxaAbaixoDoLimiar(taxaSucesso, Number(target.minSuccessRate));

  if (abaixoDoLimiar) {
    logger.warn(
      `[browseruse] ${targetSlug}: taxa de sucesso ${(taxaSucesso * 100).toFixed(0)}% abaixo do limiar ` +
        `${(Number(target.minSuccessRate) * 100).toFixed(0)}% — possível mudança de layout. Alvo continua ` +
        `habilitado (decisão de desligar é humana); revise portalCollectionTargets.slug='${targetSlug}'.`
    );
  }

  await registrarExecucao(db, target.id, {
    status: custoEstourou ? "cost_capped" : "success",
    pagesVisited: output.pagesVisited,
    estimatedCostUsd: output.estimatedCostUsd,
    resultsFound: output.results.length,
    resultsValid: validos.length,
    errorMessage: custoEstourou
      ? `Custo estimado (US$ ${output.estimatedCostUsd.toFixed(4)}) excedeu o teto (US$ ${maxCostUsd.toFixed(4)}).`
      : abaixoDoLimiar
        ? `Taxa de sucesso abaixo do limiar: ${(taxaSucesso * 100).toFixed(0)}%.`
        : null,
  });

  await logApiCall({
    source: `browseruse:${targetSlug}`, endpoint: target.url, requestUrl: target.url,
    statusCode: 200, contentType: "application/json",
    rawSample: JSON.stringify(output).slice(0, 2000), durationMs, success: true,
  });

  return validos.map((r) => normalizeBrowserUseLicitacao(r, targetSlug));
}

async function registrarExecucao(
  db: Awaited<ReturnType<typeof getDb>>,
  targetId: number,
  stats: {
    status: "success" | "error" | "timeout" | "cost_capped" | "compliance_blocked";
    pagesVisited: number;
    estimatedCostUsd: number;
    resultsFound: number;
    resultsValid: number;
    errorMessage: string | null;
  }
): Promise<void> {
  if (!db) return;
  try {
    await db.insert(browserUseExecutions).values({
      targetId,
      finishedAt: new Date(),
      status: stats.status,
      pagesVisited: stats.pagesVisited,
      estimatedCostUsd: stats.estimatedCostUsd.toFixed(4),
      resultsFound: stats.resultsFound,
      resultsValid: stats.resultsValid,
      errorMessage: stats.errorMessage?.slice(0, 2000),
    });
  } catch (e) {
    logger.error(`[browseruse] falha ao registrar execução: ${e}`);
  }
}
