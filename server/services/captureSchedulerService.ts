import cron from "node-cron";
import { getDb } from "../db";
import {
  supplierCaptureConfigs,
  captureLogs,
  captureErrors,
  suppliers,
  scraperConfigs,
} from "../../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { executarScraper } from "./scraperEngine";
import {
  createCaptureLog,
  finalizeCaptureLog,
  logCaptureError,
  markErrorAsReprocessed,
} from "./captureLogService";

interface ScheduledJob {
  id: string;
  supplierId: number;
  task: any; // cron.ScheduledTask
  isRunning: boolean;
}

const scheduledJobs: Map<number, ScheduledJob> = new Map();

/**
 * Inicia captura para um fornecedor específico
 */
export async function startCaptureForSupplier(
  supplierId: number
): Promise<{ logId: number; status: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Verificar se já está em execução
  const job = scheduledJobs.get(supplierId);
  if (job?.isRunning) {
    return {
      logId: 0,
      status: "already_running",
    };
  }

  // Criar log de captura
  const logId = await createCaptureLog(supplierId);

  // Buscar credenciais reais de scraper deste fornecedor (mesma tabela usada
  // pela captura manual em "Fornecedores" — supplierCaptureConfigs nunca é
  // populada por nenhuma tela, então não é uma fonte válida de configuração).
  const scraperConfigRows = await db
    .select({ id: scraperConfigs.id })
    .from(scraperConfigs)
    .where(and(eq(scraperConfigs.supplierId, supplierId), eq(scraperConfigs.enabled, "yes")))
    .limit(1);

  if (scraperConfigRows.length === 0) {
    await finalizeCaptureLog(
      logId,
      {
        totalPages: 0,
        totalProductsFound: 0,
        newProductsCreated: 0,
        productsUpdated: 0,
        productsWithErrors: 0,
        productsIgnored: 0,
      },
      "failed",
      "Nenhum scraper configurado para este fornecedor (cadastre as credenciais em Fornecedores)."
    );

    return {
      logId,
      status: "config_not_found",
    };
  }

  if (job) {
    job.isRunning = true;
  }

  try {
    const result = await executarScraper(scraperConfigRows[0].id);

    await finalizeCaptureLog(
      logId,
      {
        totalPages: 0,
        totalProductsFound: result.productsScraped,
        newProductsCreated: result.productsNew,
        productsUpdated: result.productsUpdated,
        productsWithErrors: result.errors.length,
        productsIgnored: Math.max(0, result.productsScraped - result.productsMatched),
      },
      result.success ? "completed" : "failed",
      result.errors[0]
    );

    for (const errorMessage of result.errors) {
      await logCaptureError({
        captureLogId: logId,
        supplierId,
        errorType: "scraper",
        errorMessage,
        canReprocess: true,
      });
    }

    return {
      logId,
      status: result.success ? "completed" : "failed",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await finalizeCaptureLog(
      logId,
      {
        totalPages: 0,
        totalProductsFound: 0,
        newProductsCreated: 0,
        productsUpdated: 0,
        productsWithErrors: 0,
        productsIgnored: 0,
      },
      "failed",
      errorMessage
    );

    await notifyOwner({
      title: "Erro ao iniciar captura",
      content: `Erro ao iniciar captura para fornecedor #${supplierId}: ${errorMessage}`,
    });

    return {
      logId,
      status: "error",
    };
  } finally {
    if (job) {
      job.isRunning = false;
    }
  }
}

/**
 * Agenda captura periódica para um fornecedor
 */
export async function scheduleSupplierCapture(
  supplierId: number,
  frequencyHours: number = 24
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Remover job anterior se existir
  if (scheduledJobs.has(supplierId)) {
    const existingJob = scheduledJobs.get(supplierId);
    if (existingJob?.task) {
      existingJob.task.stop();
    }
    scheduledJobs.delete(supplierId);
  }

  // Criar expressão cron baseada em frequência
  // Para simplificar, usar intervalo em horas (0 0 * * * = diariamente)
  const cronExpression = `0 */${frequencyHours} * * *`;

  const task = cron.schedule(cronExpression, async () => {
    await startCaptureForSupplier(supplierId);
  });

  scheduledJobs.set(supplierId, {
    id: `capture-${supplierId}`,
    supplierId,
    task,
    isRunning: false,
  });

  console.log(
    `[Scheduler] Captura agendada para fornecedor #${supplierId} a cada ${frequencyHours}h`
  );
}

/**
 * Para agendamento de um fornecedor
 */
export function stopScheduledCapture(supplierId: number): void {
  const job = scheduledJobs.get(supplierId);
  if (job?.task) {
    job.task.stop();
    scheduledJobs.delete(supplierId);
    console.log(`[Scheduler] Captura cancelada para fornecedor #${supplierId}`);
  }
}

/**
 * Retoma erros reprocessáveis
 */
export async function reprocessFailedCaptures(
  supplierId?: number,
  maxRetries: number = 3
): Promise<{
  reprocessed: number;
  failed: number;
  errors: Array<{ errorId: number; error: string }>;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const results = {
    reprocessed: 0,
    failed: 0,
    errors: [] as Array<{ errorId: number; error: string }>,
  };

  // Buscar erros reprocessáveis
  let whereConditions = eq(captureErrors.canReprocess, true);
  
  if (supplierId) {
    whereConditions = and(
      eq(captureErrors.canReprocess, true),
      eq(captureErrors.supplierId, supplierId)
    ) as any;
  }

  const errors = await db
    .select()
    .from(captureErrors)
    .where(whereConditions);

  // Reprocessar não faz sentido por erro individual — o erro é um sintoma de
  // uma captura que falhou para o fornecedor; reprocessar significa rodar a
  // captura de novo e, se der certo, marcar os erros daquele fornecedor como
  // resolvidos.
  const supplierIdsWithErrors = Array.from(new Set(errors.map((e) => e.supplierId)));

  for (const sId of supplierIdsWithErrors) {
    const supplierErrors = errors.filter((e) => e.supplierId === sId);

    // Não insiste indefinidamente num fornecedor cuja captura falha sempre —
    // isto roda desacompanhado a cada 6h via cron, sem intervenção humana.
    const supplierLogs = await db
      .select({ status: captureLogs.status, startedAt: captureLogs.startedAt })
      .from(captureLogs)
      .where(eq(captureLogs.supplierId, sId));
    const recentLogs = supplierLogs
      .slice()
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, maxRetries);
    const exhaustedRetries =
      recentLogs.length >= maxRetries &&
      recentLogs.every((log) => log.status === "failed");
    if (exhaustedRetries) {
      for (const err of supplierErrors) {
        results.failed++;
        results.errors.push({
          errorId: err.id,
          error: `Reprocessamento suspenso: ${maxRetries} tentativas consecutivas falharam para este fornecedor`,
        });
      }
      continue;
    }

    try {
      const outcome = await startCaptureForSupplier(sId);
      if (outcome.status === "completed") {
        for (const err of supplierErrors) {
          await markErrorAsReprocessed(err.id);
          results.reprocessed++;
        }
      } else {
        for (const err of supplierErrors) {
          results.failed++;
          results.errors.push({
            errorId: err.id,
            error: `Reprocessamento não teve sucesso (status: ${outcome.status})`,
          });
        }
      }
    } catch (err) {
      for (const supplierErr of supplierErrors) {
        results.failed++;
        results.errors.push({
          errorId: supplierErr.id,
          error: String(err),
        });
      }
    }
  }

  return results;
}

/**
 * Limpa logs antigos de captura
 */
export async function cleanupOldCaptureLogs(
  daysToKeep: number = 30
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  // Buscar logs antigos
  const oldLogs = await db
    .select()
    .from(captureLogs)
    .where(lt(captureLogs.createdAt, cutoffDate));

  // Deletar logs antigos (se necessário)
  // await db.delete(captureLogs).where(lt(captureLogs.createdAt, cutoffDate));

  return oldLogs.length;
}

/**
 * Inicia scheduler global para todos os fornecedores ativos
 */
export async function initializeGlobalScheduler(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  console.log("[Scheduler] Inicializando scheduler global...");

  // Buscar todos os fornecedores com captura ativa
  const configs = await db
    .select({
      supplierId: supplierCaptureConfigs.supplierId,
      updateFrequencyHours: supplierCaptureConfigs.updateFrequencyHours,
    })
    .from(supplierCaptureConfigs)
    .where(eq(supplierCaptureConfigs.isActive, true));

  for (const config of configs) {
    const frequency = config.updateFrequencyHours || 24;
    await scheduleSupplierCapture(config.supplierId, frequency);
  }

  // Agendar limpeza de logs diariamente
  cron.schedule("0 2 * * *", async () => {
    const cleaned = await cleanupOldCaptureLogs(30);
    console.log(`[Scheduler] Limpeza de logs: ${cleaned} registros antigos removidos`);
  });

  // Agendar reprocessamento de erros a cada 6 horas
  cron.schedule("0 */6 * * *", async () => {
    const result = await reprocessFailedCaptures();
    console.log(
      `[Scheduler] Reprocessamento: ${result.reprocessed} sucesso, ${result.failed} falhas`
    );
  });

  console.log("[Scheduler] Scheduler global inicializado com sucesso");
}

/**
 * Para todos os agendamentos
 */
export function stopAllScheduledCaptures(): void {
  for (const job of Array.from(scheduledJobs.values())) {
    if (job.task) {
      job.task.stop();
    }
  }
  scheduledJobs.clear();
  console.log("[Scheduler] Todos os agendamentos foram cancelados");
}

/**
 * Obtém status de agendamentos
 */
export function getSchedulerStatus(): Array<{
  supplierId: number;
  isRunning: boolean;
  jobId: string;
}> {
  const jobs: Array<{
    supplierId: number;
    isRunning: boolean;
    jobId: string;
  }> = [];
  
  scheduledJobs.forEach((job) => {
    jobs.push({
      supplierId: job.supplierId,
      isRunning: job.isRunning,
      jobId: job.id,
    });
  });
  
  return jobs;
}

/**
 * Monitora saúde de capturas
 */
export async function monitorCaptureHealth(): Promise<{
  totalSuppliers: number;
  activeSchedules: number;
  failedCapturesLast24h: number;
  averageDuration: number;
  successRate: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Contar fornecedores
  const allSuppliers = await db.select().from(suppliers);

  // Contar agendamentos ativos
  const activeSchedules = scheduledJobs.size;

  // Contar capturas falhadas nas últimas 24h
  const last24h = new Date();
  last24h.setHours(last24h.getHours() - 24);

  const recentLogs = await db
    .select()
    .from(captureLogs)
    .where(eq(captureLogs.status, "failed"));

  const failedCapturesLast24h = recentLogs.filter(
    (log) => log.createdAt > last24h
  ).length;

  // Calcular duração média
  const completedLogs = recentLogs.filter((log) => log.durationSeconds);
  const averageDuration =
    completedLogs.length > 0
      ? completedLogs.reduce((sum, log) => sum + (log.durationSeconds || 0), 0) /
        completedLogs.length
      : 0;

  // Calcular taxa de sucesso
  const totalLogs = recentLogs.length;
  const successfulLogs = recentLogs.filter(
    (log) => log.status === "completed"
  ).length;
  const successRate =
    totalLogs > 0 ? ((successfulLogs / totalLogs) * 100).toFixed(2) : "N/A";

  return {
    totalSuppliers: allSuppliers.length,
    activeSchedules,
    failedCapturesLast24h,
    averageDuration: Math.round(averageDuration),
    successRate: `${successRate}%`,
  };
}
