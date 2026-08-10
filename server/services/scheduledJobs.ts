import cron from "node-cron";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { getDb, withDatabaseAdvisoryLock } from "../db";
import { certidoes, emailQuotations, scraperConfigs } from "../../drizzle/schema";
import { isImapConfigured } from "./emailInboxService";
import { syncEmailQuotations } from "./emailQuotationSyncService";
import { syncS2PortalOpportunitiesSafely } from "./s2PortalOpportunityOrchestrator";
import { classificarValidade } from "../routers/certidoes";
import { notifyOwner } from "../_core/notification";
import { enviarWhatsapp, isWhatsappConfigured } from "./whatsappService";
import { executarScraper } from "./scraperEngine";
import { expandAndSyncTambasaCatalog } from "./tambasaCatalogService";
import { runDatabaseBackup, cleanupOldBackups } from "./backupService";
import { logger } from "../_core/logger";
import { finishSyncRun, startSyncRun } from "../connectors/baseConnector";
import { resolveCredential, resolveCredentials } from "../integrations/core/credentialResolver";

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
  if (flag == null || flag.trim() === "") return defaultOn;
  return flag !== "false" && flag !== "0";
}

async function notifyJobFailure(title: string, detail: string): Promise<void> {
  const failureAlerts = await resolveCredential("FAILURE_ALERTS_ENABLED");
  if (!enabled(failureAlerts, true)) return;
  try {
    await notifyOwner({ title, content: detail });
  } catch (error) {
    logger.error("[Scheduler] Falha ao enviar notificação de erro:", (error as Error).message);
  }
  if (await isWhatsappConfigured()) {
    try {
      await enviarWhatsapp(`⚠️ ${title}\n\n${detail}`);
    } catch (error) {
      logger.error("[Scheduler] Falha ao enviar WhatsApp de erro:", (error as Error).message);
    }
  }
}

/**
 * Coordenação distribuída sem Redis: MySQL GET_LOCK mantém exclusividade entre
 * processos/replicas e sync_runs registra a execução para auditoria.
 */
async function runTrackedJob(
  name: string,
  task: () => Promise<void>,
): Promise<boolean> {
  const locked = await withDatabaseAdvisoryLock(`job:${name}`, async () => {
    const runId = await startSyncRun(`job:${name}`);
    try {
      await task();
      await finishSyncRun(runId, {
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        status: "success",
      });
    } catch (error) {
      await finishSyncRun(runId, {
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 1,
        status: "error",
        errorDetails: (error as Error).message,
      });
      throw error;
    }
  });
  if (!locked.acquired) {
    logger.info(`[Scheduler] ${name}: outro worker já possui o lock; ciclo ignorado.`);
    return false;
  }
  return true;
}

async function runEmailSync(): Promise<void> {
  await runTrackedJob("email-sync", async () => {
    try {
      const result = await syncEmailQuotations({ limit: 50 });
      if (result.imported > 0 || result.errors.length > 0) {
        logger.info(
          `[Scheduler] Cotações e-mail: ${result.imported} importadas, ${result.skipped} já existentes, ${result.errors.length} avisos.`,
        );
      }
    } catch (error) {
      const detail = (error as Error).message;
      logger.error("[Scheduler] Falha na sincronização de e-mail:", detail);
      await notifyJobFailure("Falha na sincronização de e-mail — Sistema S2", detail);
      throw error;
    }
  });
}

export async function runPortalOpportunitySync(): Promise<void> {
  await runTrackedJob("portal-opportunity-sync", async () => {
    try {
      const result = await syncS2PortalOpportunitiesSafely();
      logger.info(
        `[Scheduler] Portais S2: ${result.found} encontradas, ${result.imported} importadas, ` +
          `${result.skipped} já existentes, ${result.matchedItems} itens casados e ` +
          `${result.unmatchedItems} sem correspondência.`,
      );
      if (result.errors.length > 0) {
        const detail = result.errors.slice(0, 8).join("; ");
        logger.warn(`[Scheduler] Radar dos portais com ${result.errors.length} aviso(s): ${detail}`);
      }
    } catch (error) {
      const detail = (error as Error).message;
      logger.error("[Scheduler] Falha no radar dos portais:", detail);
      await notifyJobFailure(
        "Falha no radar de portais — Sistema S2",
        `A captura agendada falhou: ${detail}`,
      );
      throw error;
    }
  });
}

export async function runDailyAlerts(): Promise<void> {
  await runTrackedJob("daily-alerts", async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para alertas diários.");
    const now = new Date();
    const lines: string[] = [];

    try {
      const certificates = await db.select().from(certidoes).where(eq(certidoes.ativa, true));
      const expired: string[] = [];
      const expiring: string[] = [];
      for (const certificate of certificates) {
        if (!certificate.dataValidade) continue;
        const status = classificarValidade(new Date(certificate.dataValidade), now, ALERT_DAYS);
        const formatted = new Date(certificate.dataValidade).toLocaleDateString("pt-BR");
        if (status === "vencida") expired.push(`${certificate.tipo} (venceu ${formatted})`);
        else if (status === "vence_em_breve") expiring.push(`${certificate.tipo} (vence ${formatted})`);
      }
      if (expired.length) lines.push(`Certidões VENCIDAS: ${expired.join("; ")}`);
      if (expiring.length) lines.push(`Certidões vencendo em ${ALERT_DAYS} dias: ${expiring.join("; ")}`);
    } catch (error) {
      logger.error("[Scheduler] Falha ao verificar certidões:", (error as Error).message);
    }

    try {
      const quotations = await db
        .select()
        .from(emailQuotations)
        .where(
          and(
            isNotNull(emailQuotations.prazoResposta),
            notInArray(emailQuotations.status, ["respondida", "descartada"]),
          ),
        );
      const msPerDay = 24 * 60 * 60 * 1000;
      const expired: string[] = [];
      const upcoming: string[] = [];
      for (const quotation of quotations) {
        if (!quotation.prazoResposta || quotation.status === "respondida" || quotation.status === "descartada") continue;
        const days = Math.floor((new Date(quotation.prazoResposta).getTime() - now.getTime()) / msPerDay);
        const label = `${quotation.orgao ?? quotation.subject ?? `Cotação ${quotation.id}`}`;
        if (days < 0) expired.push(label);
        else if (days <= DEADLINE_DAYS) upcoming.push(`${label} (${days}d)`);
      }
      if (expired.length) lines.push(`Cotações com prazo VENCIDO sem resposta: ${expired.join("; ")}`);
      if (upcoming.length) lines.push(`Cotações vencendo em ${DEADLINE_DAYS} dias: ${upcoming.join("; ")}`);
    } catch (error) {
      logger.error("[Scheduler] Falha ao verificar prazos:", (error as Error).message);
    }

    if (lines.length > 0) {
      await notifyOwner({ title: "Alertas do dia — Sistema S2", content: lines.join("\n") });
      if (await isWhatsappConfigured()) {
        const sent = await enviarWhatsapp(`📋 Alertas do dia — Sistema S2\n\n${lines.join("\n")}`);
        if (sent) logger.info("[Scheduler] Alertas diários também enviados por WhatsApp.");
      }
      logger.info(`[Scheduler] Alertas diários: ${lines.length} pendência(s) notificada(s).`);
    }
  });
}

async function executeScheduledScraper(config: {
  id: number;
  scraperType: string;
}): Promise<void> {
  await runTrackedJob(`scraper-${config.id}`, async () => {
    const isTambasa = config.scraperType.toLowerCase() === "tambasa";
    const result = isTambasa
      ? (await expandAndSyncTambasaCatalog(config.id)).scraper
      : await executarScraper(config.id);
    logger.info(
      `[Scheduler] Scraper #${config.id}: ${result.success ? "sucesso" : "falhou"} (${result.productsScraped} produtos capturados).`,
    );
    if (!result.success) {
      const detail = result.errors?.length ? `\nErros: ${result.errors.slice(0, 3).join("; ")}` : "";
      await notifyJobFailure(
        "Falha na captura agendada — Sistema S2",
        `A captura do fornecedor ${result.supplierName || `(config #${config.id})`} falhou.${detail}`,
      );
      throw new Error(result.errors?.join("; ") || `Scraper #${config.id} retornou falha.`);
    }
  });
}

async function runScheduledScrapers(): Promise<void> {
  await runTrackedJob("scraper-scan", async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para scheduler de scrapers.");
    const nowInBrazil = new Date(new Date().toLocaleString("en-US", { timeZone: SCRAPER_TIMEZONE }));
    const hhmm = `${String(nowInBrazil.getHours()).padStart(2, "0")}:${String(nowInBrazil.getMinutes()).padStart(2, "0")}`;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE });
    const active = await db
      .select({
        id: scraperConfigs.id,
        scraperType: scraperConfigs.scraperType,
        scheduleTime: scraperConfigs.scheduleTime,
        lastRunAt: scraperConfigs.lastRunAt,
      })
      .from(scraperConfigs)
      .where(and(eq(scraperConfigs.enabled, "yes"), eq(scraperConfigs.tosAprovado, true)));

    for (const config of active) {
      if (!config.scheduleTime || config.scheduleTime > hhmm) continue;
      const isTambasa = config.scraperType.toLowerCase() === "tambasa";
      const lastRunAtMs = config.lastRunAt ? new Date(config.lastRunAt).getTime() : null;
      if (isTambasa && lastRunAtMs != null && Date.now() - lastRunAtMs < TAMBASA_MIN_INTERVAL_MS) continue;
      const lastRunDay = config.lastRunAt
        ? new Date(config.lastRunAt).toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE })
        : null;
      if (lastRunDay === today) continue;
      try {
        await executeScheduledScraper(config);
      } catch (error) {
        logger.error(`[Scheduler] Scraper #${config.id} falhou:`, (error as Error).message);
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  });
}

export async function runBackupJob(): Promise<void> {
  await runTrackedJob("database-backup", async () => {
    const destDir = process.env.BACKUP_DIR || "backups";
    const keepRaw = await resolveCredential("BACKUP_KEEP_DAYS");
    const keepDays = Number(keepRaw) || DEFAULT_BACKUP_KEEP_DAYS;
    const result = await runDatabaseBackup({ destDir });
    if (result.success) {
      const removed = cleanupOldBackups(destDir, keepDays, Date.now());
      logger.info(
        `[Scheduler] Backup concluído: ${result.file}` +
          (removed > 0 ? ` (${removed} backup(s) antigo(s) removido(s)).` : "."),
      );
      return;
    }
    const detail = result.error ?? "erro desconhecido";
    logger.error(`[Scheduler] Backup falhou: ${detail}`);
    await notifyJobFailure(
      "Falha no backup automático — Sistema S2",
      `O backup diário do banco falhou: ${detail}. Verifique o servidor.`,
    );
    throw new Error(detail);
  });
}

type ScheduledTask = ReturnType<typeof cron.schedule>;
const runtimeTasks: ScheduledTask[] = [];

function clearRuntimeTasks(): void {
  while (runtimeTasks.length > 0) {
    const task = runtimeTasks.pop();
    try {
      task?.destroy();
    } catch {
      task?.stop();
    }
  }
}

function addTask(expression: string, fn: () => void | Promise<void>, timezone?: string): boolean {
  if (!cron.validate(expression)) return false;
  const task = cron.schedule(expression, fn, timezone ? { timezone } : undefined);
  runtimeTasks.push(task);
  return true;
}

/** Recarrega agendas em runtime; não exige alterar GitHub secrets nem redeploy. */
export async function refreshRuntimeSchedules(): Promise<void> {
  clearRuntimeTasks();
  const config = await resolveCredentials([
    "EMAIL_SYNC_ENABLED",
    "EMAIL_SYNC_CRON",
    "PORTAL_OPPORTUNITY_SYNC_ENABLED",
    "PORTAL_OPPORTUNITY_SYNC_CRON",
    "ALERTS_ENABLED",
    "ALERTS_CRON",
    "SCRAPER_SCHEDULE_ENABLED",
    "SCRAPER_SCHEDULE_CRON",
    "BACKUP_ENABLED",
    "BACKUP_CRON",
  ]);

  if (enabled(config.EMAIL_SYNC_ENABLED, true)) {
    const expression = config.EMAIL_SYNC_CRON || DEFAULT_EMAIL_SYNC_CRON;
    if (addTask(expression, async () => {
      if (!(await isImapConfigured())) return;
      await runEmailSync();
    })) logger.info(`[Scheduler] Sincronização de cotações por e-mail agendada (${expression}).`);
    else logger.warn(`[Scheduler] EMAIL_SYNC_CRON inválido: "${expression}".`);
  }

  if (enabled(config.PORTAL_OPPORTUNITY_SYNC_ENABLED, true)) {
    const expression = config.PORTAL_OPPORTUNITY_SYNC_CRON || DEFAULT_PORTAL_OPPORTUNITY_SYNC_CRON;
    if (addTask(expression, runPortalOpportunitySync, SCRAPER_TIMEZONE)) {
      logger.info(`[Scheduler] Radar de portais agendado (${expression}, horário de Brasília).`);
    } else logger.warn(`[Scheduler] PORTAL_OPPORTUNITY_SYNC_CRON inválido: "${expression}".`);
  }

  if (enabled(config.ALERTS_ENABLED, true)) {
    const expression = config.ALERTS_CRON || DEFAULT_ALERTS_CRON;
    if (addTask(expression, runDailyAlerts)) logger.info(`[Scheduler] Alertas diários agendados (${expression}).`);
    else logger.warn(`[Scheduler] ALERTS_CRON inválido: "${expression}".`);
  }

  if (enabled(config.SCRAPER_SCHEDULE_ENABLED, true)) {
    const expression = config.SCRAPER_SCHEDULE_CRON || DEFAULT_SCRAPER_SCHEDULE_CRON;
    if (addTask(expression, runScheduledScrapers, SCRAPER_TIMEZONE)) {
      logger.info(`[Scheduler] Captura de fornecedores agendada (${expression}, horário de Brasília).`);
    } else logger.warn(`[Scheduler] SCRAPER_SCHEDULE_CRON inválido: "${expression}".`);
  }

  if (enabled(config.BACKUP_ENABLED, true)) {
    const expression = config.BACKUP_CRON || DEFAULT_BACKUP_CRON;
    if (addTask(expression, runBackupJob)) logger.info(`[Scheduler] Backup automático agendado (${expression}).`);
    else logger.warn(`[Scheduler] BACKUP_CRON inválido: "${expression}".`);
  }
}

export function initScheduledJobs(): void {
  void import("../jobs/aiJobRunner")
    .then(({ recoverStaleAiJobs }) => recoverStaleAiJobs())
    .then((count) => {
      if (count > 0) {
        logger.warn(`[Scheduler] ${count} job(s) de IA interrompido(s) por restart foram marcados como erro.`);
      }
    })
    .catch(() => undefined);

  void refreshRuntimeSchedules().catch((error) => {
    logger.error("[Scheduler] Falha ao configurar agendamentos:", (error as Error).message);
  });
}
