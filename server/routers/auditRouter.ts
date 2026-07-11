import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { auditLogs } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { checkDatabaseIntegrity, checkForeignKeyIntegrity, getDatabaseStats } from "../db.audit";

export const auditRouter = router({
  getLogs: adminProcedure
    .input(z.object({ limit: z.number().default(100), offset: z.number().default(0), entity: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const base = db.select().from(auditLogs);
      const rows = input.entity
        ? await base.where(eq(auditLogs.entity, input.entity)).orderBy(desc(auditLogs.createdAt)).limit(input.limit).offset(input.offset)
        : await base.orderBy(desc(auditLogs.createdAt)).limit(input.limit).offset(input.offset);
      return rows;
    }),

  logAction: protectedProcedure
    .input(
      z.object({
        action: z.string(),
        entity: z.string(),
        entityId: z.number().optional(),
        origin: z.string().optional(),
        summary: z.string().optional(),
        changes: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      await db.insert(auditLogs).values({
        userId: ctx.user.id,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        origin: input.origin ?? "manual",
        summary: input.summary ?? null,
        changes: (input.changes ?? null) as any,
      });
      return { success: true };
    }),

  checkDatabaseIntegrity: adminProcedure.query(async () => {
    return await checkDatabaseIntegrity();
  }),

  checkForeignKeys: adminProcedure.query(async () => {
    return await checkForeignKeyIntegrity();
  }),

  getDatabaseStats: adminProcedure.query(async () => {
    return await getDatabaseStats();
  }),
});
