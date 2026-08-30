import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  capturedProductBatches,
  capturedProducts,
  products,
} from "../../drizzle/schema";
import { logger } from "../_core/logger";

const reviewStatus = z.enum(["pending", "approved", "rejected", "applied"]);
const sourceType = z.enum(["url", "html", "pdf", "spreadsheet", "xml", "docx", "text", "image"]);

async function syncBatchCounters(batchIds: number[]) {
  const db = await getDb();
  if (!db || batchIds.length === 0) return;

  for (const batchId of [...new Set(batchIds)]) {
    const rows = await db
      .select({ status: capturedProducts.status, total: count() })
      .from(capturedProducts)
      .where(eq(capturedProducts.batchId, batchId))
      .groupBy(capturedProducts.status);

    const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
    const approved = Number(rows.find((row) => row.status === "approved")?.total ?? 0);
    const rejected = Number(rows.find((row) => row.status === "rejected")?.total ?? 0);
    const applied = Number(rows.find((row) => row.status === "applied")?.total ?? 0);
    const pending = Number(rows.find((row) => row.status === "pending")?.total ?? 0);

    let status: "review" | "approved" | "rejected" | "applied" = "review";
    if (total > 0 && applied === total) status = "applied";
    else if (total > 0 && rejected === total) status = "rejected";
    else if (pending === 0 && approved + applied + rejected === total) status = "approved";

    await db
      .update(capturedProductBatches)
      .set({ totalApproved: approved + applied, totalRejected: rejected, status })
      .where(eq(capturedProductBatches.id, batchId));
  }
}

async function getBatchIdsForItems(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [] as number[];
  const rows = await db
    .select({ batchId: capturedProducts.batchId })
    .from(capturedProducts)
    .where(inArray(capturedProducts.id, ids));
  return rows.map((row) => row.batchId);
}

/**
 * Central de Revisão da Captura Inteligente.
 * A versão anterior lia product_capture_history, um fluxo legado que não
 * recebe os lotes criados por intelligentCapture. Captura e revisão passam a
 * usar a mesma fonte de verdade: captured_product_batches/captured_products.
 */
export const captureReviewRouter = router({
  listPending: protectedProcedure
    .input(
      z.object({
        sourceType: sourceType.optional(),
        status: reviewStatus.optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      try {
        const conditions = [];
        if (input.sourceType) conditions.push(eq(capturedProductBatches.sourceType, input.sourceType));
        if (input.status) conditions.push(eq(capturedProducts.status, input.status));
        const where = conditions.length ? and(...conditions) : undefined;

        const [items, totals] = await Promise.all([
          db
            .select({
              id: capturedProducts.id,
              batchId: capturedProducts.batchId,
              productName: capturedProducts.name,
              brand: capturedProducts.brand,
              manufacturer: capturedProducts.manufacturer,
              description: capturedProducts.description,
              presentation: capturedProducts.presentation,
              barcode: capturedProducts.barcode,
              sku: capturedProducts.sku,
              price: capturedProducts.price,
              unit: capturedProducts.unit,
              category: capturedProducts.category,
              matchedProductId: capturedProducts.matchedProductId,
              matchedProductName: products.name,
              actionSuggestion: capturedProducts.actionSuggestion,
              duplicateSignal: capturedProducts.duplicateSignal,
              status: capturedProducts.status,
              sourceType: capturedProductBatches.sourceType,
              sourceLabel: capturedProductBatches.sourceLabel,
              sourceReference: capturedProductBatches.sourceReference,
              createdAt: capturedProducts.createdAt,
            })
            .from(capturedProducts)
            .innerJoin(capturedProductBatches, eq(capturedProducts.batchId, capturedProductBatches.id))
            .leftJoin(products, eq(capturedProducts.matchedProductId, products.id))
            .where(where)
            .orderBy(desc(capturedProducts.createdAt))
            .limit(input.limit)
            .offset(input.offset),
          db
            .select({ total: count() })
            .from(capturedProducts)
            .innerJoin(capturedProductBatches, eq(capturedProducts.batchId, capturedProductBatches.id))
            .where(where),
        ]);

        return { items, total: Number(totals[0]?.total ?? 0) };
      } catch (error) {
        logger.error("Error listing captured products for review:", error);
        throw error;
      }
    }),

  getReviewStats: protectedProcedure
    .input(z.object({ sourceType: sourceType.optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { total: 0, pendingReview: 0, approved: 0, rejected: 0, applied: 0 };

      const where = input?.sourceType ? eq(capturedProductBatches.sourceType, input.sourceType) : undefined;
      const rows = await db
        .select({ status: capturedProducts.status, total: count() })
        .from(capturedProducts)
        .innerJoin(capturedProductBatches, eq(capturedProducts.batchId, capturedProductBatches.id))
        .where(where)
        .groupBy(capturedProducts.status);

      const byStatus = (status: "pending" | "approved" | "rejected" | "applied") =>
        Number(rows.find((row) => row.status === status)?.total ?? 0);
      return {
        total: rows.reduce((sum, row) => sum + Number(row.total), 0),
        pendingReview: byStatus("pending"),
        approved: byStatus("approved"),
        rejected: byStatus("rejected"),
        applied: byStatus("applied"),
      };
    }),

  getSourcesWithPending: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ sourceType: capturedProductBatches.sourceType, pendingCount: count() })
      .from(capturedProducts)
      .innerJoin(capturedProductBatches, eq(capturedProducts.batchId, capturedProductBatches.id))
      .where(eq(capturedProducts.status, "pending"))
      .groupBy(capturedProductBatches.sourceType);
  }),

  approveBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const batchIds = await getBatchIdsForItems(input.ids);
      await db.update(capturedProducts).set({ status: "approved" }).where(inArray(capturedProducts.id, input.ids));
      await syncBatchCounters(batchIds);
      return { success: true, approved: input.ids.length };
    }),

  rejectBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const batchIds = await getBatchIdsForItems(input.ids);
      await db.update(capturedProducts).set({ status: "rejected" }).where(inArray(capturedProducts.id, input.ids));
      await syncBatchCounters(batchIds);
      return { success: true, rejected: input.ids.length };
    }),

  getItemsByIds: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.ids.length === 0) return [];
      return db.select({ id: capturedProducts.id, status: capturedProducts.status })
        .from(capturedProducts)
        .where(inArray(capturedProducts.id, input.ids));
    }),

  undoBatchAction: protectedProcedure
    .input(z.object({ items: z.array(z.object({ id: z.number().int().positive(), previousStatus: reviewStatus })) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const ids = input.items.map((item) => item.id);
      const batchIds = await getBatchIdsForItems(ids);
      for (const item of input.items) {
        await db.update(capturedProducts).set({ status: item.previousStatus }).where(eq(capturedProducts.id, item.id));
      }
      await syncBatchCounters(batchIds);
      return { success: true, restored: input.items.length };
    }),

  /** Aplica somente itens aprovados já vinculados a um produto real. */
  applyApprovedChanges: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const rows = await db.select().from(capturedProducts)
        .where(and(inArray(capturedProducts.id, input.ids), eq(capturedProducts.status, "approved")));

      let applied = 0;
      let skipped = 0;
      const batchIds = rows.map((row) => row.batchId);
      for (const item of rows) {
        if (!item.matchedProductId) {
          skipped++;
          continue;
        }
        const update: Record<string, unknown> = {};
        if (item.name) update.name = item.name;
        if (item.manufacturer) update.manufacturer = item.manufacturer;
        if (item.description) update.description = item.description;
        if (item.presentation) update.presentation = item.presentation;
        if (item.barcode) update.barcode = item.barcode;
        if (item.price != null) update.price = item.price;
        if (item.unit) update.unit = item.unit;
        // Transação POR ITEM (não do lote): alterar o produto e marcá-lo como
        // aplicado precisa ser atômico, senão uma falha na marcação deixava o
        // produto já alterado e o item ainda "approved" — pronto para ser
        // aplicado de novo. Por item, e não pelo lote inteiro, porque a
        // aplicação parcial é legítima aqui (o retorno reporta applied/skipped).
        await db.transaction(async (tx) => {
          if (Object.keys(update).length > 0) {
            await tx.update(products).set(update as any).where(eq(products.id, item.matchedProductId!));
          }
          await tx.update(capturedProducts).set({ status: "applied" }).where(eq(capturedProducts.id, item.id));
        });
        applied++;
      }
      await syncBatchCounters(batchIds);
      return { success: true, applied, skipped };
    }),

  exportChanges: protectedProcedure
    .input(z.object({ sourceType: sourceType.optional(), status: reviewStatus.optional() }).optional())
    .mutation(async ({ input }) => {
      const csv = await buildCaptureCsv(input ?? {});
      return { csv, filename: `capturas-${new Date().toISOString().slice(0, 10)}.csv` };
    }),

  exportCsv: protectedProcedure
    .input(z.object({ sourceType: sourceType.optional() }).optional())
    .query(async ({ input }) => {
      const csv = await buildCaptureCsv(input ?? {});
      return { csv, filename: `capturas-${new Date().toISOString().slice(0, 10)}.csv` };
    }),
});

async function buildCaptureCsv(filters: {
  sourceType?: "url" | "html" | "pdf" | "spreadsheet" | "xml" | "docx" | "text" | "image";
  status?: "pending" | "approved" | "rejected" | "applied";
}): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const conditions = [];
  if (filters.sourceType) conditions.push(eq(capturedProductBatches.sourceType, filters.sourceType));
  if (filters.status) conditions.push(eq(capturedProducts.status, filters.status));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db.select({
    id: capturedProducts.id,
    batchId: capturedProducts.batchId,
    productName: capturedProducts.name,
    manufacturer: capturedProducts.manufacturer,
    presentation: capturedProducts.presentation,
    barcode: capturedProducts.barcode,
    price: capturedProducts.price,
    unit: capturedProducts.unit,
    category: capturedProducts.category,
    matchedProductId: capturedProducts.matchedProductId,
    actionSuggestion: capturedProducts.actionSuggestion,
    duplicateSignal: capturedProducts.duplicateSignal,
    status: capturedProducts.status,
    sourceType: capturedProductBatches.sourceType,
    sourceLabel: capturedProductBatches.sourceLabel,
    createdAt: capturedProducts.createdAt,
  })
    .from(capturedProducts)
    .innerJoin(capturedProductBatches, eq(capturedProducts.batchId, capturedProductBatches.id))
    .where(where)
    .orderBy(desc(capturedProducts.createdAt))
    .limit(50000);

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = "id;lote;produto;fabricante;apresentacao;codigo_barras;preco;unidade;categoria;produto_match_id;acao_sugerida;duplicidade;status;origem;rotulo_origem;data";
  const lines = rows.map((row) => [
    row.id, row.batchId, row.productName, row.manufacturer, row.presentation,
    row.barcode, row.price, row.unit, row.category, row.matchedProductId,
    row.actionSuggestion, row.duplicateSignal, row.status, row.sourceType,
    row.sourceLabel, row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  ].map(esc).join(";"));
  return [header, ...lines].join("\n");
}
