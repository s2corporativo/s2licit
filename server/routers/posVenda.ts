import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  deliveries,
  funilOportunidades,
  payables,
  proposalItems,
  proposals,
  purchaseOrderItems,
  purchaseOrders,
  salesInvoices,
} from "../../drizzle/schema";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { recordAudit } from "../services/auditService";
import {
  canEvidenceAdvance,
  transitionOpportunityAtomic,
} from "../services/opportunityStateService";

const dataStr = z.string().date();
const parseDia = (value?: string | null) =>
  value ? new Date(`${value}T12:00:00`) : undefined;

function actorLabel(user: { name?: string | null; email?: string | null }): string {
  return user.name?.trim() || user.email?.trim() || "sistema";
}

function insertId(result: unknown): number {
  if (Array.isArray(result)) {
    const first = result[0];
    if (first && typeof first === "object" && "insertId" in first) {
      return Number((first as { insertId?: number }).insertId ?? 0);
    }
  }
  return 0;
}

function affectedRows(result: unknown): number {
  if (Array.isArray(result)) {
    const first = result[0];
    if (first && typeof first === "object" && "affectedRows" in first) {
      return Number((first as { affectedRows?: number }).affectedRows ?? 0);
    }
  }
  return 0;
}

async function resolveProposalOpportunity(proposalId: number): Promise<number | null> {
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

async function advanceOpportunityFromEvidence(
  opportunityId: number | null | undefined,
  target: "entrega" | "faturamento" | "recebimento",
  reason: string,
  actor: string,
): Promise<void> {
  if (!opportunityId) return;
  const db = await getDb();
  if (!db) return;
  const [opportunity] = await db
    .select({ etapa: funilOportunidades.etapa })
    .from(funilOportunidades)
    .where(eq(funilOportunidades.id, opportunityId))
    .limit(1);
  if (!opportunity || !canEvidenceAdvance(opportunity.etapa, target)) return;
  await transitionOpportunityAtomic({
    opportunityId,
    from: opportunity.etapa,
    to: target,
    reason,
    actor,
  });
}

const orderItemsSchema = z
  .array(
    z.object({
      descricao: z.string().trim().min(1).max(512),
      quantidade: z.number().positive(),
      precoUnit: z.number().nonnegative(),
    }),
  )
  .max(1000)
  .optional();

export const posVendaRouter = router({
  pedidos: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(purchaseOrders)
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(200);
  }),

  pedidoItens: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(purchaseOrderItems)
        .where(eq(purchaseOrderItems.orderId, input.orderId))
        .orderBy(asc(purchaseOrderItems.id));
    }),

  salvarPedido: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        fornecedorNome: z.string().trim().min(2).max(256),
        descricao: z.string().trim().min(3).max(512),
        valorTotal: z.number().nonnegative().max(9_999_999_999_999.99),
        prazoEntrega: dataStr.optional(),
        vinculo: z.string().trim().max(256).optional(),
        funilId: z.number().int().positive().optional(),
        observacoes: z.string().trim().max(4000).optional(),
        itens: orderItemsSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      const orderId = await db.transaction(async (tx) => {
        const values = {
          fornecedorNome: input.fornecedorNome,
          descricao: input.descricao,
          valorTotal: String(input.valorTotal),
          prazoEntrega: parseDia(input.prazoEntrega),
          vinculo: input.vinculo,
          funilId: input.funilId,
          observacoes: input.observacoes,
          criadoPor: actorLabel(ctx.user),
        };

        let id = input.id;
        if (id) {
          const result = await tx
            .update(purchaseOrders)
            .set(values)
            .where(eq(purchaseOrders.id, id));
          if (affectedRows(result) !== 1) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
          }
          if (input.itens) {
            await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, id));
          }
        } else {
          const result = await tx.insert(purchaseOrders).values(values);
          id = insertId(result);
          if (!id) throw new Error("Falha ao criar pedido.");
        }

        if (input.itens?.length) {
          await tx.insert(purchaseOrderItems).values(
            input.itens.map((item) => ({
              orderId: id!,
              descricao: item.descricao,
              quantidade: String(item.quantidade),
              precoUnit: String(item.precoUnit),
            })),
          );
        }
        return id;
      });

      await recordAudit({
        userId: ctx.user.id,
        action: input.id ? "purchase_order_update" : "purchase_order_create",
        entity: "purchase_orders",
        entityId: orderId,
        origin: "pos_venda",
        summary: `${input.id ? "Pedido atualizado" : "Pedido criado"}: ${input.descricao}`,
        changes: { valorTotal: input.valorTotal, funilId: input.funilId ?? null },
      });
      await advanceOpportunityFromEvidence(
        input.funilId,
        "entrega",
        `[PEDIDO #${orderId}] pedido de compra registrado`,
        actorLabel(ctx.user),
      );
      return { id: orderId };
    }),

  mudarStatusPedido: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["solicitado", "confirmado", "faturado", "enviado", "recebido", "divergente", "cancelado"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [current] = await db
        .select({ status: purchaseOrders.status, funilId: purchaseOrders.funilId })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, input.id))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      if (current.status === input.status) return { ok: true, semMudanca: true };

      const result = await db
        .update(purchaseOrders)
        .set({ status: input.status })
        .where(and(eq(purchaseOrders.id, input.id), eq(purchaseOrders.status, current.status)));
      if (affectedRows(result) !== 1) {
        throw new TRPCError({ code: "CONFLICT", message: "O pedido foi alterado por outro processo." });
      }

      await recordAudit({
        userId: ctx.user.id,
        action: "purchase_order_status_change",
        entity: "purchase_orders",
        entityId: input.id,
        origin: "pos_venda",
        summary: `Status do pedido: ${current.status} → ${input.status}`,
        changes: { before: current.status, after: input.status },
      });
      if (input.status !== "cancelado") {
        await advanceOpportunityFromEvidence(
          current.funilId,
          input.status === "recebido" ? "faturamento" : "entrega",
          `[PEDIDO #${input.id}] status ${input.status}`,
          actorLabel(ctx.user),
        );
      }
      return { ok: true, semMudanca: false };
    }),

  criarPedidoDeProposta: editorProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const funilId = await resolveProposalOpportunity(input.proposalId);

      const orderId = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT ${proposals.id} FROM ${proposals} WHERE ${proposals.id} = ${input.proposalId} FOR UPDATE`,
        );

        const [proposal] = await tx
          .select({
            id: proposals.id,
            title: proposals.title,
            orgName: proposals.orgName,
            processNumber: proposals.processNumber,
            status: proposals.status,
          })
          .from(proposals)
          .where(eq(proposals.id, input.proposalId))
          .limit(1);
        if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada." });
        if (!["order", "in_transit", "delivered"].includes(proposal.status)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Pedido de compra exige proposta em execução. Status atual: ${proposal.status}.`,
          });
        }

        const [existing] = await tx
          .select({ id: purchaseOrders.id })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.proposalId, input.proposalId))
          .limit(1);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Já existe um pedido de compra para esta proposta (#${existing.id}).`,
          });
        }

        const items = await tx
          .select({
            productName: proposalItems.productName,
            supplierName: proposalItems.supplierName,
            quantity: proposalItems.quantity,
            costPrice: proposalItems.costPrice,
            unitPrice: proposalItems.unitPrice,
          })
          .from(proposalItems)
          .where(eq(proposalItems.proposalId, input.proposalId))
          .orderBy(asc(proposalItems.sortOrder), asc(proposalItems.itemNumber));
        if (items.length === 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Proposta sem itens." });
        }

        const normalized = items.map((item, index) => {
          const cost = Number(item.costPrice ?? item.unitPrice ?? 0);
          const quantity = Number(item.quantity ?? 0);
          if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: `Item ${index + 1} da proposta está sem custo/quantidade válida.`,
            });
          }
          return { ...item, cost, quantity };
        });

        const supplierNames = [
          ...new Set(
            normalized
              .map((item) => item.supplierName?.trim())
              .filter((value): value is string => Boolean(value)),
          ),
        ];
        const totalCost = normalized.reduce((sum, item) => sum + item.cost * item.quantity, 0);
        const result = await tx.insert(purchaseOrders).values({
          proposalId: input.proposalId,
          funilId: funilId ?? undefined,
          fornecedorNome: supplierNames.length ? supplierNames.join(" / ").slice(0, 256) : "A definir",
          descricao: `Compra p/ atender proposta: ${proposal.title}${proposal.orgName ? ` (${proposal.orgName})` : ""}`.slice(0, 512),
          valorTotal: totalCost.toFixed(2),
          vinculo: proposal.processNumber ?? undefined,
          observacoes: `Gerado automaticamente a partir da proposta #${proposal.id}.`,
          criadoPor: actorLabel(ctx.user),
        });
        const id = insertId(result);
        if (!id) throw new Error("Falha ao criar pedido de compra.");

        await tx.insert(purchaseOrderItems).values(
          normalized.map((item) => ({
            orderId: id,
            descricao: item.productName,
            quantidade: String(item.quantity),
            precoUnit: item.cost.toFixed(4),
          })),
        );
        return id;
      });

      await recordAudit({
        userId: ctx.user.id,
        action: "purchase_order_from_proposal",
        entity: "purchase_orders",
        entityId: orderId,
        origin: "proposal",
        summary: `Pedido #${orderId} criado a partir da proposta #${input.proposalId}`,
        changes: { proposalId: input.proposalId, funilId },
      });
      await advanceOpportunityFromEvidence(
        funilId,
        "entrega",
        `[PEDIDO #${orderId}] criado a partir da proposta #${input.proposalId}`,
        actorLabel(ctx.user),
      );
      return { id: orderId };
    }),

  entregas: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(deliveries).orderBy(desc(deliveries.createdAt)).limit(200);
  }),

  salvarEntrega: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        descricao: z.string().trim().min(3).max(512),
        transportadora: z.string().trim().max(128).optional(),
        rastreio: z.string().trim().max(128).optional(),
        previsao: dataStr.optional(),
        entregueEm: dataStr.optional(),
        recebedor: z.string().trim().max(128).optional(),
        status: z.enum(["preparando", "transito", "entregue", "atrasada", "devolvida"]).optional(),
        orderId: z.number().int().positive().optional(),
        funilId: z.number().int().positive().optional(),
        observacoes: z.string().trim().max(4000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      let funilId = input.funilId;
      if (input.orderId) {
        const [order] = await db
          .select({ funilId: purchaseOrders.funilId, status: purchaseOrders.status })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, input.orderId))
          .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido vinculado não encontrado." });
        if (order.status === "cancelado") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pedido cancelado não pode receber entrega." });
        }
        if (input.funilId && order.funilId && input.funilId !== order.funilId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A oportunidade informada diverge da oportunidade vinculada ao pedido.",
          });
        }
        funilId = order.funilId ?? input.funilId;
      }

      const status = input.status ?? ("preparando" as const);
      const deliveredAt =
        status === "entregue"
          ? parseDia(input.entregueEm) ?? new Date()
          : parseDia(input.entregueEm);
      if (status !== "entregue" && input.entregueEm) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Data de entrega só pode ser informada quando o status for entregue.",
        });
      }

      const values = {
        descricao: input.descricao,
        transportadora: input.transportadora,
        rastreio: input.rastreio,
        previsao: parseDia(input.previsao),
        entregueEm: deliveredAt,
        recebedor: input.recebedor,
        status,
        orderId: input.orderId,
        funilId,
        observacoes: input.observacoes,
      };

      let id = input.id;
      if (id) {
        const result = await db.update(deliveries).set(values).where(eq(deliveries.id, id));
        if (affectedRows(result) !== 1) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Entrega não encontrada." });
        }
      } else {
        const result = await db.insert(deliveries).values(values);
        id = insertId(result);
        if (!id) throw new Error("Falha ao criar entrega.");
      }

      await recordAudit({
        userId: ctx.user.id,
        action: input.id ? "delivery_update" : "delivery_create",
        entity: "deliveries",
        entityId: id,
        origin: "pos_venda",
        summary: `${input.id ? "Entrega atualizada" : "Entrega criada"}: ${input.descricao}`,
        changes: { orderId: input.orderId ?? null, funilId: funilId ?? null, status: values.status },
      });
      await advanceOpportunityFromEvidence(
        funilId,
        values.status === "entregue" ? "faturamento" : "entrega",
        `[ENTREGA #${id}] status ${values.status}`,
        actorLabel(ctx.user),
      );
      return { id };
    }),

  notas: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(salesInvoices).orderBy(desc(salesInvoices.createdAt)).limit(300);
  }),

  salvarNota: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        numero: z.string().trim().min(1).max(64),
        orgao: z.string().trim().min(2).max(256),
        valorBruto: z.number().positive().max(9_999_999_999_999.99),
        retencoes: z.number().nonnegative().max(9_999_999_999_999.99).optional(),
        dataEmissao: dataStr,
        vencimento: dataStr.optional(),
        recebidoEm: dataStr.optional(),
        status: z.enum(["emitida", "atestada", "liquidada", "paga", "cancelada"]).optional(),
        funilId: z.number().int().positive().optional(),
        observacoes: z.string().trim().max(4000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const retencoes = input.retencoes ?? 0;
      if (retencoes > input.valorBruto) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Retenções não podem superar o valor bruto da nota.",
        });
      }
      const status = input.status ?? ("emitida" as const);
      if (status === "cancelada" && input.recebidoEm) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "NF cancelada não pode possuir data de recebimento.",
        });
      }
      const receivedAt =
        status === "paga" ? parseDia(input.recebidoEm) ?? new Date() : parseDia(input.recebidoEm);

      const values = {
        numero: input.numero,
        orgao: input.orgao,
        valorBruto: String(input.valorBruto),
        retencoes: String(retencoes),
        dataEmissao: parseDia(input.dataEmissao)!,
        vencimento: parseDia(input.vencimento),
        recebidoEm: receivedAt,
        status,
        funilId: input.funilId,
        observacoes: input.observacoes,
      };

      let id = input.id;
      if (id) {
        const result = await db.update(salesInvoices).set(values).where(eq(salesInvoices.id, id));
        if (affectedRows(result) !== 1) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
        }
      } else {
        const result = await db.insert(salesInvoices).values(values);
        id = insertId(result);
        if (!id) throw new Error("Falha ao registrar nota fiscal.");
      }

      await recordAudit({
        userId: ctx.user.id,
        action: input.id ? "sales_invoice_update" : "sales_invoice_create",
        entity: "sales_invoices",
        entityId: id,
        origin: "financeiro",
        summary: `NF ${input.numero} — ${input.orgao}`,
        changes: { valorBruto: input.valorBruto, retencoes, funilId: input.funilId ?? null },
      });
      await advanceOpportunityFromEvidence(
        input.funilId,
        values.status === "paga" ? "recebimento" : "faturamento",
        `[NF #${id}] status ${values.status}`,
        actorLabel(ctx.user),
      );
      return { id };
    }),

  marcarNotaPaga: editorProcedure
    .input(z.object({ id: z.number().int().positive(), recebidoEm: dataStr.optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [current] = await db
        .select({ status: salesInvoices.status, recebidoEm: salesInvoices.recebidoEm, funilId: salesInvoices.funilId })
        .from(salesInvoices)
        .where(eq(salesInvoices.id, input.id))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada." });
      if (current.status === "cancelada") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "NF cancelada não pode ser baixada como recebida." });
      }
      if (current.recebidoEm) return { ok: true, jaRecebida: true };

      const receivedAt = parseDia(input.recebidoEm) ?? new Date();
      const result = await db
        .update(salesInvoices)
        .set({ status: "paga", recebidoEm: receivedAt })
        .where(and(eq(salesInvoices.id, input.id), isNull(salesInvoices.recebidoEm), ne(salesInvoices.status, "cancelada")));
      if (affectedRows(result) !== 1) {
        throw new TRPCError({ code: "CONFLICT", message: "A NF foi alterada por outro processo." });
      }

      await recordAudit({
        userId: ctx.user.id,
        action: "sales_invoice_paid",
        entity: "sales_invoices",
        entityId: input.id,
        origin: "financeiro",
        summary: "Recebimento de NF confirmado",
        changes: { receivedAt: receivedAt.toISOString() },
      });
      await advanceOpportunityFromEvidence(
        current.funilId,
        "recebimento",
        `[NF #${input.id}] recebimento confirmado`,
        actorLabel(ctx.user),
      );
      return { ok: true, jaRecebida: false };
    }),

  contasPagar: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(payables).orderBy(desc(payables.vencimento)).limit(300);
  }),

  salvarContaPagar: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        descricao: z.string().trim().min(3).max(512),
        credor: z.string().trim().max(256).optional(),
        categoria: z.enum(["fornecedor", "frete", "imposto", "taxa", "despesa"]).optional(),
        valor: z.number().positive().max(9_999_999_999_999.99),
        vencimento: dataStr,
        orderId: z.number().int().positive().optional(),
        observacoes: z.string().trim().max(4000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      if (input.orderId) {
        const [order] = await db
          .select({ id: purchaseOrders.id, status: purchaseOrders.status })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.id, input.orderId))
          .limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido vinculado não encontrado." });
        if (order.status === "cancelado") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pedido cancelado não pode gerar conta a pagar." });
        }
      }

      const values = {
        descricao: input.descricao,
        credor: input.credor,
        categoria: input.categoria ?? ("fornecedor" as const),
        valor: String(input.valor),
        vencimento: parseDia(input.vencimento)!,
        orderId: input.orderId,
        observacoes: input.observacoes,
      };

      let id = input.id;
      if (id) {
        const result = await db.update(payables).set(values).where(eq(payables.id, id));
        if (affectedRows(result) !== 1) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conta a pagar não encontrada." });
        }
      } else {
        const result = await db.insert(payables).values(values);
        id = insertId(result);
        if (!id) throw new Error("Falha ao registrar conta a pagar.");
      }

      await recordAudit({
        userId: ctx.user.id,
        action: input.id ? "payable_update" : "payable_create",
        entity: "payables",
        entityId: id,
        origin: "financeiro",
        summary: input.descricao,
        changes: { valor: input.valor, vencimento: input.vencimento, orderId: input.orderId ?? null },
      });
      return { id };
    }),

  marcarContaPaga: editorProcedure
    .input(z.object({ id: z.number().int().positive(), pagoEm: dataStr.optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const [current] = await db
        .select({ pagoEm: payables.pagoEm })
        .from(payables)
        .where(eq(payables.id, input.id))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Conta a pagar não encontrada." });
      if (current.pagoEm) return { ok: true, jaPaga: true };

      const paidAt = parseDia(input.pagoEm) ?? new Date();
      const result = await db
        .update(payables)
        .set({ pagoEm: paidAt })
        .where(and(eq(payables.id, input.id), isNull(payables.pagoEm)));
      if (affectedRows(result) !== 1) {
        throw new TRPCError({ code: "CONFLICT", message: "A conta foi alterada por outro processo." });
      }

      await recordAudit({
        userId: ctx.user.id,
        action: "payable_paid",
        entity: "payables",
        entityId: input.id,
        origin: "financeiro",
        summary: "Pagamento confirmado",
        changes: { paidAt: paidAt.toISOString() },
      });
      return { ok: true, jaPaga: false };
    }),

  fluxoCaixa: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        aReceber: 0,
        aPagar: 0,
        saldoProjetado: 0,
        atrasadosReceber: 0,
        atrasadosPagar: 0,
        porMes: [] as FluxoMes[],
      };
    }

    const invoiceMonth = sql<string>`DATE_FORMAT(COALESCE(${salesInvoices.vencimento}, CURRENT_DATE), '%Y-%m')`;
    const payableMonth = sql<string>`DATE_FORMAT(${payables.vencimento}, '%Y-%m')`;

    const [invoiceTotals, payableTotals, invoiceMonths, payableMonths] = await Promise.all([
      db
        .select({
          total: sql<number>`COALESCE(SUM(CAST(${salesInvoices.valorBruto} AS DECIMAL(18,2)) - CAST(COALESCE(${salesInvoices.retencoes}, 0) AS DECIMAL(18,2))), 0)`,
          overdue: sql<number>`COALESCE(SUM(CASE WHEN ${salesInvoices.vencimento} < CURRENT_DATE THEN CAST(${salesInvoices.valorBruto} AS DECIMAL(18,2)) - CAST(COALESCE(${salesInvoices.retencoes}, 0) AS DECIMAL(18,2)) ELSE 0 END), 0)`,
        })
        .from(salesInvoices)
        .where(and(isNull(salesInvoices.recebidoEm), ne(salesInvoices.status, "cancelada"))),
      db
        .select({
          total: sql<number>`COALESCE(SUM(CAST(${payables.valor} AS DECIMAL(18,2))), 0)`,
          overdue: sql<number>`COALESCE(SUM(CASE WHEN ${payables.vencimento} < CURRENT_DATE THEN CAST(${payables.valor} AS DECIMAL(18,2)) ELSE 0 END), 0)`,
        })
        .from(payables)
        .where(isNull(payables.pagoEm)),
      db
        .select({
          mes: invoiceMonth,
          receber: sql<number>`SUM(CAST(${salesInvoices.valorBruto} AS DECIMAL(18,2)) - CAST(COALESCE(${salesInvoices.retencoes}, 0) AS DECIMAL(18,2)))`,
        })
        .from(salesInvoices)
        .where(and(isNull(salesInvoices.recebidoEm), ne(salesInvoices.status, "cancelada")))
        .groupBy(invoiceMonth),
      db
        .select({
          mes: payableMonth,
          pagar: sql<number>`SUM(CAST(${payables.valor} AS DECIMAL(18,2)))`,
        })
        .from(payables)
        .where(isNull(payables.pagoEm))
        .groupBy(payableMonth),
    ]);

    const aReceber = Number(invoiceTotals[0]?.total ?? 0);
    const aPagar = Number(payableTotals[0]?.total ?? 0);
    const meses = new Map<string, { receber: number; pagar: number }>();
    for (const row of invoiceMonths) {
      meses.set(row.mes, { receber: Number(row.receber ?? 0), pagar: 0 });
    }
    for (const row of payableMonths) {
      const current = meses.get(row.mes) ?? { receber: 0, pagar: 0 };
      current.pagar = Number(row.pagar ?? 0);
      meses.set(row.mes, current);
    }

    const porMes: FluxoMes[] = [...meses.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, values]) => ({
        mes,
        receber: Math.round(values.receber * 100) / 100,
        pagar: Math.round(values.pagar * 100) / 100,
        saldo: Math.round((values.receber - values.pagar) * 100) / 100,
      }));

    return {
      aReceber: Math.round(aReceber * 100) / 100,
      aPagar: Math.round(aPagar * 100) / 100,
      saldoProjetado: Math.round((aReceber - aPagar) * 100) / 100,
      atrasadosReceber: Math.round(Number(invoiceTotals[0]?.overdue ?? 0) * 100) / 100,
      atrasadosPagar: Math.round(Number(payableTotals[0]?.overdue ?? 0) * 100) / 100,
      porMes,
    };
  }),
});

interface FluxoMes {
  mes: string;
  receber: number;
  pagar: number;
  saldo: number;
}
