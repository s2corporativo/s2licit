import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { funilEventos, funilOportunidades } from "../../drizzle/schema";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { createProposal, getDb } from "../db";
import {
  canonicalSummary,
  getCanonicalOpportunity,
  listCanonicalOpportunities,
  listUnifiedAgenda,
  reconcileCanonicalWorkflow,
} from "../services/canonicalOpportunityService";
import {
  decideOpportunity,
  ensureOpportunityFromQuotation,
  moveOpportunity,
  prepareOpportunityForProposal,
} from "../services/opportunityWorkflowService";

export const opportunitiesRouter = router({
  list: protectedProcedure.query(() => listCanonicalOpportunities()),
  summary: protectedProcedure.query(() => canonicalSummary()),
  agenda: protectedProcedure.query(() => listUnifiedAgenda()),

  detail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const result = await getCanonicalOpportunity(input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });
      return result;
    }),

  reconcile: editorProcedure.mutation(() => reconcileCanonicalWorkflow()),

  create: editorProcedure
    .input(
      z.object({
        titulo: z.string().trim().min(3).max(512),
        orgao: z.string().trim().max(256).optional(),
        modalidade: z.string().trim().max(128).optional(),
        numeroProcesso: z.string().trim().max(128).optional(),
        objeto: z.string().trim().max(20_000).optional(),
        valorEstimado: z.number().nonnegative().optional(),
        prazoEnvio: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const [result] = await db.insert(funilOportunidades).values({
        titulo: input.titulo,
        orgao: input.orgao,
        modalidade: input.modalidade,
        numeroProcesso: input.numeroProcesso,
        objeto: input.objeto,
        valorEstimado: input.valorEstimado != null ? String(input.valorEstimado) : undefined,
        prazoEnvio: input.prazoEnvio ? new Date(`${input.prazoEnvio}T12:00:00`) : undefined,
        origemTipo: "manual",
        etapa: "triagem",
        responsavel: ctx.user.name ?? ctx.user.email ?? undefined,
      });
      const id = Number((result as { insertId?: number }).insertId);
      await db.insert(funilEventos).values({
        oportunidadeId: id,
        deEtapa: null,
        paraEtapa: "triagem",
        justificativa: "Entrada manual na Central de Oportunidades",
        usuario: ctx.user.name ?? ctx.user.email ?? "sistema",
      });
      return { id };
    }),

  importQuotation: editorProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .mutation(({ input, ctx }) => ensureOpportunityFromQuotation(input.quotationId, ctx.user)),

  decide: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        decisao: z.enum(["go", "no_go"]),
        justificativa: z.string().trim().min(5).max(2000),
      }),
    )
    .mutation(({ input, ctx }) => decideOpportunity(input.id, input.decisao, input.justificativa, ctx.user)),

  move: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        paraEtapa: z.enum([
          "nova", "triagem", "analise", "cotacao", "precificacao", "proposta", "enviada",
          "disputa", "habilitacao", "vencida", "perdida", "cancelada", "contrato", "entrega",
          "faturamento", "recebimento", "encerrada",
        ]),
        justificativa: z.string().max(2000).optional(),
      }),
    )
    .mutation(({ input, ctx }) => moveOpportunity(input.id, input.paraEtapa, input.justificativa, ctx.user)),

  createProposal: editorProcedure
    .input(
      z.object({
        opportunityId: z.number().int().positive(),
        title: z.string().trim().min(1).max(256).optional(),
        validityDays: z.number().int().min(1).max(365).default(30),
        paymentTerms: z.string().max(256).optional(),
        deliveryTerms: z.string().max(256).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await prepareOpportunityForProposal(input.opportunityId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const [opportunity] = await db
        .select()
        .from(funilOportunidades)
        .where(eq(funilOportunidades.id, input.opportunityId))
        .limit(1);
      if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });

      const proposalId = await createProposal({
        title: input.title ?? `Proposta — ${opportunity.titulo.slice(0, 180)}`,
        processNumber: opportunity.numeroProcesso ?? null,
        orgName: opportunity.orgao ?? null,
        status: "draft",
        validityDays: input.validityDays,
        paymentTerms: input.paymentTerms ?? null,
        deliveryTerms: input.deliveryTerms ?? null,
        origem: "workflow",
        radarOpportunityId: opportunity.origemTipo === "pncp" ? opportunity.origemId ?? null : null,
      } as any);

      await moveOpportunity(
        input.opportunityId,
        "proposta",
        `Proposta #${proposalId} criada pelo fluxo canônico`,
        ctx.user,
      );
      return { proposalId, opportunityId: input.opportunityId };
    }),
});
