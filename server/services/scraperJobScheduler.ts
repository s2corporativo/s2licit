/**
 * scraperJobScheduler.ts
 * Agendador de jobs de scraping automático.
 * Usa scraperEngine.ts (Puppeteer universal) para executar os scrapers.
 */

import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { scraperConfigs } from "../../drizzle/schema";
import { executarScraper } from "./scraperEngine";

interface ScheduledJob {
  configId: number;
  timeout: NodeJS.Timeout | null;
}

const scheduledJobs = new Map<number, ScheduledJob>();

function getNextExecutionTime(scheduleTime: string): Date {
  const [hours, minutes] = scheduleTime.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

async function executeScraperJob(configId: number): Promise<void> {
  console.log(`[ScraperScheduler] Iniciando job #${configId}`);
  try {
    const result = await executarScraper(configId);
    console.log(`[ScraperScheduler] Job #${configId} concluído:`, {
      sucesso: result.success,
      raspados: result.productsScraped,
      atualizados: result.productsUpdated,
    });
  } catch (err: any) {
    console.error(`[ScraperScheduler] Erro no job #${configId}:`, err?.message);
  }
  // Reagendar para a próxima execução
  scheduleJob(configId);
}

async function scheduleJob(configId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const rows = await db.select({
    scheduleTime: scraperConfigs.scheduleTime,
    enabled: scraperConfigs.enabled,
  }).from(scraperConfigs).where(eq(scraperConfigs.id, configId)).limit(1);

  if (!rows[0] || rows[0].enabled !== "yes") return;

  const next = getNextExecutionTime(rows[0].scheduleTime || "02:00");
  const delay = next.getTime() - Date.now();

  const existing = scheduledJobs.get(configId);
  if (existing?.timeout) clearTimeout(existing.timeout);

  const timeout = setTimeout(() => executeScraperJob(configId), delay);
  scheduledJobs.set(configId, { configId, timeout });

  console.log(`[ScraperScheduler] Job #${configId} agendado para ${next.toLocaleString("pt-BR")}`);
}

/** Inicializa todos os scrapers habilitados ao subir o servidor */
export async function initializeScheduler(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const ativos = await db.select({ id: scraperConfigs.id })
    .from(scraperConfigs)
    .where(eq(scraperConfigs.enabled, "yes"));

  for (const { id } of ativos) {
    await scheduleJob(id);
  }

  console.log(`[ScraperScheduler] ${ativos.length} scrapers agendados`);
}

/** Agenda ou reagenda um scraper específico */
export async function scheduleScraperJob(configId: number): Promise<void> {
  await scheduleJob(configId);
}

/** Cancela o agendamento de um scraper */
export function cancelScraperJob(configId: number): void {
  const job = scheduledJobs.get(configId);
  if (job?.timeout) {
    clearTimeout(job.timeout);
    scheduledJobs.delete(configId);
    console.log(`[ScraperScheduler] Job #${configId} cancelado`);
  }
}

/** Retorna status dos jobs agendados */
export function getSchedulerStatus(): { configId: number; agendado: boolean }[] {
  return Array.from(scheduledJobs.entries()).map(([id, job]) => ({
    configId: id,
    agendado: !!job.timeout,
  }));
}
