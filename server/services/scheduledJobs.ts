import cron from "node-cron";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { certidoes, emailQuotations, scraperConfigs } from "../../drizzle/schema";
import { logger } from "../_core/logger";
import { notifyOwner } from "../_core/notification";
import { classificarValidade } from "../routers/certidoes";
import { getDb } from "../db";
import { cleanupOldBackups, runDatabaseBackup } from "./backupService";
import { withDistributedJobLock } from "./distributedJobLockService";
import { isImapConfigured } from "./emailInboxService";
import { syncEmailQuotations } from "./emailQuotationSyncService";
import { expandAndSyncTambasaCatalog } from "./tambasaCatalogService";
import { executarScraper } from "./scraperEngine";
import { syncS2PortalOpportunitiesSafely } from "./s2PortalOpportunityOrchestrator";
import { enviarWhatsapp, isWhatsappConfigured } from "./whatsappService";

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

async function runScheduledWithDistributedLock(
  lockName: string,
  label: string,
  task: () => Promise<void>,
): Promise<void> {
  try {
    const result = await withDistributedJobLock(lockName, task);
    if (!result.acquired) {
      logger.info(`[Scheduler] ${label}: outra instância já executa este ciclo — ignorando.`);
    }
  } catch (error) {
    logger.error(`[Scheduler] ${label}: falha ao obter/usar trava distribuída`, error);
  }
}

async function notifyJobFailure(title: string, detail: string): Promise<void> {
  if (!enabled(process.env.FAILURE_ALERTS_ENABLED, true)) return;
  try {
    await notifyOwner({ title, content: detail });
  } catch (error) {
    logger.error("[Scheduler] Falha ao enviar notificação de erro:", (error as Error).message);
  }
  if (isWhatsappConfigured()) {
    try {
      await enviarWhatsapp(`⚠️ ${title}\n\n${detail}`);
    } catch (error) {
      logger.error("[Scheduler] Falha ao enviar WhatsApp de erro:", (error as Error).message);
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
  } catch (error) {
    logger.error("[Scheduler] Falha na sincronização de e-mail:", (error as Error).message);
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
  } catch (error) {
    const detail = (error as Error).message;
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
  const today = new Date();
  const lines: string[] = [];

  try {
    const certificates = await db
      .select()
      .from(certidoes)
      .where(eq(certidoes.ativa, true));
    const expired: string[] = [];
    const expiring: string[] = [];
    for (const certificate of certificates) {
      if (!certificate.dataValidade) continue;
      const status = classificarValidade(new Date(certificate.dataValidade), today, ALERT_DAYS);
      const formattedDate = new Date(certificate.dataValidade).toLocaleDateString("pt-BR");
      if (status === "vencida") expired.push(`${certificate.tipo} (venceu ${formattedDate})`);
      else if (status === "vence_em_breve") expiring.push(`${certificate.tipo} (vence ${formattedDate})`);
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
      if (!quotation.prazoResposta) continue;
      const days = Math.floor((new Date(quotation.prazoResposta).getTime() - today.getTime()) / msPerDay);
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
    if (isWhatsappConfigured()) {
      const sent = await enviarWhatsapp(`📋 Alertas do dia — Sistema S2\n\n${lines.join("\n")}`);
      if (sent) logger.info("[Scheduler] Alertas diários também enviados por WhatsApp.");
    }
    logger.info(`[Scheduler] Alertas diários: ${lines.length} pendência(s) notificada(s).`);
  }
}

const scraperFiredOn = new Map<number, string>();

async function runScheduledScrapers(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: SCRAPER_TIMEZONE }));
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE });

  try {
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
      if (isTambasa && lastRunAtMs != null && Date.now() - lastRunAtMs < TAMBASA_MIN_INTERVAL_MS) {
        continue;
      }

      const lastRunDay = config.lastRunAt
        ? new Date(config.lastRunAt).toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE })
        : null;
      if (lastRunDay === today || scraperFiredOn.get(config.id) === today) continue;
      scraperFiredOn.set(config.id, today);

      try {
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
        }
      } catch (error) {
        logger.error(`[Scheduler] Scraper #${config.id} falhou:`, (error as Error).message);
        await notifyJobFailure(
          "Falha na captura agendada — Sistema S2",
          `A captura do fornecedor (config #${config.id}) lançou erro: ${(error as Error).message}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } catch (error) {
    logger.error("[Scheduler] Falha ao verificar agendamentos de scraper:", (error as Error).message);
  }
}

export async function runBackupJob(): Promise<void> {
  const destDir = process.env.BACKUP_DIR || "backups";
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS) || DEFAULT_BACKUP_KEEP_DAYS;
  const result = await runDatabaseBackup({ destDir });
  if (result.success) {
    const removed = cleanupOldBackups(destDir, keepDays, Date.now());
    logger.info(
      `[Scheduler] Backup concluído: ${result.file}` +
        (removed > 0 ? ` (${removed} backup(s) antigo(s) removido(s)).` : "."),
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
    .then((count) => {
      if (count > 0) {
        logger.warn(`[Scheduler] ${count} job(s) de IA interrompido(s) por restart foram marcados como erro.`);
      }
    })
    .catch(() => undefined);

  if (enabled(process.env.EMAIL_SYNC_ENABLED, true)) {
    const expression = process.env.EMAIL_SYNC_CRON || DEFAULT_EMAIL_SYNC_CRON;
    if (cron.validate(expression)) {
      cron.schedule(expression, () => {
        if (!isImapConfigured()) return;
        void runScheduledWithDistributedLock("s2_job_email_sync", "Sincronização de e-mail", runEmailSync);
      });
      logger.info(`[Scheduler] Sincronização de cotações por e-mail agendada (${expression}).`);
    } else {
      logger.warn(`[Scheduler] EMAIL_SYNC_CRON inválido: "${expression}" — sincronização automática desativada.`);
    }
  }

  if (enabled(process.env.PORTAL_OPPORTUNITY_SYNC_ENABLED, true)) {
    const expression = process.env.PORTAL_OPPORTUNITY_SYNC_CRON || DEFAULT_PORTAL_OPPORTUNITY_SYNC_CRON;
    if (cron.validate(expression)) {
      cron.schedule(
        expression,
        () => {
          void runScheduledWithDistributedLock(
            "s2_job_portal_sync",
            "Radar dos portais",
            runPortalOpportunitySync,
          );
        },
        { timezone: SCRAPER_TIMEZONE },
      );
      logger.info(
        `[Scheduler] Radar COPASA/CEMIG/Fundep/Funarbe/ComprasMG/FIEMG agendado (${expression}, horário de Brasília; envio sujeito à aprovação).`,
      );
    } else {
      logger.warn(`[Scheduler] PORTAL_OPPORTUNITY_SYNC_CRON inválido: "${expression}" — radar desativado.`);
    }
  }

  if (enabled(process.env.ALERTS_ENABLED, true)) {
    const expression = process.env.ALERTS_CRON || DEFAULT_ALERTS_CRON;
    if (cron.validate(expression)) {
      cron.schedule(
        expression,
        () => {
          void runScheduledWithDistributedLock("s2_job_daily_alerts", "Alertas diários", runDailyAlerts);
        },
        { timezone: SCRAPER_TIMEZONE },
      );
      logger.info(`[Scheduler] Alertas diários agendados (${expression}, horário de Brasília).`);
    } else {
      logger.warn(`[Scheduler] ALERTS_CRON inválido: "${expression}" — alertas diários desativados.`);
    }
  }

  if (enabled(process.env.SCRAPER_SCHEDULE_ENABLED, true)) {
    const expression = process.env.SCRAPER_SCHEDULE_CRON || DEFAULT_SCRAPER_SCHEDULE_CRON;
    if (cron.validate(expression)) {
      cron.schedule(
        expression,
        () => {
          void runScheduledWithDistributedLock(
            "s2_job_scraper_schedule",
            "Agendamento de scrapers",
            runScheduledScrapers,
          );
        },
        { timezone: SCRAPER_TIMEZONE },
      );
      logger.info(
        `[Scheduler] Execução automática de fornecedores agendada (verificação ${expression}, horário de Brasília).`,
      );
    } else {
      logger.warn(`[Scheduler] SCRAPER_SCHEDULE_CRON inválido: "${expression}" — agendamento desativado.`);
    }
  }

  if (enabled(process.env.BACKUP_ENABLED, true)) {
    const expression = process.env.BACKUP_CRON || DEFAULT_BACKUP_CRON;
    if (cron.validate(expression)) {
      cron.schedule(
        expression,
        () => {
          void runScheduledWithDistributedLock("s2_job_backup", "Backup automático", runBackupJob);
        },
        { timezone: SCRAPER_TIMEZONE },
      );
      logger.info(`[Scheduler] Backup automático do banco agendado (${expression}, horário de Brasília).`);
    } else {
      logger.warn(`[Scheduler] BACKUP_CRON inválido: "${expression}" — backup automático desativado.`);
    }
  }
}
