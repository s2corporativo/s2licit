import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { products, scraperConfigs, suppliers, users } from "./schema";

/**
 * Fila persistente de captura.
 *
 * Substitui os Maps/Sets em memória usados para saber se um scraper está
 * executando. O job sobrevive a restart do processo e serve simultaneamente
 * como fila, status em tempo real, heartbeat, histórico e base de métricas.
 */
export const captureJobs = mysqlTable(
  "capture_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    scraperConfigId: int("scraperConfigId")
      .notNull()
      .references(() => scraperConfigs.id, { onDelete: "cascade" }),
    supplierId: int("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    mode: mysqlEnum("mode", ["search", "refresh", "full"]).default("full").notNull(),
    trigger: mysqlEnum("trigger", ["manual", "scheduled", "bulk", "proposal", "api"])
      .default("manual")
      .notNull(),
    status: mysqlEnum("status", [
      "queued",
      "running",
      "success",
      "partial",
      "failed",
      "quarantine",
      "cancelled",
    ]).default("queued").notNull(),
    priority: int("priority").default(50).notNull(),
    query: varchar("query", { length: 512 }),
    progressStage: varchar("progressStage", { length: 64 }),
    progressMessage: text("progressMessage"),
    expectedItems: int("expectedItems"),
    capturedItems: int("capturedItems").default(0).notNull(),
    matchedItems: int("matchedItems").default(0).notNull(),
    changedItems: int("changedItems").default(0).notNull(),
    createdItems: int("createdItems").default(0).notNull(),
    reviewItems: int("reviewItems").default(0).notNull(),
    errorItems: int("errorItems").default(0).notNull(),
    qualityScore: decimal("qualityScore", { precision: 6, scale: 2 }),
    attempts: int("attempts").default(0).notNull(),
    maxAttempts: int("maxAttempts").default(3).notNull(),
    runAfter: timestamp("runAfter").defaultNow().notNull(),
    workerId: varchar("workerId", { length: 128 }),
    heartbeatAt: timestamp("heartbeatAt"),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    errorMessage: text("errorMessage"),
    evidenceUrl: text("evidenceUrl"),
    meta: json("meta").$type<Record<string, unknown>>(),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index("idx_capture_jobs_queue").on(table.status, table.runAfter, table.priority),
    index("idx_capture_jobs_config").on(table.scraperConfigId, table.createdAt),
    index("idx_capture_jobs_supplier").on(table.supplierId, table.createdAt),
    index("idx_capture_jobs_heartbeat").on(table.status, table.heartbeatAt),
  ],
);

/**
 * Evidência bruta imutável de cada preço/estoque observado no fornecedor.
 * A observação é separada da oferta atual para permitir auditoria, reprocesso,
 * detecção de anomalia e evolução do matching sem precisar raspar novamente.
 */
export const supplierProductObservations = mysqlTable(
  "supplier_product_observations",
  {
    id: int("id").autoincrement().primaryKey(),
    captureJobId: int("captureJobId")
      .notNull()
      .references(() => captureJobs.id, { onDelete: "cascade" }),
    scraperConfigId: int("scraperConfigId")
      .notNull()
      .references(() => scraperConfigs.id, { onDelete: "cascade" }),
    supplierId: int("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    productId: int("productId").references(() => products.id, { onDelete: "set null" }),
    supplierSku: varchar("supplierSku", { length: 128 }),
    ean: varchar("ean", { length: 64 }),
    rawName: varchar("rawName", { length: 512 }).notNull(),
    normalizedName: varchar("normalizedName", { length: 512 }).notNull(),
    rawPrice: varchar("rawPrice", { length: 128 }),
    price: decimal("price", { precision: 14, scale: 4 }),
    normalPrice: decimal("normalPrice", { precision: 14, scale: 4 }),
    promoPrice: decimal("promoPrice", { precision: 14, scale: 4 }),
    stock: int("stock"),
    availability: mysqlEnum("availability", [
      "in_stock",
      "out_of_stock",
      "limited",
      "backorder",
      "unknown",
    ]).default("unknown").notNull(),
    productUrl: text("productUrl"),
    imageUrl: text("imageUrl"),
    sourceType: mysqlEnum("sourceType", ["api", "http", "browser", "structured"])
      .default("browser")
      .notNull(),
    sourceUrl: text("sourceUrl"),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    confidence: decimal("confidence", { precision: 5, scale: 2 }).default("0").notNull(),
    action: mysqlEnum("action", ["no_change", "update", "create", "review", "blocked"])
      .default("review")
      .notNull(),
    reason: text("reason"),
    rawPayload: json("rawPayload").$type<Record<string, unknown>>(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_observations_job").on(table.captureJobId),
    index("idx_observations_supplier_sku").on(table.supplierId, table.supplierSku),
    index("idx_observations_ean").on(table.ean),
    index("idx_observations_product").on(table.productId, table.capturedAt),
    index("idx_observations_hash").on(table.supplierId, table.contentHash),
  ],
);

/**
 * Eventos pequenos do job substituem o log em memória e alimentam a UI.
 */
export const captureJobEvents = mysqlTable(
  "capture_job_events",
  {
    id: int("id").autoincrement().primaryKey(),
    captureJobId: int("captureJobId")
      .notNull()
      .references(() => captureJobs.id, { onDelete: "cascade" }),
    level: mysqlEnum("level", ["info", "warning", "error"]).default("info").notNull(),
    stage: varchar("stage", { length: 64 }),
    message: text("message").notNull(),
    data: json("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("idx_capture_job_events_job").on(table.captureJobId, table.createdAt)],
);

/**
 * Memória supervisionada da IA de captura. Cada decisão humana reaproveitável
 * vira um exemplo local de few-shot; nenhuma informação precisa sair do banco
 * para "treinar" o comportamento do módulo entre execuções.
 */
export const captureAiFeedback = mysqlTable(
  "capture_ai_feedback",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierId: int("supplierId").references(() => suppliers.id, { onDelete: "cascade" }),
    observationId: int("observationId").references(() => supplierProductObservations.id, {
      onDelete: "set null",
    }),
    decision: mysqlEnum("decision", [
      "correct_match",
      "wrong_match",
      "approve_update",
      "reject_update",
      "correct_normalization",
      "false_anomaly",
      "true_anomaly",
    ]).notNull(),
    observedName: varchar("observedName", { length: 512 }),
    expectedProductId: int("expectedProductId").references(() => products.id, { onDelete: "set null" }),
    expectedNormalizedName: varchar("expectedNormalizedName", { length: 512 }),
    notes: text("notes"),
    reusable: boolean("reusable").default(true).notNull(),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("idx_capture_ai_feedback_supplier").on(table.supplierId, table.createdAt),
    index("idx_capture_ai_feedback_observation").on(table.observationId),
  ],
);

/**
 * Um snapshot de saúde por configuração evita recalcular toda a série histórica
 * a cada card da interface e permite bloqueio automático de uma captura ruim.
 */
export const captureConnectorHealth = mysqlTable(
  "capture_connector_health",
  {
    id: int("id").autoincrement().primaryKey(),
    scraperConfigId: int("scraperConfigId")
      .notNull()
      .references(() => scraperConfigs.id, { onDelete: "cascade" }),
    supplierId: int("supplierId")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["healthy", "attention", "login_required", "degraded", "unknown"])
      .default("unknown")
      .notNull(),
    score: decimal("score", { precision: 5, scale: 2 }).default("0").notNull(),
    baselineItems: int("baselineItems"),
    lastCapturedItems: int("lastCapturedItems"),
    consecutiveFailures: int("consecutiveFailures").default(0).notNull(),
    lastSuccessAt: timestamp("lastSuccessAt"),
    lastFailureAt: timestamp("lastFailureAt"),
    lastError: text("lastError"),
    capabilities: json("capabilities").$type<Record<string, unknown>>(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_capture_connector_health_config").on(table.scraperConfigId),
    index("idx_capture_connector_health_status").on(table.status, table.score),
  ],
);

export type CaptureJob = typeof captureJobs.$inferSelect;
export type InsertCaptureJob = typeof captureJobs.$inferInsert;
export type SupplierProductObservation = typeof supplierProductObservations.$inferSelect;
export type InsertSupplierProductObservation = typeof supplierProductObservations.$inferInsert;
