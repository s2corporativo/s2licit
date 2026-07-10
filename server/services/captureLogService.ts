import { getDb } from "../db";
import { captureLogs, captureErrors } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export interface CaptureLogEntry {
  supplierId: number;
  totalPages?: number;
  totalProductsFound?: number;
  newProductsCreated?: number;
  productsUpdated?: number;
  productsWithErrors?: number;
  productsIgnored?: number;
  status: "running" | "completed" | "failed" | "partial";
  errorMessage?: string;
}

export interface CaptureErrorEntry {
  captureLogId: number;
  supplierId: number;
  pageUrl?: string;
  pageNumber?: number;
  productName?: string;
  errorType: string;
  errorMessage: string;
  failureStage?: string;
  htmlSnapshot?: string;
  stackTrace?: string;
  canReprocess?: boolean;
}

/**
 * Cria novo log de captura
 */
export async function createCaptureLog(
  supplierId: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const result = await db.insert(captureLogs).values({
    supplierId,
    startedAt: new Date(),
    status: "running",
  });

  return Number((result as any).insertId || 0);
}

/**
 * Atualiza log de captura
 */
export async function updateCaptureLog(
  logId: number,
  updates: Partial<CaptureLogEntry>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const data: any = {};

  if (updates.totalPages !== undefined) data.totalPages = updates.totalPages;
  if (updates.totalProductsFound !== undefined)
    data.totalProductsFound = updates.totalProductsFound;
  if (updates.newProductsCreated !== undefined)
    data.newProductsCreated = updates.newProductsCreated;
  if (updates.productsUpdated !== undefined)
    data.productsUpdated = updates.productsUpdated;
  if (updates.productsWithErrors !== undefined)
    data.productsWithErrors = updates.productsWithErrors;
  if (updates.productsIgnored !== undefined)
    data.productsIgnored = updates.productsIgnored;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.errorMessage !== undefined)
    data.errorMessage = updates.errorMessage;

  if (updates.status === "completed" || updates.status === "failed") {
    data.completedAt = new Date();
    data.durationSeconds = Math.floor(
      (new Date().getTime() - new Date().getTime()) / 1000
    );
  }

  await db.update(captureLogs).set(data).where(eq(captureLogs.id, logId));
}

/**
 * Finaliza log de captura com estatísticas
 */
export async function finalizeCaptureLog(
  logId: number,
  stats: {
    totalPages: number;
    totalProductsFound: number;
    newProductsCreated: number;
    productsUpdated: number;
    productsWithErrors: number;
    productsIgnored: number;
  },
  status: "completed" | "failed" | "partial" = "completed",
  errorMessage?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const log = await db
    .select()
    .from(captureLogs)
    .where(eq(captureLogs.id, logId))
    .limit(1);

  if (log.length === 0) throw new Error("Log not found");

  const startedAt = log[0].startedAt;
  const durationSeconds = Math.floor(
    (new Date().getTime() - startedAt.getTime()) / 1000
  );

  await db
    .update(captureLogs)
    .set({
      ...stats,
      status,
      errorMessage: errorMessage || null,
      completedAt: new Date(),
      durationSeconds,
    })
    .where(eq(captureLogs.id, logId));
}

/**
 * Registra erro de captura
 */
export async function logCaptureError(
  error: CaptureErrorEntry
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.insert(captureErrors).values({
    captureLogId: error.captureLogId,
    supplierId: error.supplierId,
    pageUrl: error.pageUrl || null,
    pageNumber: error.pageNumber || null,
    productName: error.productName || null,
    errorType: error.errorType,
    errorMessage: error.errorMessage,
    failureStage: error.failureStage || null,
    htmlSnapshot: error.htmlSnapshot || null,
    stackTrace: error.stackTrace || null,
    canReprocess: error.canReprocess !== false,
  });
}

/**
 * Recupera logs de captura de um fornecedor
 */
export async function getSupplierCaptureLogs(
  supplierId: number,
  limit: number = 20
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  return await db
    .select()
    .from(captureLogs)
    .where(eq(captureLogs.supplierId, supplierId))
    .orderBy(captureLogs.createdAt)
    .limit(limit);
}

/**
 * Recupera erros de um log de captura
 */
export async function getCaptureLogErrors(logId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  return await db
    .select()
    .from(captureErrors)
    .where(eq(captureErrors.captureLogId, logId));
}

/**
 * Gera relatório de captura
 */
export async function generateCaptureReport(logId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const log = await db
    .select()
    .from(captureLogs)
    .where(eq(captureLogs.id, logId))
    .limit(1);

  if (log.length === 0) throw new Error("Log not found");

  const errors = await getCaptureLogErrors(logId);

  const logEntry = log[0];

  return {
    logId,
    supplierId: logEntry.supplierId,
    startedAt: logEntry.startedAt,
    completedAt: logEntry.completedAt,
    durationSeconds: logEntry.durationSeconds,
    status: logEntry.status,
    statistics: {
      totalPages: logEntry.totalPages || 0,
      totalProductsFound: logEntry.totalProductsFound || 0,
      newProductsCreated: logEntry.newProductsCreated || 0,
      productsUpdated: logEntry.productsUpdated || 0,
      productsWithErrors: logEntry.productsWithErrors || 0,
      productsIgnored: logEntry.productsIgnored || 0,
      successRate:
        logEntry.totalProductsFound && logEntry.totalProductsFound > 0
          ? (
              ((logEntry.totalProductsFound -
                (logEntry.productsWithErrors || 0)) /
                logEntry.totalProductsFound) *
              100
            ).toFixed(2)
          : "N/A",
    },
    errors: errors.map((e) => ({
      errorType: e.errorType,
      errorMessage: e.errorMessage,
      failureStage: e.failureStage,
      pageUrl: e.pageUrl,
      productName: e.productName,
      canReprocess: e.canReprocess,
    })),
    errorMessage: logEntry.errorMessage,
  };
}

/**
 * Recupera erros reprocessáveis
 */
export async function getReprocessableErrors(logId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  return await db
    .select()
    .from(captureErrors)
    .where(
      eq(captureErrors.captureLogId, logId)
    );
}

/**
 * Marca erro como reprocessado
 */
export async function markErrorAsReprocessed(errorId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db
    .update(captureErrors)
    .set({ reprocessedAt: new Date() })
    .where(eq(captureErrors.id, errorId));
}
