import { gte } from "drizzle-orm";
import { captureLogs, suppliers } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * Compatibilidade do antigo monitor de captura.
 *
 * O agendador anterior apenas simulava execuções e foi desativado. Mantemos
 * somente leitura de saúde para clientes antigos, sem criar jobs fictícios.
 */
export function stopScheduledCapture(_supplierId: number): void {
  // Não há agendamentos legados ativos neste processo.
}

export function getSchedulerStatus(): Array<{
  supplierId: number;
  isRunning: boolean;
  jobId: string;
}> {
  return [];
}

export async function monitorCaptureHealth(): Promise<{
  totalSuppliers: number;
  activeSchedules: number;
  failedCapturesLast24h: number;
  averageDuration: number;
  successRate: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [allSuppliers, recentLogs] = await Promise.all([
    db.select({ id: suppliers.id }).from(suppliers),
    db.select().from(captureLogs).where(gte(captureLogs.createdAt, last24h)),
  ]);

  const completed = recentLogs.filter(log => log.status === "completed");
  const failed = recentLogs.filter(log => log.status === "failed");
  const durations = completed
    .map(log => log.durationSeconds)
    .filter((duration): duration is number => typeof duration === "number");
  const averageDuration = durations.length
    ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
    : 0;
  const successRate = recentLogs.length
    ? `${((completed.length / recentLogs.length) * 100).toFixed(2)}%`
    : "N/A";

  return {
    totalSuppliers: allSuppliers.length,
    activeSchedules: 0,
    failedCapturesLast24h: failed.length,
    averageDuration,
    successRate,
  };
}
