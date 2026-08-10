import cron from "node-cron";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { certidoes, emailQuotations, scraperConfigs } from "../../drizzle/schema";
import { logger } from "../_core/logger";
import { notifyOwner } from "../_core/notification";
import { finishSyncRun, startSyncRun } from "../connectors/baseConnector";
import { resolveCredential, resolveCredentials } from "../integrations/core/credentialResolver";
import { purgeExpiredIntegrationCache } from "../integrations/core/integrationCache";
import { classificarValidade } from "../routers/certidoes";
import { getDb, withDatabaseAdvisoryLock } from "../db";
import { cleanupOldBackups, runDatabaseBackup } from "./backupService";
import { isImapConfigured } from "./emailInboxService";
import { syncEmailQuotations } from "./emailQuotationSyncService";
import { executarScraper } from "./scraperEngine";
import { syncS2PortalOpportunitiesSafely } from "./s2PortalOpportunityOrchestrator";
import { expandAndSyncTambasaCatalog } from "./tambasaCatalogService";
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
const SCRAPER_CONCURRENCY = 2;

type SyncRunStatus = "success" | "partial";

interface TrackedJobOutcome {
  status?: SyncRunStatus;
  insertedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  errorCount?: number;
  errorDetails?: string;
}

interface ScheduledScraperConfig {
  id: number;
  scraperType: string;
  scheduleTime: string | null;
  lastRunAt: Date | null;
}

interface SchedulePlan {
  name: string;
  expression: string;
  timezone?: string;
  run: () => void | Promise<void>;
  logMessage: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function enabled(flag: string | undefined, defaultOn: boolean): boolean {
  if (flag == null || flag.trim() === "") return defaultOn;
  const normalized = flag.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "no" && normalized !== "off";
}

async function notifyJobFailure(title: string, detail: string): Promise<void> {
  const failureAlerts = await resolveCredential("FAILURE_ALERTS_ENABLED");
  if (!enabled(failureAlerts, true)) return;
  try {
    await notifyOwner({ title, content: detail });
  } catch (error) {
    logger.error("[Scheduler] Falha ao enviar notificação de erro:", errorMessage(error));
  }
  if (await isWhatsappConfigured()) {
    try {
      await enviarWhatsapp(`⚠️ ${title}\n\n${detail}`);
    } catch (error) {
      logger.error("[Scheduler] Falha ao enviar WhatsApp de erro:", errorMessage(error));
    }
  }
}

/**
 * Coordenação distribuída sem Redis: MySQL GET_LOCK mantém exclusividade entre
 * processos/replicas e sync_runs registra sucesso, parcialidade ou erro.
 */
async function runTrackedJob(
  name: string,
  task: () => Promise<TrackedJobOutcome | void>,
): Promise<boolean> {
  const locked = await withDatabaseAdvisoryLock(`job:${name}`, async () => {
    const runId = await startSyncRun(`job:${name}`);
    try {
      const outcome = (await task()) ?? {};
      await finishSyncRun(runId, {
        insertedCount: outcome.insertedCount ?? 0,
        updatedCount: outcome.updatedCount ?? 0,
        skippedCount: outcome.skippedCount ?? 0,
        errorCount: outcome.errorCount ?? 0,
        status: outcome.status ?? "success",
        errorDetails: outcome.errorDetails,
      });
    } catch (error) {
      await finishSyncRun(runId, {
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 1,
        status: "error",
        errorDetails: errorMessage(error).slice(0, 4_000),
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
      return {
        status: result.errors.length ? "partial" : "success",
        insertedCount: result.imported,
        skippedCount: result.skipped,
        errorCount: result.errors.length,
        errorDetails: result.errors.length ? result.errors.slice(0, 20).join("; ") : undefined,
      };
    } catch (error) {
      const detail = errorMessage(error);
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
      const detail = result.errors.length ? result.errors.slice(0, 20).join("; ") : undefined;
      if (detail) logger.warn(`[Scheduler] Radar dos portais com cobertura parcial: ${detail}`);
      return {
        status: result.errors.length ? "partial" : "success",
        insertedCount: result.imported,
        skippedCount: result.skipped,
        errorCount: result.errors.length,
        errorDetails: detail,
      };
    } catch (error) {
      const detail = errorMessage(error);
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
    const checkErrors: string[] = [];

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
      const detail = `certidões: ${errorMessage(error)}`;
      checkErrors.push(detail);
      logger.error("[Scheduler] Falha ao verificar certidões:", detail);
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
        const days = Math.floor((new Date(quotation.prazoResposta).getTime() - now.getTime()) / msPerDay);
        const label = `${quotation.orgao ?? quotation.subject ?? `Cotação ${quotation.id}`}`;
        if (days < 0) expired.push(label);
        else if (days <= DEADLINE_DAYS) upcoming.push(`${label} (${days}d)`);
      }
      if (expired.length) lines.push(`Cotações com prazo VENCIDO sem resposta: ${expired.join("; ")}`);
      if (upcoming.length) lines.push(`Cotações vencendo em ${DEADLINE_DAYS} dias: ${upcoming.join("; ")}`);
    } catch (error) {
      const detail = `prazos: ${errorMessage(error)}`;
      checkErrors.push(detail);
      logger.error("[Scheduler] Falha ao verificar prazos:", detail);
    }

    if (lines.length > 0) {
      await notifyOwner({ title: "Alertas do dia — Sistema S2", content: lines.join("\n") });
      if (await isWhatsappConfigured()) {
        const sent = await enviarWhatsapp(`📋 Alertas do dia — Sistema S2\n\n${lines.join("\n")}`);
        if (sent) logger.info("[Scheduler] Alertas diários também enviados por WhatsApp.");
      }
      logger.info(`[Scheduler] Alertas diários: ${lines.length} pendência(s) notificada(s).`);
    }

    if (checkErrors.length) {
      const detail = checkErrors.join("; ").slice(0, 4_000);
      await notifyJobFailure("Alertas diários executados parcialmente — Sistema S2", detail);
      return { status: "partial", errorCount: checkErrors.length, errorDetails: detail };
    }
    return { status: "success" };
  });
}

async function executeScheduledScraper(config: { id: number; scraperType: string }): Promise<void> {
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
    return { status: "success", insertedCount: result.productsScraped };
  });
}

function isDueScraper(config: ScheduledScraperConfig, now: Date): boolean {
  const nowInBrazil = new Date(now.toLocaleString("en-US", { timeZone: SCRAPER_TIMEZONE }));
  const hhmm = `${String(nowInBrazil.getHours()).padStart(2, "0")}:${String(nowInBrazil.getMinutes()).padStart(2, "0")}`;
  if (!config.scheduleTime || config.scheduleTime > hhmm) return false;

  const isTambasa = config.scraperType.toLowerCase() === "tambasa";
  const lastRunAtMs = config.lastRunAt ? new Date(config.lastRunAt).getTime() : null;
  if (isTambasa && lastRunAtMs != null && now.getTime() - lastRunAtMs < TAMBASA_MIN_INTERVAL_MS) return false;

  const today = now.toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE });
  const lastRunDay = config.lastRunAt
    ? new Date(config.lastRunAt).toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE })
    : null;
  return lastRunDay !== today;
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(workers);
}

async function runScheduledScrapers(): Promise<void> {
  let due: ScheduledScraperConfig[] = [];

  // O lock global cobre somente a seleção. Execuções longas usam locks
  // individuais, evitando reservar uma conexão MySQL durante todo o lote.
  const selected = await runTrackedJob("scraper-scan", async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível para scheduler de scrapers.");
    const active = await db
      .select({
        id: scraperConfigs.id,
        scraperType: scraperConfigs.scraperType,
        scheduleTime: scraperConfigs.scheduleTime,
        lastRunAt: scraperConfigs.lastRunAt,
      })
      .from(scraperConfigs)
      .where(and(eq(scraperConfigs.enabled, "yes"), eq(scraperConfigs.tosAprovado, true)));
    const now = new Date();
    due = active.filter((config) => isDueScraper(config, now));
    return { status: "success", skippedCount: active.length - due.length };
  });
  if (!selected || !due.length) return;

  await runWithConcurrency(due, SCRAPER_CONCURRENCY, async (config) => {
    try {
      await executeScheduledScraper(config);
    } catch (error) {
      logger.error(`[Scheduler] Scraper #${config.id} falhou:`, errorMessage(error));
    }
  });
}

export async function runBackupJob(): Promise<void> {
  await runTrackedJob("database-backup", async () => {
    const destDir = process.env.BACKUP_DIR || "backups";
    const keepRaw = await resolveCredential("BACKUP_KEEP_DAYS");
    const parsedKeepDays = Number(keepRaw);
    const keepDays = Number.isInteger(parsedKeepDays) && parsedKeepDays > 0
      ? parsedKeepDays
      : DEFAULT_BACKUP_KEEP_DAYS;
    const result = await runDatabaseBackup({ destDir });
    if (!result.success) {
      const detail = result.error ?? "erro desconhecido";
      logger.error(`[Scheduler] Backup falhou: ${detail}`);
      await notifyJobFailure(
        "Falha no backup automático — Sistema S2",
        `O backup diário do banco falhou: ${detail}. Verifique o servidor.`,
      );
      throw new Error(detail);
    }

    const removed = cleanupOldBackups(destDir, keepDays, Date.now());
    const purgedCache = await purgeExpiredIntegrationCache();
    logger.info(
      `[Scheduler] Backup concluído: ${result.file}` +
        (removed > 0 ? ` (${removed} backup(s) antigo(s) removido(s)).` : ".") +
        (purgedCache > 0 ? ` Cache: ${purgedCache} entrada(s) expirada(s) removida(s).` : ""),
    );
    return { status: "success" };
  });
}

type ScheduledTask = ReturnType<typeof cron.schedule>;
const runtimeTasks: ScheduledTask[] = [];
let scheduleRefreshChain: Promise<void> = Promise.resolve();

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

function addTask(plan: SchedulePlan): void {
  const task = cron.schedule(
    plan.expression,
    () => {
      void Promise.resolve()
        .then(() => plan.run())
        .catch((error) => logger.error(`[Scheduler] ${plan.name} falhou:`, errorMessage(error)));
    },
    plan.timezone ? { timezone: plan.timezone } : undefined,
  );
  runtimeTasks.push(task);
  logger.info(plan.logMessage);
}

async function buildSchedulePlans(): Promise<SchedulePlan[]> {
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
  const plans: SchedulePlan[] = [];

  if (enabled(config.EMAIL_SYNC_ENABLED, true)) {
    const expression = config.EMAIL_SYNC_CRON || DEFAULT_EMAIL_SYNC_CRON;
    plans.push({
      name: "email-sync",
      expression,
      run: async () => {
        if (await isImapConfigured()) await runEmailSync();
      },
      logMessage: `[Scheduler] Sincronização de cotações por e-mail agendada (${expression}).`,
    });
  }
  if (enabled(config.PORTAL_OPPORTUNITY_SYNC_ENABLED, true)) {
    const expression = config.PORTAL_OPPORTUNITY_SYNC_CRON || DEFAULT_PORTAL_OPPORTUNITY_SYNC_CRON;
    plans.push({
      name: "portal-opportunity-sync",
      expression,
      timezone: SCRAPER_TIMEZONE,
      run: runPortalOpportunitySync,
      logMessage: `[Scheduler] Radar de portais agendado (${expression}, horário de Brasília).`,
    });
  }
  if (enabled(config.ALERTS_ENABLED, true)) {
    const expression = config.ALERTS_CRON || DEFAULT_ALERTS_CRON;
    plans.push({
      name: "daily-alerts",
      expression,
      run: runDailyAlerts,
      logMessage: `[Scheduler] Alertas diários agendados (${expression}).`,
    });
  }
  if (enabled(config.SCRAPER_SCHEDULE_ENABLED, true)) {
    const expression = config.SCRAPER_SCHEDULE_CRON || DEFAULT_SCRAPER_SCHEDULE_CRON;
    plans.push({
      name: "scraper-scan",
      expression,
      timezone: SCRAPER_TIMEZONE,
      run: runScheduledScrapers,
      logMessage: `[Scheduler] Captura de fornecedores agendada (${expression}, horário de Brasília).`,
    });
  }
  if (enabled(config.BACKUP_ENABLED, true)) {
    const expression = config.BACKUP_CRON || DEFAULT_BACKUP_CRON;
    plans.push({
      name: "database-backup",
      expression,
      run: runBackupJob,
      logMessage: `[Scheduler] Backup automático agendado (${expression}).`,
    });
  }

  for (const plan of plans) {
    if (!cron.validate(plan.expression)) {
      throw new Error(`${plan.name}: expressão cron inválida: "${plan.expression}".`);
    }
  }
  return plans;
}

async function performScheduleRefresh(): Promise<void> {
  // Resolve e valida todo o novo plano antes de destruir o plano ativo.
  const plans = await buildSchedulePlans();
  clearRuntimeTasks();
  for (const plan of plans) addTask(plan);
}

/**
 * Recarrega agendas em runtime sem redeploy. Chamadas concorrentes são
 * serializadas para impedir clear/create intercalados e tarefas duplicadas.
 */
export function refreshRuntimeSchedules(): Promise<void> {
  const next = scheduleRefreshChain.then(performScheduleRefresh, performScheduleRefresh);
  scheduleRefreshChain = next.catch(() => undefined);
  return next;
}

export function initScheduledJobs(): void {
  void import("../jobs/aiJobRunner")
    .then(({ recoverStaleAiJobs }) => recoverStaleAiJobs())
    .then((count) => {
      if (count > 0) {
        logger.warn(`[Scheduler] ${count} job(s) de IA interrompido(s) por restart foram marcados como erro.`);
      }
    })
    .catch((error) => logger.warn("[Scheduler] Falha ao recuperar jobs de IA interrompidos:", errorMessage(error)));

  void refreshRuntimeSchedules().catch((error) => {
    logger.error("[Scheduler] Falha ao configurar agendamentos:", errorMessage(error));
  });
}
