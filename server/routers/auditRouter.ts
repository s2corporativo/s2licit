import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { auditLogs } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { checkDatabaseIntegrity, checkForeignKeyIntegrity, getDatabaseStats } from "../db.audit";
import { getDatabaseSchemaFingerprint } from "../services/databaseSchemaFingerprint";
import { requestOrigin } from "../services/auditService";
import { isSensitiveAuditAction } from "../services/auditTrustPolicy";

export const auditRouter = router({
  getLogs: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(1000).default(100), offset: z.number().min(0).default(0), entity: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const base = db.select().from(auditLogs);
      const rows = input.entity
        ? await base.where(eq(auditLogs.entity, input.entity)).orderBy(desc(auditLogs.createdAt)).limit(input.limit).offset(input.offset)
        : await base.orderBy(desc(auditLogs.createdAt)).limit(input.limit).offset(input.offset);
      return rows.map((row) => ({
        ...row,
        trustLevel: row.origin === "client" ? "client" as const : "server" as const,
      }));
    }),

  /**
   * Telemetria originada no navegador. Não pode registrar ações sensíveis nem
   * escolher uma origem que se confunda com evento server-side confiável.
   */
  logAction: protectedProcedure
    .input(
      z.object({
        action: z.string().min(1).max(128),
        entity: z.string().min(1).max(128),
        entityId: z.number().optional(),
        summary: z.string().max(2000).optional(),
        changes: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (isSensitiveAuditAction(input.action)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Eventos operacionais sensíveis devem ser gerados exclusivamente pelo servidor.",
        });
      }

      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const origin = requestOrigin(ctx.req);
      await db.insert(auditLogs).values({
        userId: ctx.user.id,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        origin: "client",
        summary: input.summary ?? null,
        changes: (input.changes ?? null) as any,
        ipAddress: origin.ipAddress,
        userAgent: origin.userAgent,
      });
      return { success: true, trustLevel: "client" as const };
    }),

  checkDatabaseIntegrity: adminProcedure.query(async () => checkDatabaseIntegrity()),
  checkForeignKeys: adminProcedure.query(async () => checkForeignKeyIntegrity()),
  getDatabaseStats: adminProcedure.query(async () => getDatabaseStats()),
  // Snapshot estrutural bruto (tipo/nullable/default/index por coluna) —
  // mais granular que checkDatabaseIntegrity, que só compara contra o que
  // schema.ts espera. Útil para comparar dois ambientes lado a lado.
  schemaFingerprint: adminProcedure.query(async () => getDatabaseSchemaFingerprint()),
});
