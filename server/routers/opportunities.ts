import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { deliveries, funilEventos, funilOportunidades, proposals, purchaseOrders } from "../../drizzle/schema";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { createProposal, getDb } from "../db";
import { canonicalSummary, getCanonicalOpportunity, listCanonicalOpportunities, listUnifiedAgenda, reconcileCanonicalWorkflow } from "../services/canonicalOpportunityService";
import { decideOpportunity, ensureOpportunityFromQuotation, ensureOpportunityFromRadar, moveOpportunity, prepareOpportunityForProposal } from "../services/opportunityWorkflowService";

const radarInputSchema = z.object({
  source: z.enum(["pncp", "comprasgov", "fiemg"]), sourceId: z.string().min(1).max(256), orgao: z.string().min(1).max(512),
  modalidade: z.string().max(128), numeroProcesso: z.string().max(128), objeto: z.string().min(1).max(20_000),
  descricaoDetalhada: z.string().max(20_000).optional(), uf: z.string().max(2).optional(), municipio: z.string().max(128).optional(),
  dataPublicacao: z.string().datetime({ offset: true }).nullable().optional(), dataAbertura: z.string().datetime({ offset: true }).nullable().optional(),
  dataEncerramento: z.string().datetime({ offset: true }).nullable().optional(), valorEstimado: z.number().nonnegative().optional(),
  status: z.string().max(64).optional(), links: z.array(z.string().max(2048)).max(10).optional(), dedupeKey: z.string().max(512).optional(),
});

async function resolveOpportunityFromProposal(proposalId: number): Promise<number | null> {
  const db = await getDb(); if (!db) return null;
  const [proposal] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1); if (!proposal) return null;
  if (proposal.radarOpportunityId) {
    const [opportunity] = await db.select({ id: funilOportunidades.id }).from(funilOportunidades).where(and(eq(funilOportunidades.origemTipo, "pncp"), eq(funilOportunidades.origemId, proposal.radarOpportunityId))).limit(1);
    if (opportunity) return opportunity.id;
  }
  if (proposal.processNumber?.trim()) {
    const [opportunity] = await db.select({ id: funilOportunidades.id }).from(funilOportunidades).where(eq(funilOportunidades.numeroProcesso, proposal.processNumber.trim())).limit(1);
    if (opportunity) return opportunity.id;
  }
  return null;
}

async function resolveOrderOpportunity(orderId: number): Promise<number | null> {
  const db = await getDb(); if (!db) return null;
  const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).limit(1); if (!order) return null;
  if (order.funilId) return order.funilId; if (!order.proposalId) return null;
  const funilId = await resolveOpportunityFromProposal(order.proposalId);
  if (funilId) await db.update(purchaseOrders).set({ funilId }).where(eq(purchaseOrders.id, order.id));
  return funilId;
}

export const opportunitiesRouter = router({
  list: protectedProcedure.query(() => listCanonicalOpportunities()),
  summary: protectedProcedure.query(() => canonicalSummary()),
  agenda: protectedProcedure.query(() => listUnifiedAgenda()),
  detail: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => { const result = await getCanonicalOpportunity(input.id); if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." }); return result; }),
  reconcile: editorProcedure.mutation(() => reconcileCanonicalWorkflow()),

  create: editorProcedure.input(z.object({ titulo: z.string().trim().min(3).max(512), orgao: z.string().trim().max(256).optional(), modalidade: z.string().trim().max(128).optional(), numeroProcesso: z.string().trim().max(128).optional(), objeto: z.string().trim().max(20_000).optional(), valorEstimado: z.number().nonnegative().optional(), prazoEnvio: z.string().optional() })).mutation(async ({ input, ctx }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    if (input.numeroProcesso?.trim() && input.orgao?.trim()) {
      const [existing] = await db.select({ id: funilOportunidades.id }).from(funilOportunidades).where(and(eq(funilOportunidades.numeroProcesso, input.numeroProcesso.trim()), eq(funilOportunidades.orgao, input.orgao.trim()))).limit(1);
      if (existing) return { id: existing.id, jaExistia: true };
    }
    const [result] = await db.insert(funilOportunidades).values({ titulo: input.titulo, orgao: input.orgao, modalidade: input.modalidade, numeroProcesso: input.numeroProcesso, objeto: input.objeto, valorEstimado: input.valorEstimado != null ? String(input.valorEstimado) : undefined, prazoEnvio: input.prazoEnvio ? new Date(`${input.prazoEnvio}T12:00:00`) : undefined, origemTipo: "manual", etapa: "triagem", responsavel: ctx.user.name ?? ctx.user.email ?? undefined });
    const id = Number((result as { insertId?: number }).insertId);
    await db.insert(funilEventos).values({ oportunidadeId: id, deEtapa: null, paraEtapa: "triagem", justificativa: "Entrada manual na Central de Oportunidades", usuario: ctx.user.name ?? ctx.user.email ?? "sistema" });
    return { id, jaExistia: false };
  }),

  importRadar: editorProcedure.input(radarInputSchema).mutation(async ({ input, ctx }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    // Deduplicação cross-source conservadora: mesmo processo + mesmo órgão.
    if (input.numeroProcesso.trim()) {
      const [existing] = await db.select({ id: funilOportunidades.id }).from(funilOportunidades).where(and(eq(funilOportunidades.numeroProcesso, input.numeroProcesso.trim()), eq(funilOportunidades.orgao, input.orgao.slice(0, 256)))).limit(1);
      if (existing) return { id: existing.id, jaExistia: true, deduplicadoEntreFontes: true };
    }
    const result = await ensureOpportunityFromRadar(input, ctx.user);
    return { id: result.id, jaExistia: result.jaExistia, deduplicadoEntreFontes: false };
  }),

  importQuotation: editorProcedure.input(z.object({ quotationId: z.number().int().positive() })).mutation(({ input, ctx }) => ensureOpportunityFromQuotation(input.quotationId, ctx.user)),
  decide: editorProcedure.input(z.object({ id: z.number().int().positive(), decisao: z.enum(["go", "no_go"]), justificativa: z.string().trim().min(5).max(2000) })).mutation(({ input, ctx }) => decideOpportunity(input.id, input.decisao, input.justificativa, ctx.user)),
  move: editorProcedure.input(z.object({ id: z.number().int().positive(), paraEtapa: z.enum(["nova", "triagem", "analise", "cotacao", "precificacao", "proposta", "enviada", "disputa", "habilitacao", "vencida", "perdida", "cancelada", "contrato", "entrega", "faturamento", "recebimento", "encerrada"]), justificativa: z.string().max(2000).optional() })).mutation(({ input, ctx }) => moveOpportunity(input.id, input.paraEtapa, input.justificativa, ctx.user)),

  createProposal: editorProcedure.input(z.object({ opportunityId: z.number().int().positive(), title: z.string().trim().min(1).max(256).optional(), validityDays: z.number().int().min(1).max(365).default(30), paymentTerms: z.string().max(256).optional(), deliveryTerms: z.string().max(256).optional() })).mutation(async ({ input, ctx }) => {
    await prepareOpportunityForProposal(input.opportunityId, ctx.user);
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const [opportunity] = await db.select().from(funilOportunidades).where(eq(funilOportunidades.id, input.opportunityId)).limit(1); if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });
    const proposalId = await createProposal({ title: input.title ?? `Proposta — ${opportunity.titulo.slice(0, 180)}`, processNumber: opportunity.numeroProcesso ?? null, orgName: opportunity.orgao ?? null, status: "draft", validityDays: input.validityDays, paymentTerms: input.paymentTerms ?? null, deliveryTerms: input.deliveryTerms ?? null, origem: "workflow", radarOpportunityId: opportunity.origemTipo === "pncp" ? opportunity.origemId ?? null : null } as any);
    await moveOpportunity(input.opportunityId, "proposta", `Proposta #${proposalId} criada pelo fluxo canônico`, ctx.user);
    return { proposalId, opportunityId: input.opportunityId };
  }),

  updateOrderStatus: editorProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["solicitado", "confirmado", "faturado", "enviado", "recebido", "divergente", "cancelado"]) })).mutation(async ({ input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const [order] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.id)).limit(1); if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
    const funilId = order.funilId ?? (order.proposalId ? await resolveOpportunityFromProposal(order.proposalId) : null);
    await db.update(purchaseOrders).set({ status: input.status, ...(funilId ? { funilId } : {}) }).where(eq(purchaseOrders.id, input.id)); await reconcileCanonicalWorkflow(); return { ok: true, funilId };
  }),

  updateDeliveryStatus: editorProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["preparando", "transito", "entregue", "atrasada", "devolvida"]) })).mutation(async ({ input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, input.id)).limit(1); if (!delivery) throw new TRPCError({ code: "NOT_FOUND", message: "Entrega não encontrada." });
    const funilId = delivery.funilId ?? (delivery.orderId ? await resolveOrderOpportunity(delivery.orderId) : null);
    await db.update(deliveries).set({ status: input.status, ...(funilId ? { funilId } : {}), ...(input.status === "entregue" && !delivery.entregueEm ? { entregueEm: new Date() } : {}) }).where(eq(deliveries.id, input.id)); await reconcileCanonicalWorkflow(); return { ok: true, funilId };
  }),
});
