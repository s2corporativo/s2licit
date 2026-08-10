import {
  bigint,
  index,
  int,
  longtext,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Cache persistente de integrações públicas.
 *
 * O payload é guardado por operação/chave com proveniência explícita. Nenhuma
 * credencial ou header é persistido aqui; URLs sensíveis continuam redigidas no
 * api_logs. A tabela também permite stale-if-error controlado sem Redis.
 */
export const integrationCache = mysqlTable(
  "integration_cache",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    source: varchar("source", { length: 64 }).notNull(),
    operation: varchar("operation", { length: 128 }).notNull(),
    cacheKey: varchar("cache_key", { length: 191 }).notNull(),
    sourceUrl: varchar("source_url", { length: 2048 }),
    connectorVersion: varchar("connector_version", { length: 64 }),
    schemaVersion: varchar("schema_version", { length: 64 }),
    statusCode: int("status_code").notNull().default(200),
    contentType: varchar("content_type", { length: 128 }),
    etag: varchar("etag", { length: 512 }),
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
    payload: longtext("payload").notNull(),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    lastAccessedAt: timestamp("last_accessed_at").notNull().defaultNow(),
    accessCount: int("access_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    sourceOperationKey: uniqueIndex("uq_integration_cache_source_operation_key").on(
      table.source,
      table.operation,
      table.cacheKey,
    ),
    expiresAtIdx: index("idx_integration_cache_expires_at").on(table.expiresAt),
    sourceFetchedAtIdx: index("idx_integration_cache_source_fetched_at").on(
      table.source,
      table.fetchedAt,
    ),
  }),
);
