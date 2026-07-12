import { getDb } from "../db";
import {
  captureLogs,
  captureErrors,
  supplierCaptureConfigs,
} from "../../drizzle/schema";
import { eq, gte, lte, and } from "drizzle-orm";

/**
 * Interface para estatísticas de captura
 */
export interface CaptureStats {
  totalCaptures: number;
  successfulCaptures: number;
  failedCaptures: number;
  successRate: number;
  averageDuration: number;
  totalProductsCaptured: number;
  totalProductsEnriched: number;
  totalProductsApproved: number;
  totalProductsRejected: number;
}

/**
 * Interface para dados de supplier
 */
export interface SupplierCaptureMetrics {
  supplierId: number;
  supplierName: string;
  totalCaptures: number;
  successfulCaptures: number;
  failedCaptures: number;
  successRate: number;
  lastCaptureAt?: Date;
  averageDuration: number;
  totalProductsCaptured: number;
  errorCount: number;
}

/**
 * Interface para histórico de captura
 */
export interface CaptureHistoryEntry {
  id: number;
  supplierId: number;
  startedAt: Date;
  completedAt?: Date;
  status: "running" | "success" | "failed";
  productsCaptured: number;
  productsEnriched: number;

  duration?: number;
  errorMessage?: string;
}

/**
 * Interface para tendência de preço
 */
export interface PriceTrend {
  productId: string;
  productName: string;
  currentPrice: number;
  previousPrice?: number;
  priceChange: number;
  priceChangePercent: number;
  trend: "up" | "down" | "stable";
  lastUpdated: Date;
}

/**
 * Obtém estatísticas gerais de captura
 */
export async function getCaptureStats(
  startDate?: Date,
  endDate?: Date
): Promise<CaptureStats> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select().from(captureLogs);

  if (startDate && endDate) {
    query = query.where(
      and(gte(captureLogs.startedAt, startDate), lte(captureLogs.startedAt, endDate))
    ) as any;
  }

  const logs = await query;

  const successful = logs.filter((l) => l.status === "completed").length;
  const failed = logs.filter((l) => l.status === "failed").length;
  const total = logs.length;

  const durations = logs
    .filter((l) => l.completedAt)
    .map((l) => {
      const start = new Date(l.startedAt).getTime();
      const end = new Date(l.completedAt!).getTime();
      return (end - start) / 1000; // em segundos
    });

  const avgDuration =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

  const totalProductsCaptured = logs.reduce(
    (sum, l) => sum + (l.totalProductsFound || 0),
    0
  );
  const totalEnriched = 0; // Campo não existe no schema
  const totalApproved = 0; // Campo não existe no schema
  const totalRejected = 0; // Campo não existe no schema

  return {
    totalCaptures: total,
    successfulCaptures: successful,
    failedCaptures: failed,
    successRate: total > 0 ? (successful / total) * 100 : 0,
    averageDuration: avgDuration,
    totalProductsCaptured,
    totalProductsEnriched: totalEnriched,
    totalProductsApproved: totalApproved,
    totalProductsRejected: totalRejected,
  };
}

/**
 * Obtém métricas por fornecedor
 */
export async function getSupplierMetrics(
  supplierId?: number,
  limit: number = 10
): Promise<SupplierCaptureMetrics[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select().from(captureLogs);

  if (supplierId) {
    query = query.where(eq(captureLogs.supplierId, supplierId)) as any;
  }

  const logs = await query;

  // Agrupar por supplier
  const bySupplier = new Map<number, typeof logs>();

  for (const log of logs) {
    if (!bySupplier.has(log.supplierId)) {
      bySupplier.set(log.supplierId, []);
    }
    bySupplier.get(log.supplierId)!.push(log);
  }

  // Calcular métricas
  const metrics: SupplierCaptureMetrics[] = [];

  for (const [sid, supplierLogs] of bySupplier.entries()) {
    const successful = supplierLogs.filter((l) => l.status === "completed").length;
    const failed = supplierLogs.filter((l) => l.status === "failed").length;
    const total = supplierLogs.length;

    const durations = supplierLogs
      .filter((l) => l.completedAt)
      .map((l) => {
        const start = new Date(l.startedAt).getTime();
        const end = new Date(l.completedAt!).getTime();
        return (end - start) / 1000;
      });

    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    const lastCapture = supplierLogs.reduce((latest, log) => {
      return new Date(log.startedAt) > new Date(latest.startedAt)
        ? log
        : latest;
    });

    // Buscar nome do fornecedor
    const config = await db
      .select()
      .from(supplierCaptureConfigs)
      .where(eq(supplierCaptureConfigs.supplierId, sid))
      .limit(1);

    const supplierName = config[0]?.baseUrl || `Fornecedor #${sid}`;

    // Contar erros
    const errors = await db
      .select()
      .from(captureErrors)
      .where(eq(captureErrors.supplierId, sid));

    metrics.push({
      supplierId: sid,
      supplierName,
      totalCaptures: total,
      successfulCaptures: successful,
      failedCaptures: failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      lastCaptureAt: lastCapture.completedAt || lastCapture.startedAt,
      averageDuration: avgDuration,
      totalProductsCaptured: supplierLogs.reduce(
        (sum, l) => sum + (l.totalProductsFound || 0),
        0
      ),
      errorCount: errors.length,
    });
  }

  return metrics.sort((a, b) => b.totalCaptures - a.totalCaptures).slice(0, limit);
}

/**
 * Obtém histórico de capturas
 */
export async function getCaptureHistory(
  supplierId?: number,
  limit: number = 50
): Promise<CaptureHistoryEntry[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select().from(captureLogs);

  if (supplierId) {
    query = query.where(eq(captureLogs.supplierId, supplierId)) as any;
  }

  const logs = await query;

  return logs
    .slice(0, limit)
    .map((log) => ({
      id: log.id,
      supplierId: log.supplierId,
      startedAt: log.startedAt,
      completedAt: log.completedAt || undefined,
      status: (log.status as "running" | "success" | "failed") || "running",
      productsCaptured: log.totalProductsFound || 0,
      productsEnriched: 0,

      duration: log.completedAt
        ? (new Date(log.completedAt).getTime() -
            new Date(log.startedAt).getTime()) /
          1000
        : undefined,
      errorMessage: log.errorMessage || undefined,
    }));
}

/**
 * Obtém produtos mais alterados
 */
export async function getMostChangedProducts(
  limit: number = 20
): Promise<
  Array<{
    productId: string;
    productName: string;
    changeCount: number;
    lastChanged: Date;
  }>
> {
  // TODO: Implementar com base em histórico de mudanças de produtos
  // Por enquanto, retornar array vazio
  return [];
}

/**
 * Obtém tendências de preço
 */
export async function getPriceTrends(
  limit: number = 20
): Promise<PriceTrend[]> {
  // TODO: Implementar com base em histórico de preços
  // Por enquanto, retornar array vazio
  return [];
}

/**
 * Calcula taxa de sucesso por período
 */
export async function getSuccessRateByPeriod(
  periodDays: number = 7
): Promise<
  Array<{
    date: string;
    successRate: number;
    totalCaptures: number;
    successfulCaptures: number;
  }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const now = new Date();
  const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  let query = db.select().from(captureLogs);
  query = query.where(gte(captureLogs.startedAt, startDate)) as any;

  const logs = await query;

  // Agrupar por dia
  const byDate = new Map<string, typeof logs>();

  for (const log of logs) {
    const date = new Date(log.startedAt).toISOString().split("T")[0];
    if (!byDate.has(date)) {
      byDate.set(date, []);
    }
    byDate.get(date)!.push(log);
  }

  // Calcular taxa por dia
  const result: Array<{
    date: string;
    successRate: number;
    totalCaptures: number;
    successfulCaptures: number;
  }> = [];

  for (const [date, dayLogs] of Array.from(byDate.entries())) {
    const successful = dayLogs.filter((l: any) => l.status === "completed").length;
    const total = dayLogs.length;

    result.push({
      date,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      totalCaptures: total,
      successfulCaptures: successful,
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Obtém distribuição de status
 */
export async function getStatusDistribution(): Promise<{
  success: number;
  failed: number;
  running: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const logs = await db.select().from(captureLogs);

  return {
    success: logs.filter((l) => l.status === "completed").length,
    failed: logs.filter((l) => l.status === "failed").length,
    running: logs.filter((l) => l.status === "running").length,
  };
}
