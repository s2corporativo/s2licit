import cron from "node-cron";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { getDb } from "../db";
import { certidoes, emailQuotations, scraperConfigs } from "../../drizzle/schema";
import { isImapConfigured } from "./emailInboxService";
import { syncEmailQuotations } from "./emailQuotationSyncService";
import { syncS2PortalOpportunitiesSafely } from "./s2PortalOpportunityOrchestrator";
import { classificarValidade } from "../routers/certidoes";
import { notifyOwner } from "../_core/notification";
import { enviarWhatsapp, isWhatsappConfigured } from "./whatsappService";
import { enqueueCaptureJob } from "./captureCoreService";
import { runDatabaseBackup, cleanupOldBackups } from "./backupService";
import { logger } from "../_core/logger";

/**
 * Agendador central de jobs recorrentes.
 *
 * Scrapers não são mais executados diretamente pelo cron. O scheduler apenas
 * enfileira `capture_jobs`; workers persistentes cuidam de execução, retry,
 * heartbeat e recuperação após restart.
 */

const DEFAULT_EMAIL_SYNC_CRON = "*/15 * * * *";
const DEFAULT_PORTAL_OPPORTUNITY_SYNC_CRON = "0 7,12,17 * * *";
const DEFAULT_ALERTS_CRON = "0 8 * * *";
const DEFAULT_SCRAPER_SCHEDULE_CRON = "* * * * *";
const DEFAULT_BACKUP_CRON = "0 3 * * *";
const DEFAULT_BACKUP_KEEP_DAYS = 14;
const SCRAPER_TIMEZONE = "America/Sao_Paulo";
const TAMBASA_MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const ALERT_DAYS = 30;
const DEADLINE_DAYS = 3;

function enabled(flag: string | undefined, defaultOn: boolean): boolean {
  if (flag == null || flag === "") return defaultOn;
  return flag !== "false" && flag !== "0";
}

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
  } catch (err) {
    logger.error("[Scheduler] Falha na sincronização de e-mail:", (err as Error).message);
  } finally {
    emailSyncRunning = false;
  }
}

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

export async function runDailyAlerts(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const hoje = new Date();
  const linhas: string[] = [];

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
 * Enfileira as capturas cujo horário já passou hoje.
 *
 * - Tambasa: full scan semanal.
 * - Conectores fullCatalog: full diário.
 * - Conectores search-only (Bartofil/Basso): o próprio enqueue converte full
 *   para refresh seletivo de ofertas conhecidas, evitando o antigo job de 0 itens.
 */
async function runScheduledScrapers(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: SCRAPER_TIMEZONE }));
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
      .where(and(eq(scraperConfigs.enabled, "yes"), eq(scraperConfigs.tosAprovado, true)));

    for (const cfg of ativos) {
      if (!cfg.scheduleTime || cfg.scheduleTime > hhmm) continue;
      const lastRunDay = cfg.lastRunAt
        ? new Date(cfg.lastRunAt).toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE })
        : null;
      if (lastRunDay === hoje) continue;

      const isTambasa = cfg.scraperType.toLowerCase() === "tambasa";
      const lastRunAtMs = cfg.lastRunAt ? new Date(cfg.lastRunAt).getTime() : null;
      if (isTambasa && lastRunAtMs != null && Date.now() - lastRunAtMs < TAMBASA_MIN_INTERVAL_MS) continue;

      try {
        const queued = await enqueueCaptureJob({
          scraperConfigId: cfg.id,
          mode: "full",
          trigger: "scheduled",
          priority: 30,
          meta: { scheduledFor: cfg.scheduleTime, timezone: SCRAPER_TIMEZONE },
        });
        logger.info(`[Scheduler] Capture job #${queued.id} enfileirado para config #${cfg.id} (${queued.mode}).`);
      } catch (error) {
        const detail = (error as Error).message;
        logger.error(`[Scheduler] Não foi possível enfileirar scraper #${cfg.id}:`, detail);
        await notifyJobFailure(
          "Falha ao agendar captura — Sistema S2",
          `A captura do fornecedor (config #${cfg.id}) não pôde ser enfileirada: ${detail}`,
        );
      }
    }
  } catch (err) {
    logger.error("[Scheduler] Falha ao verificar agendamentos de scraper:", (err as Error).message);
  }
}

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

export function initScheduledJobs(): void {
  void import("./emailConfigService")
    .then(({ applyEmailConfigFromDb }) => applyEmailConfigFromDb())
    .catch(() => undefined);

  void import("./aiConfigService")
    .then(({ applyAiConfigFromDb }) => applyAiConfigFromDb())
    .catch(() => undefined);

  void import("./integrationSettingsService")
    .then(({ applyIntegrationSettingsFromDb }) => applyIntegrationSettingsFromDb())
    .catch(() => undefined);

  void import("../jobs/aiJobRunner")
    .then(({ recoverStaleAiJobs }) => recoverStaleAiJobs())
    .then((n) => {
      if (n > 0) logger.warn(`[Scheduler] ${n} job(s) de IA interrompido(s) por restart foram marcados como erro.`);
    })
    .catch(() => undefined);

  // Capture Core: worker persistente e auto-recuperável. GitHub não participa
  // da execução operacional do módulo.
  void import("../jobs/captureJobRunner")
    .then(({ startCaptureJobRunner }) => startCaptureJobRunner())
    .catch((error) => logger.error("[Scheduler] Falha ao iniciar CaptureRunner:", error));

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

  if (enabled(process.env.PORTAL_OPPORTUNITY_SYNC_ENABLED, true)) {
    const expr = process.env.PORTAL_OPPORTUNITY_SYNC_CRON || DEFAULT_PORTAL_OPPORTUNITY_SYNC_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, () => { void runPortalOpportunitySync(); }, { timezone: SCRAPER_TIMEZONE });
      logger.info(`[Scheduler] Radar dos seis portais S2 agendado (${expr}, horário de Brasília).`);
    } else {
      logger.warn(`[Scheduler] PORTAL_OPPORTUNITY_SYNC_CRON inválido: "${expr}" — radar desativado.`);
    }
  }

  if (enabled(process.env.ALERTS_ENABLED, true)) {
    const expr = process.env.ALERTS_CRON || DEFAULT_ALERTS_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, runDailyAlerts);
      logger.info(`[Scheduler] Alertas diários agendados (${expr}).`);
    } else {
      logger.warn(`[Scheduler] ALERTS_CRON inválido: "${expr}" — alertas diários desativados.`);
    }
  }

  if (enabled(process.env.SCRAPER_SCHEDULE_ENABLED, true)) {
    const expr = process.env.SCRAPER_SCHEDULE_CRON || DEFAULT_SCRAPER_SCHEDULE_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, runScheduledScrapers, { timezone: SCRAPER_TIMEZONE });
      logger.info(`[Scheduler] Capturas automáticas enfileiradas por ${expr} (${SCRAPER_TIMEZONE}).`);
    } else {
      logger.warn(`[Scheduler] SCRAPER_SCHEDULE_CRON inválido: "${expr}" — capturas automáticas desativadas.`);
    }
  }

  if (enabled(process.env.BACKUP_ENABLED, true)) {
    const expr = process.env.BACKUP_CRON || DEFAULT_BACKUP_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, () => { void runBackupJob(); });
      logger.info(`[Scheduler] Backup automático do banco agendado (${expr}).`);
    } else {
      logger.warn(`[Scheduler] BACKUP_CRON inválido: "${expr}" — backup automático desativado.`);
    }
  }
}
