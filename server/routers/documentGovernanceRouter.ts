import { z } from "zod";
import { asc, desc, eq, or } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { auditLogs, documentosHabilitacao } from "../../drizzle/schema";

export const documentGovernanceRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");
    return db.select().from(documentosHabilitacao).orderBy(asc(documentosHabilitacao.tipo), asc(documentosHabilitacao.nome));
  }),

  summary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");
    const docs = await db.select().from(documentosHabilitacao);
    return {
      total: docs.length,
      validos: docs.filter((d) => d.statusValidade === "valido").length,
      expirando: docs.filter((d) => d.statusValidade === "expirando").length,
      vencidos: docs.filter((d) => d.statusValidade === "vencido").length,
      semData: docs.filter((d) => d.statusValidade === "sem_data").length,
    };
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        tipo: z.string().min(2),
        nome: z.string().min(2),
        fileUrl: z.string().optional().nullable(),
        fileKey: z.string().optional().nullable(),
        dataEmissao: z.string().optional().nullable(),
        dataVencimento: z.string().optional().nullable(),
        statusValidade: z.enum(["valido", "expirando", "vencido", "sem_data"]),
        notas: z.string().optional().nullable(),
        orgaoEmissor: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");

      const payload = {
        tipo: input.tipo,
        nome: input.nome,
        fileUrl: input.fileUrl ?? null,
        fileKey: input.fileKey ?? null,
        dataEmissao: input.dataEmissao ?? null,
        dataVencimento: input.dataVencimento ?? null,
        statusValidade: input.statusValidade,
        notas: input.notas ?? null,
        orgaoEmissor: input.orgaoEmissor ?? null,
        updatedAt: new Date(),
      } as const;

      if (input.id) {
        await db.update(documentosHabilitacao).set(payload).where(eq(documentosHabilitacao.id, input.id));
        await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update", entity: "documentos_habilitacao", entityId: input.id, origin: "documentGovernanceRouter", summary: input.nome, changes: input as any });
        return { success: true, mode: "update" };
      }

      await db.insert(documentosHabilitacao).values({ ...payload, createdAt: new Date() });
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "documentos_habilitacao", origin: "documentGovernanceRouter", summary: input.nome, changes: input as any });
      return { success: true, mode: "create" };
    }),

  remove: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");
    await db.delete(documentosHabilitacao).where(eq(documentosHabilitacao.id, input.id));
    await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "documentos_habilitacao", entityId: input.id, origin: "documentGovernanceRouter", summary: `Documento ${input.id} removido` });
    return { success: true };
  }),

  alerts: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");
    return db.select().from(documentosHabilitacao).where(or(eq(documentosHabilitacao.statusValidade, "expirando"), eq(documentosHabilitacao.statusValidade, "vencido"))).orderBy(desc(documentosHabilitacao.dataVencimento));
  }),
});
