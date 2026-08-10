import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { integrationCache } from "../../../drizzle/integrationSchema";
import { logger } from "../../_core/logger";
import { getDb } from "../../db";

const DEFAULT_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

export interface CachedIntegrationPayload<T = unknown> {
  source: string;
  operation: string;
  cacheKey: string;
  sourceUrl: string | null;
  connectorVersion: string | null;
  schemaVersion: string | null;
  statusCode: number;
  contentType: string | null;
  etag: string | null;
  payloadHash: string;
  payload: T;
  fetchedAt: Date;
  expiresAt: Date;
  fresh: boolean;
  ageMs: number;
}

interface CacheReadOptions {
  schemaVersion?: string;
  maxPayloadBytes?: number;
}

interface CacheWriteInput {
  source: string;
  operation: string;
  cacheKey: string;
  sourceUrl?: string | null;
  connectorVersion?: string | null;
  schemaVersion?: string | null;
  statusCode?: number;
  contentType?: string | null;
  etag?: string | null;
  payload: unknown;
  ttlMs: number;
  maxPayloadBytes?: number;
}

function payloadHash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function validateIdentity(source: string, operation: string, cacheKey: string): void {
  if (!source || source.length > 64) throw new Error("integration_cache.source inválido.");
  if (!operation || operation.length > 128) throw new Error("integration_cache.operation inválido.");
  if (!cacheKey || cacheKey.length > 191) throw new Error("integration_cache.cacheKey inválido.");
}

function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (!header || typeof header !== "object" || !("affectedRows" in header)) return 0;
  const value = Number((header as { affectedRows?: unknown }).affectedRows ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export async function getIntegrationCache<T = unknown>(
  source: string,
  operation: string,
  cacheKey: string,
  options: CacheReadOptions = {},
): Promise<CachedIntegrationPayload<T> | null> {
  validateIdentity(source, operation, cacheKey);
  const db = await getDb().catch(() => null);
  if (!db) return null;

  const [row] = await db
    .select()
    .from(integrationCache)
    .where(
      and(
        eq(integrationCache.source, source),
        eq(integrationCache.operation, operation),
        eq(integrationCache.cacheKey, cacheKey),
      ),
    )
    .limit(1)
    .catch(() => []);
  if (!row) return null;
  if (options.schemaVersion && row.schemaVersion !== options.schemaVersion) return null;

  const maxBytes = Math.max(1_024, options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES);
  if (Buffer.byteLength(row.payload, "utf8") > maxBytes) {
    logger.warn(`[IntegrationCache] Payload acima do limite descartado: ${source}/${operation}/${cacheKey}.`);
    void db.delete(integrationCache).where(eq(integrationCache.id, row.id)).catch(() => undefined);
    return null;
  }
  if (payloadHash(row.payload) !== row.payloadHash) {
    logger.warn(`[IntegrationCache] Hash divergente; entrada corrompida descartada: ${source}/${operation}/${cacheKey}.`);
    void db.delete(integrationCache).where(eq(integrationCache.id, row.id)).catch(() => undefined);
    return null;
  }

  let payload: T;
  try {
    payload = JSON.parse(row.payload) as T;
  } catch {
    logger.warn(`[IntegrationCache] JSON inválido; entrada descartada: ${source}/${operation}/${cacheKey}.`);
    void db.delete(integrationCache).where(eq(integrationCache.id, row.id)).catch(() => undefined);
    return null;
  }

  const now = Date.now();
  const fetchedAt = new Date(row.fetchedAt);
  const expiresAt = new Date(row.expiresAt);
  void db
    .update(integrationCache)
    .set({
      lastAccessedAt: new Date(),
      accessCount: sql`${integrationCache.accessCount} + 1`,
    })
    .where(eq(integrationCache.id, row.id))
    .catch(() => undefined);

  return {
    source: row.source,
    operation: row.operation,
    cacheKey: row.cacheKey,
    sourceUrl: row.sourceUrl,
    connectorVersion: row.connectorVersion,
    schemaVersion: row.schemaVersion,
    statusCode: row.statusCode,
    contentType: row.contentType,
    etag: row.etag,
    payloadHash: row.payloadHash,
    payload,
    fetchedAt,
    expiresAt,
    fresh: expiresAt.getTime() > now,
    ageMs: Math.max(0, now - fetchedAt.getTime()),
  };
}

/**
 * Persiste somente payloads JSON pequenos e idempotentes. O hash é calculado
 * internamente para impedir proveniência inconsistente. Falha de cache não
 * derruba a integração principal, mas é registrada no log da aplicação.
 */
export async function putIntegrationCache(input: CacheWriteInput): Promise<boolean> {
  validateIdentity(input.source, input.operation, input.cacheKey);
  const serialized = JSON.stringify(input.payload);
  const maxBytes = Math.max(1_024, input.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES);
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > maxBytes) {
    logger.warn(`[IntegrationCache] Payload não armazenado: ${bytes} bytes excedem o limite de ${maxBytes}.`);
    return false;
  }

  const db = await getDb().catch(() => null);
  if (!db) return false;
  const now = new Date();
  const expiresAt = new Date(Date.now() + Math.max(1_000, input.ttlMs));
  const values = {
    source: input.source,
    operation: input.operation,
    cacheKey: input.cacheKey,
    sourceUrl: input.sourceUrl ?? null,
    connectorVersion: input.connectorVersion ?? null,
    schemaVersion: input.schemaVersion ?? null,
    statusCode: input.statusCode ?? 200,
    contentType: input.contentType ?? null,
    etag: input.etag ?? null,
    payloadHash: payloadHash(serialized),
    payload: serialized,
    fetchedAt: now,
    expiresAt,
    lastAccessedAt: now,
    accessCount: 0,
  };

  try {
    await db.insert(integrationCache).values(values).onDuplicateKeyUpdate({ set: values });
    return true;
  } catch (error) {
    logger.warn("[IntegrationCache] Falha ao persistir cache; operação principal seguirá sem cache.", {
      source: input.source,
      operation: input.operation,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function purgeExpiredIntegrationCache(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const db = await getDb().catch(() => null);
  if (!db) return 0;
  const cutoff = new Date(Date.now() - Math.max(0, olderThanMs));
  try {
    const result = await db.delete(integrationCache).where(lt(integrationCache.expiresAt, cutoff));
    return affectedRows(result);
  } catch (error) {
    logger.warn("[IntegrationCache] Falha ao purgar entradas expiradas.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}
