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
import { executarScraper } from "./scraperEngine";
import { expandAndSyncTambasaCatalog } from "./tambasaCatalogService";
import { runDatabaseBackup, cleanupOldBackups } from "./backupService";
import { logger } from "../_core/logger";
import {
  resolveCredential,
  resolveCredentials,
} from "../integrations/core/credentialResolver";

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
  } catch (err) {
    logger.error("[Scheduler] Falha ao enviar notificação de erro:", (err as Error).message);
  }
  if (await isWhatsappConfigured()) {
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
    const detail = (err as Error).message;
    logger.error("[Scheduler] Falha na sincronização de e-mail:", detail);
    await notifyJobFailure("Falha na sincronização de e-mail — Sistema S2", detail);
  } finally {
    emailSyncRunning = false;
  }
}

export async function runPortalOpportunitySync(): Promise<void> {
  if (portalOpportunitySyncRunning) {
    logger.warn("[Scheduler] Radar dos portais ainda em andamento — pulando este ciclo.");
    return;
  }
  portalOpportunitySyncRunning = true;
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
  } catch (err) {
    const detail = (err as Error).message;
    logger.error("[Scheduler] Falha no radar dos portais:", detail);
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
    if (await isWhatsappConfigured()) {
      const enviado = await enviarWhatsapp(`📋 Alertas do dia — Sistema S2\n\n${linhas.join("\n")}`);
      if (enviado) logger.info("[Scheduler] Alertas diários também enviados por WhatsApp.");
    }
    logger.info(`[Scheduler] Alertas diários: ${linhas.length} pendência(s) notificada(s).`);
  }
}

const scraperFiredOn = new Map<number, string>();

async function runScheduledScrapers(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: SCRAPER_TIMEZONE }));
  const hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE });

  try {
    const ativos = await db
      .select({
        id: scraperConfigs.id,
        scraperType: scraperConfigs.scraperType,
        scheduleTime: scraperConfigs.scheduleTime,
        lastRunAt: scraperConfigs.lastRunAt,
      })
      .from(scraperConfigs)
      .where(and(eq(scraperConfigs.enabled, "yes"), eq(scraperConfigs.tosAprovado, true)));

    for (const cfg of ativos) {
      if (!cfg.scheduleTime || cfg.scheduleTime > hhmm) continue;

      const isTambasa = cfg.scraperType.toLowerCase() === "tambasa";
      const lastRunAtMs = cfg.lastRunAt ? new Date(cfg.lastRunAt).getTime() : null;
      if (isTambasa && lastRunAtMs != null && Date.now() - lastRunAtMs < TAMBASA_MIN_INTERVAL_MS) continue;

      const lastRunDay = cfg.lastRunAt
        ? new Date(cfg.lastRunAt).toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE })
        : null;
      if (lastRunDay === hoje || scraperFiredOn.get(cfg.id) === hoje) continue;
      scraperFiredOn.set(cfg.id, hoje);

      const runPromise = isTambasa
        ? expandAndSyncTambasaCatalog(cfg.id).then((result) => result.scraper)
        : executarScraper(cfg.id);

      runPromise
        .then((result) => {
          logger.info(
            `[Scheduler] Scraper #${cfg.id}: ${result.success ? "sucesso" : "falhou"} (${result.productsScraped} produtos capturados).`,
          );
          if (!result.success) {
            const detalhe = result.errors?.length ? `\nErros: ${result.errors.slice(0, 3).join("; ")}` : "";
            void notifyJobFailure(
              "Falha na captura agendada — Sistema S2",
              `A captura do fornecedor ${result.supplierName || `(config #${cfg.id})`} falhou.${detalhe}`,
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

      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  } catch (err) {
    logger.error("[Scheduler] Falha ao verificar agendamentos de scraper:", (err as Error).message);
  }
}

export async function runBackupJob(): Promise<void> {
  const destDir = process.env.BACKUP_DIR || "backups";
  const keepRaw = await resolveCredential("BACKUP_KEEP_DAYS");
  const keepDays = Number(keepRaw) || DEFAULT_BACKUP_KEEP_DAYS;
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
      `O backup diário do banco falhou: ${result.error ?? "erro desconhecido"}. Verifique o servidor.`,
    );
  }
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

/**
 * Recria os agendamentos a partir da configuração efetiva (banco + fallback de
 * instalação). Pode ser chamado depois de salvar a Central de Integrações, sem
 * restart e sem alterar secrets no GitHub.
 */
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
    const expr = config.EMAIL_SYNC_CRON || DEFAULT_EMAIL_SYNC_CRON;
    if (addTask(expr, async () => {
      if (!(await isImapConfigured())) return;
      await runEmailSync();
    })) logger.info(`[Scheduler] Sincronização de cotações por e-mail agendada (${expr}).`);
    else logger.warn(`[Scheduler] EMAIL_SYNC_CRON inválido: "${expr}".`);
  }

  if (enabled(config.PORTAL_OPPORTUNITY_SYNC_ENABLED, true)) {
    const expr = config.PORTAL_OPPORTUNITY_SYNC_CRON || DEFAULT_PORTAL_OPPORTUNITY_SYNC_CRON;
    if (addTask(expr, runPortalOpportunitySync, SCRAPER_TIMEZONE)) {
      logger.info(`[Scheduler] Radar de portais agendado (${expr}, horário de Brasília).`);
    } else logger.warn(`[Scheduler] PORTAL_OPPORTUNITY_SYNC_CRON inválido: "${expr}".`);
  }

  if (enabled(config.ALERTS_ENABLED, true)) {
    const expr = config.ALERTS_CRON || DEFAULT_ALERTS_CRON;
    if (addTask(expr, runDailyAlerts)) logger.info(`[Scheduler] Alertas diários agendados (${expr}).`);
    else logger.warn(`[Scheduler] ALERTS_CRON inválido: "${expr}".`);
  }

  if (enabled(config.SCRAPER_SCHEDULE_ENABLED, true)) {
    const expr = config.SCRAPER_SCHEDULE_CRON || DEFAULT_SCRAPER_SCHEDULE_CRON;
    if (addTask(expr, runScheduledScrapers, SCRAPER_TIMEZONE)) {
      logger.info(`[Scheduler] Captura de fornecedores agendada (${expr}, horário de Brasília).`);
    } else logger.warn(`[Scheduler] SCRAPER_SCHEDULE_CRON inválido: "${expr}".`);
  }

  if (enabled(config.BACKUP_ENABLED, true)) {
    const expr = config.BACKUP_CRON || DEFAULT_BACKUP_CRON;
    if (addTask(expr, runBackupJob)) logger.info(`[Scheduler] Backup automático agendado (${expr}).`);
    else logger.warn(`[Scheduler] BACKUP_CRON inválido: "${expr}".`);
  }
}

/** Registra os jobs recorrentes. Chamado uma vez no boot. */
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
