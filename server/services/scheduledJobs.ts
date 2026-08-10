import cron from "node-cron";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { getDb } from "../db";
import { certidoes, emailQuotations } from "../../drizzle/schema";
import { isImapConfigured } from "./emailInboxService";
import { syncEmailQuotations } from "./emailQuotationSyncService";
import { syncS2PortalOpportunitiesSafely } from "./s2PortalOpportunityOrchestrator";
import { classificarValidade } from "../routers/certidoes";
import { notifyOwner } from "../_core/notification";
import { enviarWhatsapp, isWhatsappConfigured } from "./whatsappService";
import {
  CAPTURE_SCHEDULE_TIMEZONE,
  runDueScheduledCaptures,
} from "./captureScheduleService";
import { runDatabaseBackup, cleanupOldBackups } from "./backupService";
import { logger } from "../_core/logger";

/**
 * Agendador central de jobs recorrentes.
 *
 * Capturas não executam navegador no cron. O cron apenas pede ao serviço de
 * agenda para enfileirar configs cujo `nextRunAt` venceu; workers persistentes
 * cuidam de claim, retry, heartbeat, recuperação e processamento.
 */

const DEFAULT_EMAIL_SYNC_CRON = "*/15 * * * *";
const DEFAULT_PORTAL_OPPORTUNITY_SYNC_CRON = "0 7,12,17 * * *";
const DEFAULT_ALERTS_CRON = "0 8 * * *";
const DEFAULT_SCRAPER_SCHEDULE_CRON = "* * * * *";
const DEFAULT_BACKUP_CRON = "0 3 * * *";
const DEFAULT_BACKUP_KEEP_DAYS = 14;
const ALERT_DAYS = 30;
const DEADLINE_DAYS = 3;

function enabled(flag: string | undefined, defaultOn: boolean): boolean {
  if (flag == null || flag.trim() === "") return defaultOn;
  const value = flag.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "no" && value !== "off";
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

async function notifyJobFailure(title: string, detail: string): Promise<void> {
  if (!enabled(process.env.FAILURE_ALERTS_ENABLED, true)) return;

  try {
    await notifyOwner({ title, content: detail });
  } catch (error) {
    logger.error(
      "[Scheduler] Falha ao enviar notificação de erro:",
      (error as Error).message,
    );
  }

  if (!isWhatsappConfigured()) return;

  try {
    await enviarWhatsapp(`⚠️ ${title}\n\n${detail}`);
  } catch (error) {
    logger.error(
      "[Scheduler] Falha ao enviar WhatsApp de erro:",
      (error as Error).message,
    );
  }
}

let emailSyncRunning = false;
let portalOpportunitySyncRunning = false;
let scheduledCaptureCheckRunning = false;

async function runEmailSync(): Promise<void> {
  if (emailSyncRunning) {
    logger.warn(
      "[Scheduler] Sincronização de e-mail anterior ainda em andamento — pulando este ciclo.",
    );
    return;
  }

  emailSyncRunning = true;
  try {
    const result = await syncEmailQuotations({ limit: 50 });
    if (result.imported > 0 || result.errors.length > 0) {
      logger.info(
        `[Scheduler] Cotações e-mail: ${result.imported} importadas, ` +
          `${result.skipped} já existentes, ${result.errors.length} avisos.`,
      );
    }
  } catch (error) {
    logger.error(
      "[Scheduler] Falha na sincronização de e-mail:",
      (error as Error).message,
    );
  } finally {
    emailSyncRunning = false;
  }
}

export async function runPortalOpportunitySync(): Promise<void> {
  if (portalOpportunitySyncRunning) {
    logger.warn(
      "[Scheduler] Radar dos seis portais ainda em andamento — pulando este ciclo.",
    );
    return;
  }

  portalOpportunitySyncRunning = true;
  try {
    const result = await syncS2PortalOpportunitiesSafely();
    logger.info(
      `[Scheduler] Seis portais S2: ${result.found} encontradas, ` +
        `${result.imported} importadas, ${result.skipped} já existentes, ` +
        `${result.matchedItems} itens casados com Tambasa e ` +
        `${result.unmatchedItems} sem correspondência.`,
    );

    if (result.errors.length > 0) {
      const detail = result.errors.slice(0, 8).join("; ");
      logger.warn(
        `[Scheduler] Radar dos seis portais com ${result.errors.length} aviso(s): ${detail}`,
      );
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

  const hoje = new Date();
  const linhas: string[] = [];

  try {
    const certs = await db
      .select()
      .from(certidoes)
      .where(eq(certidoes.ativa, true));
    const vencidas: string[] = [];
    const vencendo: string[] = [];

    for (const certificate of certs) {
      if (!certificate.dataValidade) continue;
      const status = classificarValidade(
        new Date(certificate.dataValidade),
        hoje,
        ALERT_DAYS,
      );
      const dataFmt = new Date(certificate.dataValidade).toLocaleDateString("pt-BR");

      if (status === "vencida") {
        vencidas.push(`${certificate.tipo} (venceu ${dataFmt})`);
      } else if (status === "vence_em_breve") {
        vencendo.push(`${certificate.tipo} (vence ${dataFmt})`);
      }
    }

    if (vencidas.length > 0) {
      linhas.push(`Certidões VENCIDAS: ${vencidas.join("; ")}`);
    }
    if (vencendo.length > 0) {
      linhas.push(
        `Certidões vencendo em ${ALERT_DAYS} dias: ${vencendo.join("; ")}`,
      );
    }
  } catch (error) {
    logger.error(
      "[Scheduler] Falha ao verificar certidões:",
      (error as Error).message,
    );
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

    const msPerDay = 24 * 60 * 60 * 1_000;
    const overdue: string[] = [];
    const upcoming: string[] = [];

    for (const quotation of quotations) {
      if (
        !quotation.prazoResposta ||
        quotation.status === "respondida" ||
        quotation.status === "descartada"
      ) {
        continue;
      }

      const days = Math.floor(
        (new Date(quotation.prazoResposta).getTime() - hoje.getTime()) / msPerDay,
      );
      const label = String(
        quotation.orgao ?? quotation.subject ?? `Cotação ${quotation.id}`,
      );

      if (days < 0) overdue.push(label);
      else if (days <= DEADLINE_DAYS) upcoming.push(`${label} (${days}d)`);
    }

    if (overdue.length > 0) {
      linhas.push(
        `Cotações com prazo VENCIDO sem resposta: ${overdue.join("; ")}`,
      );
    }
    if (upcoming.length > 0) {
      linhas.push(
        `Cotações vencendo em ${DEADLINE_DAYS} dias: ${upcoming.join("; ")}`,
      );
    }
  } catch (error) {
    logger.error(
      "[Scheduler] Falha ao verificar prazos:",
      (error as Error).message,
    );
  }

  if (linhas.length === 0) return;

  try {
    await notifyOwner({
      title: "Alertas do dia — Sistema S2",
      content: linhas.join("\n"),
    });

    if (isWhatsappConfigured()) {
      const sent = await enviarWhatsapp(
        `📋 Alertas do dia — Sistema S2\n\n${linhas.join("\n")}`,
      );
      if (sent) {
        logger.info("[Scheduler] Alertas diários também enviados por WhatsApp.");
      }
    }

    logger.info(
      `[Scheduler] Alertas diários: ${linhas.length} pendência(s) notificada(s).`,
    );
  } catch (error) {
    logger.error(
      "[Scheduler] Falha ao enviar alertas diários:",
      (error as Error).message,
    );
  }
}

async function runScheduledScrapers(): Promise<void> {
  if (scheduledCaptureCheckRunning) {
    logger.warn(
      "[Scheduler] Verificação de capturas anterior ainda em andamento — pulando este ciclo.",
    );
    return;
  }

  scheduledCaptureCheckRunning = true;
  try {
    const result = await runDueScheduledCaptures();

    if (
      result.initialized > 0 ||
      result.enqueued > 0 ||
      result.reused > 0 ||
      result.failures.length > 0
    ) {
      logger.info(
        `[Scheduler] Capture Core: ${result.evaluated} devidas, ` +
          `${result.initialized} agendas inicializadas, ${result.enqueued} novas, ` +
          `${result.reused} reutilizadas, ${result.failures.length} falhas.`,
      );
    }

    if (result.failures.length > 0) {
      const detail = result.failures
        .slice(0, 10)
        .map((failure) => `#${failure.scraperConfigId}: ${failure.error}`)
        .join("; ");
      await notifyJobFailure(
        "Falha ao agendar captura — Sistema S2",
        `${result.failures.length} configuração(ões) não puderam ser enfileiradas: ${detail}`,
      );
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("[Scheduler] Falha na agenda do Capture Core:", detail);
    await notifyJobFailure(
      "Falha na agenda de capturas — Sistema S2",
      detail,
    );
  } finally {
    scheduledCaptureCheckRunning = false;
  }
}

export async function runBackupJob(): Promise<void> {
  const destination = process.env.BACKUP_DIR || "backups";
  const keepDays = readPositiveInteger(
    process.env.BACKUP_KEEP_DAYS,
    DEFAULT_BACKUP_KEEP_DAYS,
    365,
  );
  const result = await runDatabaseBackup({ destDir: destination });

  if (result.success) {
    const removed = cleanupOldBackups(destination, keepDays, Date.now());
    logger.info(
      `[Scheduler] Backup concluído: ${result.file}` +
        (removed > 0 ? ` (${removed} backup(s) antigo(s) removido(s)).` : "."),
    );
    return;
  }

  logger.error(`[Scheduler] Backup falhou: ${result.error}`);
  await notifyJobFailure(
    "Falha no backup automático — Sistema S2",
    `O backup diário do banco falhou: ${result.error ?? "erro desconhecido"}. ` +
      "Verifique o servidor — sem backup recente, um incidente pode causar perda de dados.",
  );
}

function scheduleCron(
  expression: string,
  task: () => void,
  label: string,
  options?: { timezone?: string },
): void {
  if (!cron.validate(expression)) {
    logger.warn(
      `[Scheduler] ${label}: expressão cron inválida "${expression}" — rotina desativada.`,
    );
    return;
  }

  cron.schedule(expression, task, options);
  logger.info(
    `[Scheduler] ${label} agendado (${expression}` +
      `${options?.timezone ? `, ${options.timezone}` : ""}).`,
  );
}

export function initScheduledJobs(): void {
  void import("./emailConfigService")
    .then(({ applyEmailConfigFromDb }) => applyEmailConfigFromDb())
    .catch((error) =>
      logger.warn("[Scheduler] Configuração de e-mail não aplicada:", error),
    );

  void import("./aiConfigService")
    .then(({ applyAiConfigFromDb }) => applyAiConfigFromDb())
    .catch((error) =>
      logger.warn("[Scheduler] Configuração de IA não aplicada:", error),
    );

  void import("./integrationSettingsService")
    .then(({ applyIntegrationSettingsFromDb }) => applyIntegrationSettingsFromDb())
    .catch((error) =>
      logger.warn("[Scheduler] Configuração de integrações não aplicada:", error),
    );

  void import("../jobs/aiJobRunner")
    .then(({ recoverStaleAiJobs }) => recoverStaleAiJobs())
    .then((count) => {
      if (count > 0) {
        logger.warn(
          `[Scheduler] ${count} job(s) de IA interrompido(s) por restart foram marcados como erro.`,
        );
      }
    })
    .catch((error) =>
      logger.warn("[Scheduler] Recovery de jobs de IA falhou:", error),
    );

  void import("../jobs/captureJobRunner")
    .then(({ startCaptureJobRunner }) => startCaptureJobRunner())
    .catch((error) =>
      logger.error("[Scheduler] Falha ao iniciar CaptureRunner:", error),
    );

  if (enabled(process.env.EMAIL_SYNC_ENABLED, true)) {
    scheduleCron(
      process.env.EMAIL_SYNC_CRON || DEFAULT_EMAIL_SYNC_CRON,
      () => {
        if (isImapConfigured()) void runEmailSync();
      },
      "Sincronização de cotações por e-mail",
    );
  }

  if (enabled(process.env.PORTAL_OPPORTUNITY_SYNC_ENABLED, true)) {
    scheduleCron(
      process.env.PORTAL_OPPORTUNITY_SYNC_CRON || DEFAULT_PORTAL_OPPORTUNITY_SYNC_CRON,
      () => {
        void runPortalOpportunitySync();
      },
      "Radar dos seis portais S2",
      { timezone: CAPTURE_SCHEDULE_TIMEZONE },
    );
  }

  if (enabled(process.env.ALERTS_ENABLED, true)) {
    scheduleCron(
      process.env.ALERTS_CRON || DEFAULT_ALERTS_CRON,
      () => {
        void runDailyAlerts();
      },
      "Alertas diários",
      { timezone: CAPTURE_SCHEDULE_TIMEZONE },
    );
  }

  if (enabled(process.env.SCRAPER_SCHEDULE_ENABLED, true)) {
    scheduleCron(
      process.env.SCRAPER_SCHEDULE_CRON || DEFAULT_SCRAPER_SCHEDULE_CRON,
      () => {
        void runScheduledScrapers();
      },
      "Agenda de capturas",
      { timezone: CAPTURE_SCHEDULE_TIMEZONE },
    );
  }

  if (enabled(process.env.BACKUP_ENABLED, true)) {
    scheduleCron(
      process.env.BACKUP_CRON || DEFAULT_BACKUP_CRON,
      () => {
        void runBackupJob();
      },
      "Backup automático do banco",
      { timezone: CAPTURE_SCHEDULE_TIMEZONE },
    );
  }
}
