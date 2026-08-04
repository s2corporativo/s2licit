import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, eq, isNull } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getProposalWithItems } from "../db";
import {
  deliveries,
  payables,
  purchaseOrderItems,
  purchaseOrders,
  salesInvoices,
} from "../../drizzle/schema";

/**
 * Pós-venda (spec §20-23): pedidos de compra a fornecedores, entregas,
 * notas fiscais de venda (contas a receber), contas a pagar e fluxo de
 * caixa projetado. Fluxo real: vencer a disputa → comprar → entregar →
 * faturar → receber → medir o lucro de verdade.
 */

const dataStr = z.string(); // yyyy-mm-dd
const parseDia = (s?: string | null) => (s ? new Date(`${s}T12:00:00`) : undefined);

export const posVendaRouter = router({
  // ── Pedidos de compra ──────────────────────────────────────────────────
  pedidos: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt)).limit(200);
    return rows;
  }),

  pedidoItens: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, input.orderId));
    }),

  salvarPedido: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        fornecedorNome: z.string().min(2).max(256),
        descricao: z.string().min(3).max(512),
        valorTotal: z.number().nonnegative(),
        prazoEntrega: dataStr.optional(),
        vinculo: z.string().max(256).optional(),
        funilId: z.number().int().positive().optional(),
        observacoes: z.string().max(4000).optional(),
        itens: z
          .array(
            z.object({
              descricao: z.string().min(1).max(512),
              quantidade: z.number().positive(),
              precoUnit: z.number().nonnegative(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const valores = {
        fornecedorNome: input.fornecedorNome,
        descricao: input.descricao,
        valorTotal: String(input.valorTotal),
        prazoEntrega: parseDia(input.prazoEntrega),
        vinculo: input.vinculo,
        funilId: input.funilId,
        observacoes: input.observacoes,
        criadoPor: ctx.user?.name ?? ctx.user?.email ?? "sistema",
      };
      let orderId: number;
      if (input.id) {
        await db.update(purchaseOrders).set(valores).where(eq(purchaseOrders.id, input.id));
        orderId = input.id;
        if (input.itens) {
          await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.orderId, orderId));
        }
      } else {
        const [res] = await db.insert(purchaseOrders).values(valores);
        orderId = Number((res as any).insertId);
      }
      if (input.itens && input.itens.length > 0) {
        await db.insert(purchaseOrderItems).values(
          input.itens.map((i) => ({
            orderId,
            descricao: i.descricao,
            quantidade: String(i.quantidade),
            precoUnit: String(i.precoUnit),
          })),
        );
      }
      return { id: orderId };
    }),

  mudarStatusPedido: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["solicitado", "confirmado", "faturado", "enviado", "recebido", "divergente", "cancelado"]),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      await db.update(purchaseOrders).set({ status: input.status }).where(eq(purchaseOrders.id, input.id));
      return { ok: true };
    }),

  /**
   * Cria o pedido de compra a partir da proposta vencedora — fecha o ciclo
   * proposta → pedido em 1 clique, herdando itens/fornecedor/valor em vez
   * de o operador digitar tudo de novo (achado do inventário: purchase_orders
   * não tinha nenhum vínculo com a proposta que o originou).
   */
  criarPedidoDeProposta: protectedProcedure
    .input(z.object({ proposalId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");

      const proposal = await getProposalWithItems(input.proposalId);
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada." });
      if (proposal.items.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Proposta sem itens." });
      }

      const [existing] = await db
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

      // Custo ao fornecedor (não o preço de venda ao comprador): costPrice
      // explícito, ou unitPrice (custo do sistema) como fallback.
      const fornecedoresUnicos = [
        ...new Set(proposal.items.map((i) => i.supplierName).filter((s): s is string => Boolean(s?.trim()))),
      ];
      const fornecedorNome = fornecedoresUnicos.length > 0 ? fornecedoresUnicos.join(" / ") : "A definir";
      const custoTotal = proposal.items.reduce((sum, i) => {
        const custo = Number(i.costPrice ?? i.unitPrice ?? 0);
        const qtd = Number(i.quantity ?? 0);
        return sum + (Number.isFinite(custo) && Number.isFinite(qtd) ? custo * qtd : 0);
      }, 0);

      const [res] = await db.insert(purchaseOrders).values({
        proposalId: input.proposalId,
        fornecedorNome,
        descricao: `Compra p/ atender proposta: ${proposal.title}${proposal.orgName ? ` (${proposal.orgName})` : ""}`,
        valorTotal: String(custoTotal.toFixed(2)),
        vinculo: proposal.processNumber ?? undefined,
        observacoes: `Gerado automaticamente a partir da proposta #${proposal.id}.`,
        criadoPor: ctx.user?.name ?? ctx.user?.email ?? "sistema",
      });
      const orderId = Number((res as any).insertId);

      await db.insert(purchaseOrderItems).values(
        proposal.items.map((i) => ({
          orderId,
          descricao: i.productName,
          quantidade: String(i.quantity ?? 1),
          precoUnit: String(Number(i.costPrice ?? i.unitPrice ?? 0).toFixed(4)),
        })),
      );

      return { id: orderId };
    }),

  // ── Entregas ───────────────────────────────────────────────────────────
  entregas: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(deliveries).orderBy(desc(deliveries.createdAt)).limit(200);
  }),

  salvarEntrega: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        descricao: z.string().min(3).max(512),
        transportadora: z.string().max(128).optional(),
        rastreio: z.string().max(128).optional(),
        previsao: dataStr.optional(),
        entregueEm: dataStr.optional(),
        recebedor: z.string().max(128).optional(),
        status: z.enum(["preparando", "transito", "entregue", "atrasada", "devolvida"]).optional(),
        orderId: z.number().int().positive().optional(),
        funilId: z.number().int().positive().optional(),
        observacoes: z.string().max(4000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const valores = {
        descricao: input.descricao,
        transportadora: input.transportadora,
        rastreio: input.rastreio,
        previsao: parseDia(input.previsao),
        entregueEm: parseDia(input.entregueEm),
        recebedor: input.recebedor,
        status: input.status ?? ("preparando" as const),
        orderId: input.orderId,
        funilId: input.funilId,
        observacoes: input.observacoes,
      };
      if (input.id) {
        await db.update(deliveries).set(valores).where(eq(deliveries.id, input.id));
        return { id: input.id };
      }
      const [res] = await db.insert(deliveries).values(valores);
      return { id: Number((res as any).insertId) };
    }),

  // ── Notas fiscais de venda (contas a receber) ──────────────────────────
  notas: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(salesInvoices).orderBy(desc(salesInvoices.createdAt)).limit(300);
  }),

  salvarNota: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        numero: z.string().min(1).max(64),
        orgao: z.string().min(2).max(256),
        valorBruto: z.number().positive(),
        retencoes: z.number().nonnegative().optional(),
        dataEmissao: dataStr,
        vencimento: dataStr.optional(),
        recebidoEm: dataStr.optional(),
        status: z.enum(["emitida", "atestada", "liquidada", "paga", "cancelada"]).optional(),
        funilId: z.number().int().positive().optional(),
        observacoes: z.string().max(4000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const valores = {
        numero: input.numero,
        orgao: input.orgao,
        valorBruto: String(input.valorBruto),
        retencoes: String(input.retencoes ?? 0),
        dataEmissao: parseDia(input.dataEmissao)!,
        vencimento: parseDia(input.vencimento),
        recebidoEm: parseDia(input.recebidoEm),
        status: input.status ?? ("emitida" as const),
        funilId: input.funilId,
        observacoes: input.observacoes,
      };
      if (input.id) {
        await db.update(salesInvoices).set(valores).where(eq(salesInvoices.id, input.id));
        return { id: input.id };
      }
      const [res] = await db.insert(salesInvoices).values(valores);
      return { id: Number((res as any).insertId) };
    }),

  marcarNotaPaga: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), recebidoEm: dataStr.optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      await db
        .update(salesInvoices)
        .set({ status: "paga", recebidoEm: parseDia(input.recebidoEm) ?? new Date() })
        .where(eq(salesInvoices.id, input.id));
      return { ok: true };
    }),

  // ── Contas a pagar ─────────────────────────────────────────────────────
  contasPagar: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(payables).orderBy(desc(payables.vencimento)).limit(300);
  }),

  salvarContaPagar: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        descricao: z.string().min(3).max(512),
        credor: z.string().max(256).optional(),
        categoria: z.enum(["fornecedor", "frete", "imposto", "taxa", "despesa"]).optional(),
        valor: z.number().positive(),
        vencimento: dataStr,
        orderId: z.number().int().positive().optional(),
        observacoes: z.string().max(4000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const valores = {
        descricao: input.descricao,
        credor: input.credor,
        categoria: input.categoria ?? ("fornecedor" as const),
        valor: String(input.valor),
        vencimento: parseDia(input.vencimento)!,
        orderId: input.orderId,
        observacoes: input.observacoes,
      };
      if (input.id) {
        await db.update(payables).set(valores).where(eq(payables.id, input.id));
        return { id: input.id };
      }
      const [res] = await db.insert(payables).values(valores);
      return { id: Number((res as any).insertId) };
    }),

  marcarContaPaga: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), pagoEm: dataStr.optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      await db
        .update(payables)
        .set({ pagoEm: parseDia(input.pagoEm) ?? new Date() })
        .where(eq(payables.id, input.id));
      return { ok: true };
    }),

  // ── Fluxo de caixa projetado ───────────────────────────────────────────
  fluxoCaixa: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { aReceber: 0, aPagar: 0, saldoProjetado: 0, atrasadosReceber: 0, atrasadosPagar: 0, porMes: [] as FluxoMes[] };
    const notas = await db.select().from(salesInvoices).where(isNull(salesInvoices.recebidoEm));
    const contas = await db.select().from(payables).where(isNull(payables.pagoEm));
    const hoje = new Date();
    let aReceber = 0, aPagar = 0, atrasadosReceber = 0, atrasadosPagar = 0;
    const meses = new Map<string, { receber: number; pagar: number }>();
    const mesDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    for (const n of notas) {
      if (n.status === "cancelada") continue;
      const liquido = Number(n.valorBruto) - Number(n.retencoes);
      aReceber += liquido;
      const venc = n.vencimento ? new Date(n.vencimento) : null;
      if (venc && venc < hoje) atrasadosReceber += liquido;
      const chave = mesDe(venc ?? hoje);
      const m = meses.get(chave) ?? { receber: 0, pagar: 0 };
      m.receber += liquido;
      meses.set(chave, m);
    }
    for (const c of contas) {
      const valor = Number(c.valor);
      aPagar += valor;
      const venc = new Date(c.vencimento);
      if (venc < hoje) atrasadosPagar += valor;
      const chave = mesDe(venc);
      const m = meses.get(chave) ?? { receber: 0, pagar: 0 };
      m.pagar += valor;
      meses.set(chave, m);
    }
    const porMes: FluxoMes[] = [...meses.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({ mes, receber: Math.round(v.receber * 100) / 100, pagar: Math.round(v.pagar * 100) / 100, saldo: Math.round((v.receber - v.pagar) * 100) / 100 }));

    return {
      aReceber: Math.round(aReceber * 100) / 100,
      aPagar: Math.round(aPagar * 100) / 100,
      saldoProjetado: Math.round((aReceber - aPagar) * 100) / 100,
      atrasadosReceber: Math.round(atrasadosReceber * 100) / 100,
      atrasadosPagar: Math.round(atrasadosPagar * 100) / 100,
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
