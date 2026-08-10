import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  deliveries,
  funilEventos,
  funilOportunidades,
  proposals,
  purchaseOrders,
  type EtapaFunil,
} from "../../drizzle/schema";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  canonicalPerformance,
  canonicalSummary,
  getCanonicalOpportunity,
  listCanonicalOpportunityPage,
  listCanonicalOpportunities,
  listUnifiedAgenda,
  reconcileCanonicalWorkflow,
} from "../services/canonicalOpportunityService";
import {
  decideOpportunity,
  ensureOpportunityFromQuotation,
  ensureOpportunityFromRadar,
  moveOpportunity,
  prepareOpportunityForProposal,
} from "../services/opportunityWorkflowService";
import {
  canEvidenceAdvance,
  transitionOpportunityInTransaction,
} from "../services/opportunityStateService";

const radarInputSchema = z.object({
  source: z.enum(["pncp", "comprasgov", "fiemg"]),
  sourceId: z.string().trim().min(1).max(256),
  orgao: z.string().trim().min(1).max(512),
  modalidade: z.string().trim().max(128),
  numeroProcesso: z.string().trim().max(128),
  objeto: z.string().trim().min(1).max(20_000),
  descricaoDetalhada: z.string().max(20_000).optional(),
  uf: z.string().trim().max(2).optional(),
  municipio: z.string().trim().max(128).optional(),
  dataPublicacao: z.string().datetime({ offset: true }).nullable().optional(),
  dataAbertura: z.string().datetime({ offset: true }).nullable().optional(),
  dataEncerramento: z.string().datetime({ offset: true }).nullable().optional(),
  valorEstimado: z.number().nonnegative().optional(),
  status: z.string().trim().max(64).optional(),
  links: z.array(z.string().url().max(2048)).max(10).optional(),
  dedupeKey: z.string().max(512).optional(),
});

const stageSchema = z.enum([
  "nova",
  "triagem",
  "analise",
  "cotacao",
  "precificacao",
  "proposta",
  "enviada",
  "disputa",
  "habilitacao",
  "vencida",
  "perdida",
  "cancelada",
  "contrato",
  "entrega",
  "faturamento",
  "recebimento",
  "encerrada",
]);

function actorLabel(user: { name?: string | null; email?: string | null }): string {
  return user.name?.trim() || user.email?.trim() || "sistema";
}

async function resolveOpportunityFromProposal(proposalId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const [proposal] = await db
    .select({
      radarOpportunityId: proposals.radarOpportunityId,
      processNumber: proposals.processNumber,
      orgName: proposals.orgName,
    })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!proposal) return null;

  if (proposal.radarOpportunityId != null) {
    const rows = await db
      .select({ id: funilOportunidades.id })
      .from(funilOportunidades)
      .where(
        and(
          eq(funilOportunidades.origemTipo, "pncp"),
          eq(funilOportunidades.origemId, proposal.radarOpportunityId),
        ),
      )
      .limit(2);
    if (rows.length === 1) return rows[0].id;
    if (rows.length > 1) return null;
  }

  if (proposal.processNumber?.trim() && proposal.orgName?.trim()) {
    const rows = await db
      .select({ id: funilOportunidades.id })
      .from(funilOportunidades)
      .where(
        and(
          eq(funilOportunidades.numeroProcesso, proposal.processNumber.trim()),
          eq(funilOportunidades.orgao, proposal.orgName.trim()),
        ),
      )
      .limit(2);
    if (rows.length === 1) return rows[0].id;
  }
  return null;
}

async function resolveOrderOpportunity(orderId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [order] = await db
    .select({ id: purchaseOrders.id, funilId: purchaseOrders.funilId, proposalId: purchaseOrders.proposalId })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, orderId))
    .limit(1);
  if (!order) return null;
  if (order.funilId) return order.funilId;
  if (!order.proposalId) return null;
  return resolveOpportunityFromProposal(order.proposalId);
}

async function findExistingProposalForOpportunity(opportunity: typeof funilOportunidades.$inferSelect) {
  const db = await getDb();
  if (!db) return null;

  if (opportunity.origemTipo === "pncp" && opportunity.origemId != null) {
    const [proposal] = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.radarOpportunityId, opportunity.origemId))
      .limit(1);
    if (proposal) return proposal;
  }
  if (opportunity.numeroProcesso?.trim() && opportunity.orgao?.trim()) {
    const [proposal] = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(
        and(
          eq(proposals.processNumber, opportunity.numeroProcesso.trim()),
          eq(proposals.orgName, opportunity.orgao.trim()),
        ),
      )
      .limit(1);
    return proposal ?? null;
  }
  return null;
}

export const opportunitiesRouter = router({
  /** Compatibilidade para seletores pequenos. Boards novos devem usar listPage. */
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(200) }).optional())
    .query(({ input }) => listCanonicalOpportunities(input?.limit ?? 200)),

  listPage: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(100),
        cursor: z.number().int().positive().optional(),
      }).optional(),
    )
    .query(({ input }) => listCanonicalOpportunityPage(input)),

  summary: protectedProcedure.query(() => canonicalSummary()),
  performance: protectedProcedure.query(() => canonicalPerformance()),
  agenda: protectedProcedure.query(() => listUnifiedAgenda()),

  detail: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const result = await getCanonicalOpportunity(input.id);
      if (!result) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });
      }
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
        prazoEnvio: z.string().date().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

      return db.transaction(async (tx) => {
        if (input.numeroProcesso?.trim() && input.orgao?.trim()) {
          const [existing] = await tx
            .select({ id: funilOportunidades.id })
            .from(funilOportunidades)
            .where(
              and(
                eq(funilOportunidades.numeroProcesso, input.numeroProcesso.trim()),
                eq(funilOportunidades.orgao, input.orgao.trim()),
              ),
            )
            .limit(1);
          if (existing) return { id: existing.id, jaExistia: true };
        }

        const [result] = await tx.insert(funilOportunidades).values({
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
        const id = Number((result as { insertId?: number }).insertId ?? 0);
        if (!id) throw new Error("Falha ao criar oportunidade.");

        await tx.insert(funilEventos).values({
          oportunidadeId: id,
          deEtapa: null,
          paraEtapa: "triagem",
          justificativa: "Entrada manual na Central de Oportunidades",
          usuario: actorLabel(ctx.user),
        });
        return { id, jaExistia: false };
      });
    }),

  importRadar: editorProcedure
    .input(radarInputSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

      if (input.numeroProcesso && input.orgao) {
        const [existing] = await db
          .select({ id: funilOportunidades.id })
          .from(funilOportunidades)
          .where(
            and(
              eq(funilOportunidades.numeroProcesso, input.numeroProcesso),
              eq(funilOportunidades.orgao, input.orgao.slice(0, 256)),
            ),
          )
          .limit(1);
        if (existing) {
          return { id: existing.id, jaExistia: true, deduplicadoEntreFontes: true };
        }
      }

      const result = await ensureOpportunityFromRadar(input, ctx.user);
      return { id: result.id, jaExistia: result.jaExistia, deduplicadoEntreFontes: false };
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
    .mutation(({ input, ctx }) =>
      decideOpportunity(input.id, input.decisao, input.justificativa, ctx.user),
    ),

  move: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        paraEtapa: stageSchema,
        justificativa: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      moveOpportunity(input.id, input.paraEtapa, input.justificativa, ctx.user),
    ),

  createProposal: editorProcedure
    .input(
      z.object({
        opportunityId: z.number().int().positive(),
        title: z.string().trim().min(1).max(256).optional(),
        validityDays: z.number().int().min(1).max(365).default(30),
        paymentTerms: z.string().trim().max(256).optional(),
        deliveryTerms: z.string().trim().max(256).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await prepareOpportunityForProposal(input.opportunityId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

      const [snapshot] = await db
        .select()
        .from(funilOportunidades)
        .where(eq(funilOportunidades.id, input.opportunityId))
        .limit(1);
      if (!snapshot) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });

      const existing = await findExistingProposalForOpportunity(snapshot);
      if (existing) {
        return { proposalId: existing.id, opportunityId: input.opportunityId, jaExistia: true };
      }

      return db.transaction(async (tx) => {
        const [opportunity] = await tx
          .select()
          .from(funilOportunidades)
          .where(eq(funilOportunidades.id, input.opportunityId))
          .limit(1);
        if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });
        if (opportunity.etapa !== "precificacao") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `A oportunidade mudou para ${opportunity.etapa} antes da criação da proposta.`,
          });
        }

        const [insertResult] = await tx.insert(proposals).values({
          title: input.title ?? `Proposta — ${opportunity.titulo.slice(0, 180)}`,
          processNumber: opportunity.numeroProcesso ?? null,
          orgName: opportunity.orgao ?? null,
          status: "draft",
          validityDays: input.validityDays,
          paymentTerms: input.paymentTerms ?? null,
          deliveryTerms: input.deliveryTerms ?? null,
          origem: "workflow",
          radarOpportunityId:
            opportunity.origemTipo === "pncp" ? opportunity.origemId ?? null : null,
        });
        const proposalId = Number((insertResult as { insertId?: number }).insertId ?? 0);
        if (!proposalId) throw new Error("Falha ao persistir proposta.");

        const changed = await transitionOpportunityInTransaction(tx, {
          opportunityId: input.opportunityId,
          from: "precificacao",
          to: "proposta",
          reason: `Proposta #${proposalId} criada pelo fluxo canônico`,
          actor: actorLabel(ctx.user),
        });
        if (!changed) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A oportunidade foi alterada concorrentemente durante a criação da proposta.",
          });
        }

        return { proposalId, opportunityId: input.opportunityId, jaExistia: false };
      });
    }),

  updateOrderStatus: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["solicitado", "confirmado", "faturado", "enviado", "recebido", "divergente", "cancelado"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

      const funilId = await resolveOrderOpportunity(input.id);
      return db.transaction(async (tx) => {
        const [order] = await tx
          .select({ id: purchaseOrders.id, funilId: purchaseOrders.funilId })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, input.id))
          .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });

        await tx
          .update(purchaseOrders)
          .set({ status: input.status, ...(funilId ? { funilId } : {}) })
          .where(eq(purchaseOrders.id, input.id));

        if (funilId && input.status !== "cancelado") {
          const [opportunity] = await tx
            .select({ etapa: funilOportunidades.etapa })
            .from(funilOportunidades)
            .where(eq(funilOportunidades.id, funilId))
            .limit(1);
          const target: EtapaFunil = input.status === "recebido" ? "faturamento" : "entrega";
          if (opportunity && canEvidenceAdvance(opportunity.etapa, target)) {
            await transitionOpportunityInTransaction(tx, {
              opportunityId: funilId,
              from: opportunity.etapa,
              to: target,
              reason: `[PEDIDO #${input.id}] status ${input.status}`,
              actor: actorLabel(ctx.user),
            });
          }
        }
        return { ok: true, funilId };
      });
    }),

  updateDeliveryStatus: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["preparando", "transito", "entregue", "atrasada", "devolvida"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

      const [deliverySnapshot] = await db
        .select({ orderId: deliveries.orderId, funilId: deliveries.funilId })
        .from(deliveries)
        .where(eq(deliveries.id, input.id))
        .limit(1);
      if (!deliverySnapshot) throw new TRPCError({ code: "NOT_FOUND", message: "Entrega não encontrada." });
      const funilId = deliverySnapshot.funilId ?? (deliverySnapshot.orderId ? await resolveOrderOpportunity(deliverySnapshot.orderId) : null);

      return db.transaction(async (tx) => {
        const [delivery] = await tx
          .select({ entregueEm: deliveries.entregueEm })
          .from(deliveries)
          .where(eq(deliveries.id, input.id))
          .limit(1);
        if (!delivery) throw new TRPCError({ code: "NOT_FOUND", message: "Entrega não encontrada." });

        await tx
          .update(deliveries)
          .set({
            status: input.status,
            ...(funilId ? { funilId } : {}),
            ...(input.status === "entregue" && !delivery.entregueEm ? { entregueEm: new Date() } : {}),
          })
          .where(eq(deliveries.id, input.id));

        if (funilId) {
          const [opportunity] = await tx
            .select({ etapa: funilOportunidades.etapa })
            .from(funilOportunidades)
            .where(eq(funilOportunidades.id, funilId))
            .limit(1);
          const target: EtapaFunil = input.status === "entregue" ? "faturamento" : "entrega";
          if (opportunity && canEvidenceAdvance(opportunity.etapa, target)) {
            await transitionOpportunityInTransaction(tx, {
              opportunityId: funilId,
              from: opportunity.etapa,
              to: target,
              reason: `[ENTREGA #${input.id}] status ${input.status}`,
              actor: actorLabel(ctx.user),
            });
          }
        }
        return { ok: true, funilId };
      });
    }),
});
