import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  auditLogs,
  diligenciaWorkflows,
  type InsertDiligenciaWorkflow,
} from "../../drizzle/schema";

export const workflowRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");
    return db.select().from(diligenciaWorkflows).orderBy(desc(diligenciaWorkflows.updatedAt));
  }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      proposalId: z.number().optional().nullable(),
      orgId: z.number().optional().nullable(),
      tipo: z.string().min(2),
      titulo: z.string().min(3),
      status: z.enum(["aberta", "pendente", "respondida", "encerrada"]),
      prioridade: z.enum(["baixa", "media", "alta"]),
      prazoResposta: z.string().optional().nullable(),
      responsavel: z.string().optional().nullable(),
      detalhes: z.string().optional().nullable(),
      resposta: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados indisponível");
      const parsedPrazoResposta = input.prazoResposta ? new Date(input.prazoResposta) : null;
      const prazoResposta = parsedPrazoResposta && !Number.isNaN(parsedPrazoResposta.getTime())
        ? parsedPrazoResposta
        : null;

      const payload: InsertDiligenciaWorkflow = {
        proposalId: input.proposalId ?? null,
        orgId: input.orgId ?? null,
        tipo: input.tipo,
        titulo: input.titulo,
        status: input.status,
        prioridade: input.prioridade,
        prazoResposta,
        responsavel: input.responsavel ?? null,
        detalhes: input.detalhes ?? null,
        resposta: input.resposta ?? null,
      };

      if (input.id) {
        await db.update(diligenciaWorkflows).set({ ...payload, updatedAt: new Date() }).where(eq(diligenciaWorkflows.id, input.id));
        await db.insert(auditLogs).values({ userId: ctx.user.id, action: "update", entity: "diligencia_workflows", entityId: input.id, origin: "workflowRouter", summary: input.titulo, changes: input as any });
        return { success: true, mode: "update" };
      }

      await db.insert(diligenciaWorkflows).values(payload);
      await db.insert(auditLogs).values({ userId: ctx.user.id, action: "create", entity: "diligencia_workflows", origin: "workflowRouter", summary: input.titulo, changes: input as any });
      return { success: true, mode: "create" };
    }),

  remove: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados indisponível");
    await db.delete(diligenciaWorkflows).where(eq(diligenciaWorkflows.id, input.id));
    await db.insert(auditLogs).values({ userId: ctx.user.id, action: "delete", entity: "diligencia_workflows", entityId: input.id, origin: "workflowRouter", summary: `Workflow ${input.id} removido` });
    return { success: true };
  }),
});
