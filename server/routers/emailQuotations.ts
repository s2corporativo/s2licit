import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { adminProcedure, editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { auditLogs, emailQuotationItems, emailQuotations, products } from "../../drizzle/schema";
import { isImapConfigured } from "../services/emailInboxService";
import {
  getEmailQuotationWithItems,
  listEmailQuotations,
  syncEmailQuotations,
} from "../services/emailQuotationSyncService";
import {
  buildQuotationResponse,
  previewQuotationPricing,
} from "../services/emailQuotationResponseService";
import { setQuotationItemSalePrice } from "../services/quotationItemPricingService";
import { isSmtpConfigured, sendEmail } from "../services/emailSenderService";
import { ensureOpportunityFromQuotation } from "../services/opportunityWorkflowService";
import { prepareProposalFromQuotation } from "../services/quotationPortalHandoffService";
import { suggestSimilarItems } from "../services/emailQuotationSimilarService";
import {
  autoConfirmThreshold,
  isAutoPipelineEnabled,
  isAutoSendEnabled,
  runAutoPipelineForPending,
  runAutoPipelineForQuotation,
} from "../services/quotationAutoPipelineService";
import { sendQuotationDailyReport } from "../services/quotationDailyReportService";

/** Cotações recebidas por e-mail/portais e precificação operacional. */
export const emailQuotationsRouter = router({
  status: protectedProcedure.query(() => ({
    imapConfigured: isImapConfigured(),
    smtpConfigured: isSmtpConfigured(),
    autoPipelineEnabled: isAutoPipelineEnabled(),
    autoSendEnabled: isAutoSendEnabled(),
    autoConfirmThreshold: autoConfirmThreshold(),
  })),

  autoPipeline: adminProcedure
    .input(
      z
        .object({
          quotationId: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional(),
    )
    .mutation(async ({ input }) => {
      const enabled = isAutoPipelineEnabled();
      if (input?.quotationId) {
        if (!enabled) {
          return {
            enabled,
            processed: 0,
            autoConfirmedItems: 0,
            proposalsGenerated: 0,
            sent: 0,
            blocked: 0,
            errors: [] as string[],
            quotations: [],
          };
        }
        const one = await runAutoPipelineForQuotation(input.quotationId);
        return {
          enabled,
          processed: 1,
          autoConfirmedItems: one.autoConfirmedItems,
          proposalsGenerated: one.proposalGenerated ? 1 : 0,
          sent: one.sent ? 1 : 0,
          blocked: one.blockedReason ? 1 : 0,
          errors: [] as string[],
          quotations: [one],
        };
      }
      return runAutoPipelineForPending({ limit: input?.limit });
    }),

  prepararParaPortal: editorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => prepareProposalFromQuotation(input.id)),

  autoMatchAccuracy: protectedProcedure
    .input(z.object({ diasJanela: z.number().int().min(1).max(365).default(90) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { confirmados: 0, corrigidos: 0, taxaAcerto: null as number | null };
      const desde = new Date(Date.now() - (input?.diasJanela ?? 90) * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({ action: auditLogs.action, total: count() })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entity, "email_quotation_items"),
            gte(auditLogs.createdAt, desde),
            inArray(auditLogs.action, ["AUTO_MATCH_CONFIRMED", "AUTO_MATCH_CORRECTED"]),
          ),
        )
        .groupBy(auditLogs.action);
      const confirmados = rows.find((r) => r.action === "AUTO_MATCH_CONFIRMED")?.total ?? 0;
      const corrigidos = rows.find((r) => r.action === "AUTO_MATCH_CORRECTED")?.total ?? 0;
      const taxaAcerto = confirmados > 0
        ? Number((Math.max(0, (confirmados - corrigidos) / confirmados) * 100).toFixed(1))
        : null;
      return { confirmados, corrigidos, taxaAcerto };
    }),

  testarRelatorioDiario: adminProcedure
    .input(z.object({ destinatario: z.string().email().optional() }).optional())
    .mutation(async ({ input }) => sendQuotationDailyReport({ recipient: input?.destinatario })),

  sync: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).optional())
    .mutation(async ({ input }) => syncEmailQuotations({ limit: input?.limit })),

  list: protectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["nova", "processando", "revisao", "respondida", "descartada", "erro"])
            .optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => listEmailQuotations(input?.status)),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const data = await getEmailQuotationWithItems(input.id);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
      return data;
    }),

  /** Preview central: custo → venda → margem → total, inclusive preço manual. */
  pricingPreview: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        marginPercent: z.number().min(0).max(99.99).optional(),
      }),
    )
    .query(async ({ input }) => previewQuotationPricing(input.id, { marginPercent: input.marginPercent })),

  /**
   * Vincula/troca o produto e captura o preço atual do catálogo como custo.
   * A vinculação já é confirmação operacional do match; não há segunda etapa
   * obrigatória de "confirmar".
   */
  setItemMatch: editorProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        produtoMatchId: z.number().int().positive().nullable(),
        precoSugerido: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });

      const [current] = await db
        .select()
        .from(emailQuotationItems)
        .where(eq(emailQuotationItems.id, input.itemId))
        .limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Item de cotação não encontrado." });

      let resolvedCost = input.precoSugerido;
      if (resolvedCost === undefined && input.produtoMatchId != null) {
        const [product] = await db
          .select({ price: products.price })
          .from(products)
          .where(eq(products.id, input.produtoMatchId))
          .limit(1);
        resolvedCost = product?.price ?? null;
      }
      if (input.produtoMatchId == null) resolvedCost = null;

      const registrarCorrecao = current.matchAuto && current.produtoMatchId !== input.produtoMatchId;
      await db.transaction(async (tx) => {
        await tx
          .update(emailQuotationItems)
          .set({
            produtoMatchId: input.produtoMatchId,
            matchMethod: input.produtoMatchId != null ? "manual" : "nenhum",
            matchConfirmado: input.produtoMatchId != null,
            matchAuto: false,
            precoSugerido: resolvedCost,
          })
          .where(eq(emailQuotationItems.id, input.itemId));

        if (registrarCorrecao) {
          await tx.insert(auditLogs).values({
            userId: ctx.user?.id ?? null,
            action: "AUTO_MATCH_CORRECTED",
            entity: "email_quotation_items",
            entityId: input.itemId,
            origin: "system",
            summary: `Match automático corrigido pelo operador (produto ${current.produtoMatchId} → ${input.produtoMatchId})`,
            changes: { de: current.produtoMatchId, para: input.produtoMatchId } as any,
          });
        }
      });

      return { success: true, custoUnitario: resolvedCost ?? null };
    }),

  /** Define ou remove um preço de venda manual para o item. */
  setItemSalePrice: editorProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        salePrice: z.number().positive().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
      const [item] = await db
        .select({ id: emailQuotationItems.id })
        .from(emailQuotationItems)
        .where(eq(emailQuotationItems.id, input.itemId))
        .limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item de cotação não encontrado." });

      await setQuotationItemSalePrice(input.itemId, input.salePrice);
      await db.insert(auditLogs).values({
        userId: ctx.user?.id ?? null,
        action: input.salePrice == null ? "QUOTATION_SALE_PRICE_AUTO" : "QUOTATION_SALE_PRICE_MANUAL",
        entity: "email_quotation_items",
        entityId: input.itemId,
        origin: "user",
        summary: input.salePrice == null
          ? "Preço de venda voltou ao cálculo automático"
          : `Preço de venda manual definido em R$ ${input.salePrice.toFixed(2)}`,
        changes: { salePrice: input.salePrice } as any,
      });
      return { success: true };
    }),

  gerarOrcamento: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        marginPercent: z.number().min(0).max(99.99).optional(),
        validDays: z.number().int().positive().max(365).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await buildQuotationResponse(input.id, {
        marginPercent: input.marginPercent,
        validDays: input.validDays,
      });
      const opportunity = await ensureOpportunityFromQuotation(input.id, ctx.user);
      return {
        success: true as const,
        pdfUrl: `data:application/pdf;base64,${result.pdfBase64}`,
        total: result.total,
        itemCount: result.itemCount,
        itemsSemPreco: result.itemsSemPreco,
        marginPercent: result.marginPercent,
        effectiveMarginPercent: result.effectiveMarginPercent,
        categoryOverrides: result.categoryOverrides,
        manualPriceItems: result.manualPriceItems,
        funilId: opportunity.id,
      };
    }),

  responderPorEmail: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        to: z.string().email().optional(),
        marginPercent: z.number().min(0).max(99.99).optional(),
        validDays: z.number().int().positive().max(365).optional(),
        mensagem: z.string().max(4000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!isSmtpConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "SMTP não configurado. Defina SMTP_HOST, SMTP_USER e SMTP_PASSWORD.",
        });
      }

      const data = await getEmailQuotationWithItems(input.id);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });

      const destinatario = input.to ?? data.quotation.fromAddress ?? undefined;
      if (!destinatario) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sem destinatário: informe um e-mail (o remetente original não foi identificado).",
        });
      }

      const response = await buildQuotationResponse(input.id, {
        marginPercent: input.marginPercent,
        validDays: input.validDays,
      });
      const opportunity = await ensureOpportunityFromQuotation(input.id, ctx.user);
      const pdfBuffer = Buffer.from(response.pdfBase64, "base64");

      await sendEmail({
        to: destinatario,
        subject: `Proposta comercial - ${data.quotation.subject ?? `Cotação ${input.id}`}`,
        text:
          input.mensagem ??
          "Prezados,\n\nSegue em anexo nossa proposta comercial em resposta à solicitação de cotação.\n\nAtenciosamente.",
        attachments: [
          { filename: `orcamento-${input.id}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
        ],
      });

      const db = await getDb();
      if (db) {
        await db
          .update(emailQuotations)
          .set({ status: "respondida" })
          .where(eq(emailQuotations.id, input.id));
      }

      return {
        success: true as const,
        to: destinatario,
        itemCount: response.itemCount,
        funilId: opportunity.id,
      };
    }),

  setPrazo: editorProcedure
    .input(z.object({ id: z.number().int().positive(), prazoResposta: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
      await db
        .update(emailQuotations)
        .set({ prazoResposta: input.prazoResposta ? new Date(input.prazoResposta) : null })
        .where(eq(emailQuotations.id, input.id));
      return { success: true };
    }),

  prazosProximos: protectedProcedure
    .input(z.object({ diasAlerta: z.number().int().min(1).max(60).default(3) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { vencidos: [], proximos: [] };
      const diasAlerta = input?.diasAlerta ?? 3;
      const rows = await db.select().from(emailQuotations);
      const hoje = Date.now();
      const msPorDia = 24 * 60 * 60 * 1000;
      const vencidos: typeof rows = [];
      const proximos: typeof rows = [];
      for (const q of rows) {
        if (!q.prazoResposta || q.status === "respondida" || q.status === "descartada") continue;
        const dias = Math.floor((new Date(q.prazoResposta).getTime() - hoje) / msPorDia);
        if (dias < 0) vencidos.push(q);
        else if (dias <= diasAlerta) proximos.push(q);
      }
      return { vencidos, proximos };
    }),

  suggestSimilar: protectedProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .query(async ({ input }) => suggestSimilarItems(input.quotationId)),

  setStatus: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["nova", "processando", "revisao", "respondida", "descartada", "erro"]),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
      await db
        .update(emailQuotations)
        .set({ status: input.status })
        .where(eq(emailQuotations.id, input.id));
      return { success: true };
    }),
});
