import cron from "node-cron";
import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { getDb } from "../db";
import { certidoes, emailQuotations, scraperConfigs } from "../../drizzle/schema";
import { isImapConfigured } from "./emailInboxService";
import { syncEmailQuotations } from "./emailQuotationSyncService";
import {
  isAutoPipelineEnabled,
  runAutoPipelineForPending,
} from "./quotationAutoPipelineService";
import { syncS2PortalOpportunitiesSafely } from "./s2PortalOpportunityOrchestrator";
import { checkPortalLoginHealth } from "./portalAuthenticatedDiscoveryService";
import { S2_TARGET_PORTALS } from "./s2TargetPortals";
import { classificarValidade } from "../routers/certidoes";
import { notifyOwner } from "../_core/notification";
import { enviarWhatsapp, isWhatsappConfigured } from "./whatsappService";
import { executarScraper } from "./scraperEngine";
import { expandAndSyncTambasaCatalog } from "./tambasaCatalogService";
import { runDatabaseBackup, cleanupOldBackups } from "./backupService";
import { runQuotationRematchSafely } from "./quotationRematchService";
import { sendQuotationDailyReportSafely } from "./quotationDailyReportService";
import { logger } from "../_core/logger";

/**
 * Agendador central de jobs recorrentes.
 *
 * - Sincronização de cotações por e-mail (se IMAP configurado).
 * - Radar COPASA, CEMIG, Fundep, Funarbe, Compras MG e FIEMG/SESI/SENAI.
 * - Notificações proativas diárias (certidões vencendo, prazos de cotação).
 *
 * Tudo desligável por ambiente. As expressões cron podem ser sobrescritas.
 */

const DEFAULT_EMAIL_SYNC_CRON = "*/15 * * * *"; // a cada 15 min
const DEFAULT_PORTAL_OPPORTUNITY_SYNC_CRON = "0 7,12,17 * * *"; // 3x/dia
const DEFAULT_ALERTS_CRON = "0 8 * * *"; // todo dia às 8h
const DEFAULT_DAILY_REPORT_CRON = "0 7 * * *"; // relatório diário 7h00 (e-mail + scrapers + PNPC)
const DEFAULT_SCRAPER_SCHEDULE_CRON = "* * * * *"; // verifica a cada minuto
const DEFAULT_BACKUP_CRON = "0 3 * * *"; // backup diário às 3h
const DEFAULT_BACKUP_KEEP_DAYS = 14;
const DEFAULT_REMATCH_CRON = "0 5,17 * * *"; // 2x/dia (5h e 17h, horário de Brasília)
const DEFAULT_PORTAL_LOGIN_SMOKETEST_CRON = "0 6 * * 1"; // segunda-feira às 6h
const SCRAPER_TIMEZONE = "America/Sao_Paulo";
const TAMBASA_MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // catálogo completo: semanal
const ALERT_DAYS = 30; // certidões
const DEADLINE_DAYS = 3; // prazos de cotação

function enabled(flag: string | undefined, defaultOn: boolean): boolean {
  if (flag == null || flag === "") return defaultOn;
  return flag !== "false" && flag !== "0";
}

/**
 * Notifica falhas de jobs (notificação interna + WhatsApp quando configurado).
 * Cada canal é isolado em try/catch — um alerta nunca derruba o scheduler.
 * Desligável com FAILURE_ALERTS_ENABLED=false.
 */
async function notifyJobFailure(title: string, detail: string): Promise<void> {
  if (!enabled(process.env.FAILURE_ALERTS_ENABLED, true)) return;
  try {
    await notifyOwner({ title, content: detail });
  } catch (err) {
    logger.error("[Scheduler] Falha ao enviar notificação de erro:", (err as Error).message);
  }
  if (isWhatsappConfigured()) {
    try {
      await enviarWhatsapp(`⚠️ ${title}\n\n${detail}`);
    } catch (err) {
      logger.error("[Scheduler] Falha ao enviar WhatsApp de erro:", (err as Error).message);
    }
  }
}

let emailSyncRunning = false;
let portalOpportunitySyncRunning = false;
let autoPipelineRunning = false;

/**
 * Pipeline automático cotação→proposta: auto-confirma matches de alta
 * confiança e gera o PDF da proposta das cotações completas. Roda após cada
 * sincronização (e-mail e portais). O envio automático segue regido pela
 * chave QUOTATION_AUTO_SEND_ENABLED (padrão desligado — aprovação humana).
 */
export async function runQuotationAutoPipeline(): Promise<void> {
  if (!isAutoPipelineEnabled()) return;
  if (autoPipelineRunning) {
    logger.warn("[Scheduler] Pipeline de proposta automática ainda em andamento — pulando este ciclo.");
    return;
  }
  autoPipelineRunning = true;
  try {
    const result = await runAutoPipelineForPending({ limit: 50 });
    if (result.proposalsGenerated > 0) {
      const enviadas = result.sent > 0 ? ` (${result.sent} enviada(s) automaticamente)` : "";
      await notifyOwner({
        title: "Propostas geradas automaticamente — Sistema S2",
        content:
          `${result.proposalsGenerated} proposta(s) geradas a partir de cotações recebidas${enviadas}. ` +
          `Acesse a fila de cotações para revisar e enviar.`,
      });
    }
    if (result.errors.length > 0) {
      logger.warn(
        `[Scheduler] Pipeline de proposta automática com ${result.errors.length} erro(s): ` +
          result.errors.slice(0, 5).join("; "),
      );
    }
    await alertaCotacoesTravadasComPrazoCurto(result);
  } catch (err) {
    logger.error("[Scheduler] Falha no pipeline de proposta automática:", (err as Error).message);
  } finally {
    autoPipelineRunning = false;
  }
}

const URGENT_BLOCKED_ALERT_DAYS = 2;
// Evita reenviar o mesmo alerta a cada ciclo enquanto a cotação continuar
// travada — reseta só quando o processo reinicia (aceitável: o alerta diário
// genérico de runDailyAlerts cobre a persistência entre reinícios).
const cotacoesJaAlertadas = new Set<number>();

/**
 * Alerta imediato (fora do resumo diário) para cotações que o pipeline
 * automático não conseguiu concluir (item pendente de revisão, preço vencido
 * etc.) E cujo prazo de resposta está a ≤2 dias — o caso em que esperar até o
 * alerta diário das 8h pode significar perder o prazo.
 */
async function alertaCotacoesTravadasComPrazoCurto(
  result: Pick<Awaited<ReturnType<typeof runAutoPipelineForPending>>, "quotations">,
): Promise<void> {
  const bloqueadas = result.quotations.filter((q) => q.blockedReason && !q.proposalGenerated);
  if (bloqueadas.length === 0) return;

  const db = await getDb();
  if (!db) return;

  const ids = bloqueadas.map((q) => q.quotationId);
  const rows = await db
    .select({
      id: emailQuotations.id,
      subject: emailQuotations.subject,
      orgao: emailQuotations.orgao,
      prazoResposta: emailQuotations.prazoResposta,
    })
    .from(emailQuotations)
    .where(inArray(emailQuotations.id, ids));

  const hoje = Date.now();
  const msPorDia = 24 * 60 * 60 * 1000;
  const urgentes: string[] = [];
  for (const row of rows) {
    if (!row.prazoResposta || cotacoesJaAlertadas.has(row.id)) continue;
    const dias = Math.floor((new Date(row.prazoResposta).getTime() - hoje) / msPorDia);
    if (dias > URGENT_BLOCKED_ALERT_DAYS) continue;
    const motivo = bloqueadas.find((q) => q.quotationId === row.id)?.blockedReason;
    const prazoTexto = dias < 0 ? "prazo VENCIDO" : dias === 0 ? "prazo é hoje" : `prazo em ${dias}d`;
    urgentes.push(`${row.orgao ?? row.subject ?? `Cotação ${row.id}`} — ${prazoTexto} — ${motivo}`);
    cotacoesJaAlertadas.add(row.id);
  }
  if (urgentes.length === 0) return;

  const mensagem =
    `🚨 Cotação(ões) travada(s) na revisão com prazo curto:\n\n${urgentes.join("\n")}\n\n` +
    "Acesse a fila de cotações para confirmar o item pendente ou revalidar o preço.";
  await notifyOwner({ title: "Cotações travadas — prazo curto", content: mensagem });
  if (isWhatsappConfigured()) await enviarWhatsapp(mensagem);
  logger.warn(`[Scheduler] ${urgentes.length} cotação(ões) travada(s) com prazo curto — alerta enviado.`);
}

/** Roda a sincronização de e-mail uma vez, com log resumido e guarda de sobreposição. */
async function runEmailSync(): Promise<void> {
  if (emailSyncRunning) {
    logger.warn("[Scheduler] Sincronização de e-mail anterior ainda em andamento — pulando este ciclo.");
    return;
  }
  emailSyncRunning = true;
  try {
    const result = await syncEmailQuotations({ limit: 50 });
    if (result.imported > 0 || result.errors.length > 0) {
      logger.info(
        `[Scheduler] Cotações e-mail: ${result.imported} importadas, ${result.skipped} já existentes, ${result.errors.length} avisos.`,
      );
    }
    // Cada ciclo reavalia a fila: cotações bloqueadas por preço vencido ou
    // item pendente de revisão voltam a ser tentadas depois da correção
    // (não só quando um novo e-mail chega). O pipeline já retorna rápido
    // quando não há nada pendente. Antes disso, o catálogo atual é reaplicado
    // aos itens sem correspondência — o catálogo cresce e um item que não
    // casou ontem pode casar hoje.
    await runQuotationRematchSafely();
    await runQuotationAutoPipeline();
  } catch (err) {
    logger.error("[Scheduler] Falha na sincronização de e-mail:", (err as Error).message);
  } finally {
    emailSyncRunning = false;
  }
}

/**
 * Executa o radar dos seis portais definidos pela operação S2, cruza os itens
 * com a Tambasa e encaminha os resultados à fila de revisão. O envio final
 * permanece sujeito à aprovação humana.
 */
export async function runPortalOpportunitySync(): Promise<void> {
  if (portalOpportunitySyncRunning) {
    logger.warn("[Scheduler] Radar dos seis portais ainda em andamento — pulando este ciclo.");
    return;
  }
  portalOpportunitySyncRunning = true;
  try {
    const result = await syncS2PortalOpportunitiesSafely();
    logger.info(
      `[Scheduler] Seis portais S2: ${result.found} encontradas, ${result.imported} importadas, ` +
        `${result.skipped} já existentes, ${result.matchedItems} itens casados com Tambasa e ` +
        `${result.unmatchedItems} sem correspondência.`,
    );
    if (result.errors.length > 0) {
      const detail = result.errors.slice(0, 8).join("; ");
      logger.warn(`[Scheduler] Radar dos seis portais com ${result.errors.length} aviso(s): ${detail}`);
    }
    // Reavalia a fila neste ciclo também (mesmo motivo do sync de e-mail).
    await runQuotationAutoPipeline();
  } catch (err) {
    const detail = (err as Error).message;
    logger.error("[Scheduler] Falha no radar dos seis portais:", detail);
    await notifyJobFailure(
      "Falha no radar de portais — Sistema S2",
      `A captura agendada falhou: ${detail}`,
    );
  } finally {
    portalOpportunitySyncRunning = false;
  }
}

/** Verifica certidões e prazos e notifica o dono se houver pendências. */
export async function runDailyAlerts(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const hoje = new Date();
  const linhas: string[] = [];

  // Certidões vencidas / vencendo
  try {
    const certs = await db.select().from(certidoes).where(eq(certidoes.ativa, true));
    const vencidas: string[] = [];
    const vencendo: string[] = [];
    for (const c of certs) {
      if (!c.dataValidade) continue;
      const status = classificarValidade(new Date(c.dataValidade), hoje, ALERT_DAYS);
      const dataFmt = new Date(c.dataValidade).toLocaleDateString("pt-BR");
      if (status === "vencida") vencidas.push(`${c.tipo} (venceu ${dataFmt})`);
      else if (status === "vence_em_breve") vencendo.push(`${c.tipo} (vence ${dataFmt})`);
    }
    if (vencidas.length) linhas.push(`Certidões VENCIDAS: ${vencidas.join("; ")}`);
    if (vencendo.length) linhas.push(`Certidões vencendo em ${ALERT_DAYS} dias: ${vencendo.join("; ")}`);
  } catch (err) {
    logger.error("[Scheduler] Falha ao verificar certidões:", (err as Error).message);
  }

  // Prazos de cotação — filtra no SQL: só pendentes com prazo definido
  try {
    const cotacoes = await db
      .select()
      .from(emailQuotations)
      .where(
        and(
          isNotNull(emailQuotations.prazoResposta),
          notInArray(emailQuotations.status, ["respondida", "descartada"]),
        ),
      );
    const msPorDia = 24 * 60 * 60 * 1000;
    const vencidos: string[] = [];
    const proximos: string[] = [];
    for (const q of cotacoes) {
      if (!q.prazoResposta || q.status === "respondida" || q.status === "descartada") continue;
      const dias = Math.floor((new Date(q.prazoResposta).getTime() - hoje.getTime()) / msPorDia);
      const label = `${q.orgao ?? q.subject ?? `Cotação ${q.id}`}`;
      if (dias < 0) vencidos.push(label);
      else if (dias <= DEADLINE_DAYS) proximos.push(`${label} (${dias}d)`);
    }
    if (vencidos.length) linhas.push(`Cotações com prazo VENCIDO sem resposta: ${vencidos.join("; ")}`);
    if (proximos.length) linhas.push(`Cotações vencendo em ${DEADLINE_DAYS} dias: ${proximos.join("; ")}`);
  } catch (err) {
    logger.error("[Scheduler] Falha ao verificar prazos:", (err as Error).message);
  }

  if (linhas.length > 0) {
    await notifyOwner({
      title: "Alertas do dia — Sistema S2",
      content: linhas.join("\n"),
    });
    if (isWhatsappConfigured()) {
      const enviado = await enviarWhatsapp(`📋 Alertas do dia — Sistema S2\n\n${linhas.join("\n")}`);
      if (enviado) logger.info("[Scheduler] Alertas diários também enviados por WhatsApp.");
    }
    logger.info(`[Scheduler] Alertas diários: ${linhas.length} pendência(s) notificada(s).`);
  }
}

/**
 * Dispara os scrapers de fornecedores cujo `scheduleTime` (HH:mm, horário de
 * Brasília) já passou hoje e que ainda não rodaram no período aplicável. A
 * Tambasa executa a descoberta e sincronização completa no máximo uma vez a
 * cada sete dias; os demais fornecedores mantêm o ciclo diário já existente.
 */
const scraperFiredOn = new Map<number, string>(); // configId → data (tz) do último disparo local

async function runScheduledScrapers(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: SCRAPER_TIMEZONE }),
  );
  const hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE });

  try {
    const ativos = await db.select({
      id: scraperConfigs.id,
      scraperType: scraperConfigs.scraperType,
      scheduleTime: scraperConfigs.scheduleTime,
      lastRunAt: scraperConfigs.lastRunAt,
    })
      .from(scraperConfigs)
      // Governança: agendamento só considera fornecedores com termos de uso aprovados
      .where(and(eq(scraperConfigs.enabled, "yes"), eq(scraperConfigs.tosAprovado, true)));

    for (const cfg of ativos) {
      if (!cfg.scheduleTime || cfg.scheduleTime > hhmm) continue;

      const isTambasa = cfg.scraperType.toLowerCase() === "tambasa";
      const lastRunAtMs = cfg.lastRunAt ? new Date(cfg.lastRunAt).getTime() : null;
      if (isTambasa && lastRunAtMs != null && Date.now() - lastRunAtMs < TAMBASA_MIN_INTERVAL_MS) {
        continue;
      }

      // Já rodou hoje (pelo banco ou por disparo local ainda em andamento)?
      const lastRunDay = cfg.lastRunAt
        ? new Date(cfg.lastRunAt).toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE })
        : null;
      if (lastRunDay === hoje || scraperFiredOn.get(cfg.id) === hoje) continue;
      scraperFiredOn.set(cfg.id, hoje);

      const runPromise = isTambasa
        ? expandAndSyncTambasaCatalog(cfg.id).then((result) => result.scraper)
        : executarScraper(cfg.id);

      runPromise
        .then((r) => {
          logger.info(`[Scheduler] Scraper #${cfg.id}: ${r.success ? "sucesso" : "falhou"} (${r.productsScraped} produtos capturados).`);
          if (!r.success) {
            const detalhe = r.errors?.length ? `\nErros: ${r.errors.slice(0, 3).join("; ")}` : "";
            void notifyJobFailure(
              "Falha na captura agendada — Sistema S2",
              `A captura do fornecedor ${r.supplierName || `(config #${cfg.id})`} falhou.${detalhe}`,
            );
          }
        })
        .catch((err) => {
          logger.error(`[Scheduler] Scraper #${cfg.id} falhou:`, (err as Error).message);
          void notifyJobFailure(
            "Falha na captura agendada — Sistema S2",
            `A captura do fornecedor (config #${cfg.id}) lançou erro: ${(err as Error).message}`,
          );
        });

      // Pequeno intervalo entre disparos para não sobrecarregar caso vários
      // fornecedores compartilhem o mesmo horário configurado.
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch (err) {
    logger.error("[Scheduler] Falha ao verificar agendamentos de scraper:", (err as Error).message);
  }
}

/** Executa o backup do banco e aplica a retenção. */
export async function runBackupJob(): Promise<void> {
  const destDir = process.env.BACKUP_DIR || "backups";
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS) || DEFAULT_BACKUP_KEEP_DAYS;
  const result = await runDatabaseBackup({ destDir });
  if (result.success) {
    const removidos = cleanupOldBackups(destDir, keepDays, Date.now());
    logger.info(
      `[Scheduler] Backup concluído: ${result.file}` +
        (removidos > 0 ? ` (${removidos} backup(s) antigo(s) removido(s)).` : "."),
    );
  } else {
    logger.error(`[Scheduler] Backup falhou: ${result.error}`);
    await notifyJobFailure(
      "Falha no backup automático — Sistema S2",
      `O backup diário do banco falhou: ${result.error ?? "erro desconhecido"}. ` +
        "Verifique o servidor — sem backup recente, um incidente pode causar perda de dados.",
    );
  }
}

/**
 * Teste de fumaça semanal dos seletores de login: para cada portal com
 * credencial ativa no cofre, tenta SÓ logar (sem coletar nem preencher nada)
 * e avisa se algum quebrou — para descobrir um layout novo antes de uma
 * cotação real ficar de fora por falha silenciosa de login.
 */
export async function runPortalLoginSmokeTest(): Promise<void> {
  const falhas: string[] = [];
  let testados = 0;
  for (const source of S2_TARGET_PORTALS) {
    let health;
    try {
      health = await checkPortalLoginHealth(source);
    } catch (err) {
      falhas.push(`${source}: erro inesperado (${(err as Error).message})`);
      continue;
    }
    if (!health.hasCredential) continue; // nada a testar sem credencial cadastrada
    testados++;
    if (!health.ok) falhas.push(`${source}: ${health.detail}`);
  }

  if (testados === 0) {
    logger.info("[Scheduler] Teste de fumaça de login: nenhuma credencial de portal cadastrada — nada a testar.");
    return;
  }

  if (falhas.length === 0) {
    logger.info(`[Scheduler] Teste de fumaça de login: ${testados} portal(is) com login confirmado.`);
    return;
  }

  const mensagem =
    `⚠️ ${falhas.length} de ${testados} portal(is) com login falhando:\n\n${falhas.join("\n")}\n\n` +
    "Provável mudança de layout/seletor — confira o portal e, se preciso, atualize a credencial.";
  logger.warn(`[Scheduler] Teste de fumaça de login: ${falhas.length} falha(s).`);
  await notifyOwner({ title: "Login de portal falhando — Sistema S2", content: mensagem });
  if (isWhatsappConfigured()) await enviarWhatsapp(mensagem);
}

/** Registra os jobs recorrentes. Chamado uma vez no boot. */
export function initScheduledJobs(): void {
  // 0a. Config de e-mail salva pela interface tem precedência sobre o .env —
  //     aplicada antes de decidir se a sincronização IMAP liga.
  void import("./emailConfigService")
    .then(({ applyEmailConfigFromDb }) => applyEmailConfigFromDb())
    .catch(() => undefined);

  // 0b. Config de IA (chaves/provedor) salva pela interface → process.env.
  void import("./aiConfigService")
    .then(({ applyAiConfigFromDb }) => applyAiConfigFromDb())
    .catch(() => undefined);

  // 0c. Demais credenciais de integração (WhatsApp etc.) → process.env.
  void import("./integrationSettingsService")
    .then(({ applyIntegrationSettingsFromDb }) => applyIntegrationSettingsFromDb())
    .catch(() => undefined);

  // 0. Jobs de IA que ficaram "executando" de um boot anterior → marcados como
  //    interrompidos (o runner morre junto com o processo).
  void import("../jobs/aiJobRunner")
    .then(({ recoverStaleAiJobs }) => recoverStaleAiJobs())
    .then((n) => {
      if (n > 0) logger.warn(`[Scheduler] ${n} job(s) de IA interrompido(s) por restart foram marcados como erro.`);
    })
    .catch(() => undefined);

  // 1. Sincronização de cotações por e-mail. O agendamento é feito sempre que
  //    habilitado; a checagem "IMAP configurado?" acontece a CADA disparo —
  //    assim a configuração salva pela interface (aplicada async no passo 0a,
  //    ou a qualquer momento depois) passa a valer sem reiniciar o servidor.
  if (enabled(process.env.EMAIL_SYNC_ENABLED, true)) {
    const expr = process.env.EMAIL_SYNC_CRON || DEFAULT_EMAIL_SYNC_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, () => {
        if (!isImapConfigured()) return;
        void runEmailSync();
      });
      logger.info(`[Scheduler] Sincronização de cotações por e-mail agendada (${expr}).`);
    } else {
      logger.warn(`[Scheduler] EMAIL_SYNC_CRON inválido: "${expr}" — sincronização automática desativada.`);
    }
  }

  // 2. Seis portais S2 → matching Tambasa → fila de revisão.
  if (enabled(process.env.PORTAL_OPPORTUNITY_SYNC_ENABLED, true)) {
    const expr = process.env.PORTAL_OPPORTUNITY_SYNC_CRON || DEFAULT_PORTAL_OPPORTUNITY_SYNC_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, () => { void runPortalOpportunitySync(); }, { timezone: SCRAPER_TIMEZONE });
      logger.info(
        `[Scheduler] Radar COPASA/CEMIG/Fundep/Funarbe/ComprasMG/FIEMG agendado (${expr}, horário de Brasília; envio sujeito à aprovação).`,
      );
    } else {
      logger.warn(
        `[Scheduler] PORTAL_OPPORTUNITY_SYNC_CRON inválido: "${expr}" — radar dos seis portais desativado.`,
      );
    }
  }

  // 2a. Re-matching periódico das cotações em revisão: itens sem correspondência
  //     são recruzados com o catálogo atual (que cresce diariamente). Se todos os
  //     itens de uma cotação passarem a casar, o pipeline gera a proposta no ciclo
  //     seguinte. Desligável com REMATCH_ENABLED=false.
  if (enabled(process.env.REMATCH_ENABLED, true)) {
    const expr = process.env.REMATCH_CRON || DEFAULT_REMATCH_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, () => { void runQuotationRematchSafely(); }, { timezone: SCRAPER_TIMEZONE });
      logger.info(`[Scheduler] Re-matching de cotações em revisão agendado (${expr}, horário de Brasília).`);
    } else {
      logger.warn(`[Scheduler] REMATCH_CRON inválido: "${expr}" — re-matching automático desativado.`);
    }
  }

  // 2b. Relatório diário consolidado às 7h00: canal de e-mail (novas cotações,
  //     matches e itens pendentes), scrapers de fornecedores (última rodada) e
  //     portal PNPC/Comprasnet (pregões publicados ontem via API pública oficial).
  //     Desligável com DAILY_REPORT_ENABLED=false.
  if (enabled(process.env.DAILY_REPORT_ENABLED, true)) {
    const expr = process.env.DAILY_REPORT_CRON || DEFAULT_DAILY_REPORT_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, () => { void sendQuotationDailyReportSafely(); }, { timezone: SCRAPER_TIMEZONE });
      logger.info(`[Scheduler] Relatório diário consolidado agendado (${expr}, horário de Brasília).`);
    } else {
      logger.warn(`[Scheduler] DAILY_REPORT_CRON inválido: "${expr}" — relatório diário desativado.`);
    }
  }

  // 3. Alertas proativos diários
  if (enabled(process.env.ALERTS_ENABLED, true)) {
    const expr = process.env.ALERTS_CRON || DEFAULT_ALERTS_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, runDailyAlerts);
      logger.info(`[Scheduler] Alertas diários agendados (${expr}).`);
    } else {
      logger.warn(`[Scheduler] ALERTS_CRON inválido: "${expr}" — alertas diários desativados.`);
    }
  }

  // 4. Execução automática dos scrapers de fornecedores no horário configurado
  if (enabled(process.env.SCRAPER_SCHEDULE_ENABLED, true)) {
    const expr = process.env.SCRAPER_SCHEDULE_CRON || DEFAULT_SCRAPER_SCHEDULE_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, runScheduledScrapers, { timezone: SCRAPER_TIMEZONE });
      logger.info(`[Scheduler] Execução automática de fornecedores agendada (verificação ${expr}, horário de Brasília).`);
    } else {
      logger.warn(`[Scheduler] SCRAPER_SCHEDULE_CRON inválido: "${expr}" — agendamento automático de fornecedores desativado.`);
    }
  }

  // 5. Backup automático do banco (§16)
  if (enabled(process.env.BACKUP_ENABLED, true)) {
    const expr = process.env.BACKUP_CRON || DEFAULT_BACKUP_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, () => { void runBackupJob(); });
      logger.info(`[Scheduler] Backup automático do banco agendado (${expr}).`);
    } else {
      logger.warn(`[Scheduler] BACKUP_CRON inválido: "${expr}" — backup automático desativado.`);
    }
  }

  // 6. Teste de fumaça semanal dos seletores de login dos portais
  if (enabled(process.env.PORTAL_LOGIN_SMOKETEST_ENABLED, true)) {
    const expr = process.env.PORTAL_LOGIN_SMOKETEST_CRON || DEFAULT_PORTAL_LOGIN_SMOKETEST_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, () => { void runPortalLoginSmokeTest(); }, { timezone: SCRAPER_TIMEZONE });
      logger.info(`[Scheduler] Teste de fumaça de login dos portais agendado (${expr}, horário de Brasília).`);
    } else {
      logger.warn(`[Scheduler] PORTAL_LOGIN_SMOKETEST_CRON inválido: "${expr}" — teste de fumaça desativado.`);
    }
  }
}
