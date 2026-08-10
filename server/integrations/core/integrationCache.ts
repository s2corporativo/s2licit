import { and, eq, lt, sql } from "drizzle-orm";
import { integrationCache } from "../../../drizzle/integrationSchema";
import { getDb } from "../../db";

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

export async function getIntegrationCache<T = unknown>(
  source: string,
  operation: string,
  cacheKey: string,
): Promise<CachedIntegrationPayload<T> | null> {
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

  let payload: T;
  try {
    payload = JSON.parse(row.payload) as T;
  } catch {
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

export async function putIntegrationCache(input: {
  source: string;
  operation: string;
  cacheKey: string;
  sourceUrl?: string | null;
  connectorVersion?: string | null;
  schemaVersion?: string | null;
  statusCode?: number;
  contentType?: string | null;
  etag?: string | null;
  payloadHash: string;
  payload: unknown;
  ttlMs: number;
}): Promise<void> {
  const db = await getDb().catch(() => null);
  if (!db) return;
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
    payloadHash: input.payloadHash,
    payload: JSON.stringify(input.payload),
    fetchedAt: now,
    expiresAt,
    lastAccessedAt: now,
    accessCount: 0,
  };
  await db
    .insert(integrationCache)
    .values(values)
    .onDuplicateKeyUpdate({ set: values })
    .catch(() => undefined);
}

export async function purgeExpiredIntegrationCache(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const db = await getDb().catch(() => null);
  if (!db) return 0;
  const cutoff = new Date(Date.now() - Math.max(0, olderThanMs));
  try {
    const result = await db.delete(integrationCache).where(lt(integrationCache.expiresAt, cutoff));
    return Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0);
  } catch {
    return 0;
  }
}
