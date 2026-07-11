import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { productCaptureHistory, products, suppliers } from "../../drizzle/schema";

export const captureReviewRouter = router({
  /**
   * Lista produtos capturados pendentes de revisão
   */
  listPending: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        status: z.enum(["detected", "approved", "rejected", "applied"]).optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      try {
        const baseQuery = db
          .select({
            id: productCaptureHistory.id,
            productId: productCaptureHistory.productId,
            productName: products.name,
            supplierName: suppliers.name,
            field: productCaptureHistory.fieldChanged,
            oldValue: productCaptureHistory.valueBefore,
            newValue: productCaptureHistory.valueAfter,
            status: productCaptureHistory.status,
            createdAt: productCaptureHistory.createdAt,
          })
          .from(productCaptureHistory)
          .innerJoin(products, eq(productCaptureHistory.productId, products.id))
          .innerJoin(suppliers, eq(productCaptureHistory.supplierId, suppliers.id));

        const conditions = [];
        if (input.supplierId) {
          conditions.push(eq(productCaptureHistory.supplierId, input.supplierId));
        }
        if (input.status) {
          conditions.push(eq(productCaptureHistory.status, input.status));
        }

        const items = await (conditions.length > 0
          ? baseQuery.where(and(...conditions))
          : baseQuery)
          .orderBy(desc(productCaptureHistory.createdAt))
          .limit(input.limit)
          .offset(input.offset)
          .execute();

        return {
          items,
          total: items.length,
        };
      } catch (error) {
        console.error("Error listing pending captures:", error);
        return { items: [], total: 0 };
      }
    }),

  /**
   * Obtém detalhes de um produto para preview
   */
  getProductPreview: protectedProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      try {
        const product = await db
          .select()
          .from(products)
          .where(eq(products.id, input.productId))
          .limit(1)
          .execute();

        return product[0] || null;
      } catch (error) {
        console.error("Error getting product preview:", error);
        return null;
      }
    }),

  /**
   * Estatísticas da revisão
   */
  getReviewStats: protectedProcedure
    .input(z.object({ supplierId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return { total: 0, pendingReview: 0, approved: 0, rejected: 0, applied: 0 };
      }

      try {
        const rows = await db
          .select({
            supplierId: productCaptureHistory.supplierId,
            status: productCaptureHistory.status,
          })
          .from(productCaptureHistory)
          .execute();

        const filtered = input.supplierId
          ? rows.filter((row) => row.supplierId === input.supplierId)
          : rows;

        return {
          total: filtered.length,
          pendingReview: filtered.filter((row) => row.status === "detected").length,
          approved: filtered.filter((row) => row.status === "approved").length,
          rejected: filtered.filter((row) => row.status === "rejected").length,
          applied: filtered.filter((row) => row.status === "applied").length,
        };
      } catch (error) {
        console.error("Error getting review stats:", error);
        return { total: 0, pendingReview: 0, approved: 0, rejected: 0, applied: 0 };
      }
    }),

  /**
   * Fornecedores com itens pendentes
   */
  getSuppliersWithPending: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      try {
        const rows = await db
          .select({
            supplierId: suppliers.id,
            supplierName: suppliers.name,
            status: productCaptureHistory.status,
          })
          .from(productCaptureHistory)
          .innerJoin(suppliers, eq(productCaptureHistory.supplierId, suppliers.id))
          .execute();

        const grouped = new Map<number, { supplierId: number; supplierName: string; pendingCount: number }>();
        for (const row of rows) {
          const current = grouped.get(row.supplierId) ?? {
            supplierId: row.supplierId,
            supplierName: row.supplierName,
            pendingCount: 0,
          };
          if (row.status === "detected") current.pendingCount += 1;
          grouped.set(row.supplierId, current);
        }

        return Array.from(grouped.values()).filter((row) => row.pendingCount > 0);
      } catch (error) {
        console.error("Error getting suppliers with pending items:", error);
        return [];
      }
    }),

  /**
   * Aprova produtos em lote
   */
  approveBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number()), userId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      try {
        if (input.ids.length === 0) {
          return { success: true, approved: 0 };
        }

        const userId = input.userId || (ctx.user?.id as number);
        const now = new Date();

        await db
          .update(productCaptureHistory)
          .set({
            status: "approved",
            approvedBy: userId,
            approvedAt: now,
          })
          .where(inArray(productCaptureHistory.id, input.ids))
          .execute();

        return { success: true, approved: input.ids.length };
      } catch (error) {
        console.error("Error approving batch:", error);
        return { success: false, approved: 0, error: String(error) };
      }
    }),

  /**
   * Rejeita produtos em lote
   */
  rejectBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.number()), userId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      try {
        if (input.ids.length === 0) {
          return { success: true, rejected: 0 };
        }

        const userId = input.userId || (ctx.user?.id as number);
        const now = new Date();

        await db
          .update(productCaptureHistory)
          .set({
            status: "rejected",
            approvedBy: userId,
            approvedAt: now,
          })
          .where(inArray(productCaptureHistory.id, input.ids))
          .execute();

        return { success: true, rejected: input.ids.length };
      } catch (error) {
        console.error("Error rejecting batch:", error);
        return { success: false, rejected: 0, error: String(error) };
      }
    }),

  /**
   * Desfaz a última ação em lote restaurando o estado anterior informado pelo frontend
   */
  undoBatchAction: protectedProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            id: z.number(),
            previousStatus: z.enum(["detected", "approved", "rejected", "applied"]),
            previousApprovedBy: z.number().nullable().optional(),
            previousApprovedAt: z.union([z.string(), z.null()]).optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      try {
        if (input.items.length === 0) {
          return { success: true, restored: 0 };
        }

        for (const item of input.items) {
          await db
            .update(productCaptureHistory)
            .set({
              status: item.previousStatus,
              approvedBy: item.previousApprovedBy ?? null,
              approvedAt: item.previousApprovedAt ? new Date(item.previousApprovedAt) : null,
            })
            .where(eq(productCaptureHistory.id, item.id))
            .execute();
        }

        return { success: true, restored: input.items.length };
      } catch (error) {
        console.error("Error undoing batch action:", error);
        return { success: false, restored: 0, error: String(error) };
      }
    }),

  /**
   * Obtém o detalhe de itens por ids para compor snapshots de desfazer no frontend
   */
  getItemsByIds: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      try {
        if (input.ids.length === 0) {
          return [];
        }

        return await db
          .select({
            id: productCaptureHistory.id,
            status: productCaptureHistory.status,
            approvedBy: productCaptureHistory.approvedBy,
            approvedAt: productCaptureHistory.approvedAt,
          })
          .from(productCaptureHistory)
          .where(inArray(productCaptureHistory.id, input.ids))
          .execute();
      } catch (error) {
        console.error("Error getting capture items by ids:", error);
        return [];
      }
    }),

  /**
   * Aplica mudanças aprovadas aos produtos
   */
  applyApprovedChanges: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      try {
        if (input.ids.length === 0) {
          return { success: true, applied: 0 };
        }

        // Buscar os registros aprovados
        const approved = await db
          .select()
          .from(productCaptureHistory)
          .where(
            and(
              inArray(productCaptureHistory.id, input.ids),
              eq(productCaptureHistory.status, "approved")
            )
          )
          .execute();

        let appliedCount = 0;
        let errorCount = 0;

        // Whitelist de campos que podem ser atualizados dinamicamente
        // (nomes reais das colunas em drizzle/schema.ts → products)
        const allowedFields = new Set([
          "price",
          "name",
          "description",
          "manufacturer",
          "ean",
          "code",
        ]);

        // Aplicar cada mudança ao produto
        for (const change of approved) {
          try {
            // Validar campo permitido antes de atualizar
            if (!allowedFields.has(change.fieldChanged)) {
              console.error(
                `Campo não permitido para atualização dinâmica: ${change.fieldChanged}`
              );
              errorCount++;
              continue;
            }

            const product = await db
              .select({ id: products.id })
              .from(products)
              .where(eq(products.id, change.productId))
              .limit(1)
              .execute();

            if (product.length === 0) {
              errorCount++;
              continue;
            }

            // Atualizar o campo do produto com o novo valor
            const updateData: Record<string, any> = {};
            updateData[change.fieldChanged] = change.valueAfter;

            await db
              .update(products)
              .set(updateData)
              .where(eq(products.id, change.productId))
              .execute();

            // Marcar como aplicado
            await db
              .update(productCaptureHistory)
              .set({ status: "applied" })
              .where(eq(productCaptureHistory.id, change.id))
              .execute();

            appliedCount++;
          } catch (err) {
            console.error(`Error applying change ${change.id}:`, err);
            errorCount++;
          }
        }

        return { success: true, applied: appliedCount, errors: errorCount };
      } catch (error) {
        console.error("Error applying approved changes:", error);
        return { success: false, applied: 0, error: String(error) };
      }
    }),

  /**
   * Exporta mudanças em CSV
   */
  exportChanges: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        status: z.enum(["detected", "approved", "rejected", "applied"]).optional(),
      })
    )
    .mutation(async () => {
      try {
        return { csv: "", filename: "capture-export.csv" };
      } catch (error) {
        console.error("Error exporting CSV:", error);
        return { csv: "", filename: "" };
      }
    }),

  exportCsv: protectedProcedure
    .input(z.object({ supplierId: z.number().optional() }))
    .query(async () => {
      try {
        return { csv: "", filename: "capture-export.csv" };
      } catch (error) {
        console.error("Error exporting CSV:", error);
        return { csv: "", filename: "" };
      }
    }),
});
