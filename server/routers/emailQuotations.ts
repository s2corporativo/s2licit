import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { adminProcedure, editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { emailQuotationItems, emailQuotations } from "../../drizzle/schema";
import { isImapConfigured } from "../services/emailInboxService";
import {
  getEmailQuotationWithItems,
  listEmailQuotations,
  syncEmailQuotations,
} from "../services/emailQuotationSyncService";
import { buildQuotationResponse } from "../services/emailQuotationResponseService";
import { isSmtpConfigured, sendEmail } from "../services/emailSenderService";
import { ensureOpportunityFromQuotation } from "../services/opportunityWorkflowService";

const EmailQuotationStatusSchema = z.enum([
  "nova",
  "processando",
  "revisao",
  "respondida",
  "descartada",
  "erro",
]);

/**
 * Cotações recebidas por e-mail (COTEP/Compras MG, FUNARB, COPASA, Cemig...).
 */
export const emailQuotationsRouter = router({
  status: protectedProcedure.query(async () => {
    const [imapConfigured, smtpConfigured] = await Promise.all([
      isImapConfigured(),
      isSmtpConfigured(),
    ]);
    return { imapConfigured, smtpConfigured };
  }),

  sync: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(25) }).optional())
    .mutation(({ input }) => syncEmailQuotations({ limit: input?.limit })),

  list: protectedProcedure
    .input(z.object({ status: EmailQuotationStatusSchema.optional() }).optional())
    .query(({ input }) => listEmailQuotations(input?.status)),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const data = await getEmailQuotationWithItems(input.id);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
      return data;
    }),

  setItemMatch: editorProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        produtoMatchId: z.number().int().positive().nullable(),
        precoSugerido: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
      await db
        .update(emailQuotationItems)
        .set({
          produtoMatchId: input.produtoMatchId,
          matchMethod: "manual",
          matchConfirmado: input.produtoMatchId != null,
          precoSugerido: input.precoSugerido ?? undefined,
        })
        .where(eq(emailQuotationItems.id, input.itemId));
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
      if (!(await isSmtpConfigured())) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "SMTP não configurado. Cadastre servidor, usuário e senha na Central de Integrações.",
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

      const delivery = await sendEmail({
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
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `E-mail enviado (${delivery.messageId}), mas o banco ficou indisponível antes de registrar o status. Não reenvie sem verificar o destinatário.`,
        });
      }
      await db
        .update(emailQuotations)
        .set({ status: "respondida" })
        .where(eq(emailQuotations.id, input.id));

      return {
        success: true as const,
        to: destinatario,
        messageId: delivery.messageId,
        itemCount: response.itemCount,
        funilId: opportunity.id,
      };
    }),

  setPrazo: editorProcedure
    .input(z.object({ id: z.number().int().positive(), prazoResposta: z.string().nullable() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
      const prazoResposta = input.prazoResposta ? new Date(input.prazoResposta) : null;
      if (prazoResposta && Number.isNaN(prazoResposta.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Prazo de resposta inválido." });
      }
      await db
        .update(emailQuotations)
        .set({ prazoResposta })
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
      for (const quotation of rows) {
        if (!quotation.prazoResposta || quotation.status === "respondida" || quotation.status === "descartada") continue;
        const dias = Math.floor((new Date(quotation.prazoResposta).getTime() - hoje) / msPorDia);
        if (dias < 0) vencidos.push(quotation);
        else if (dias <= diasAlerta) proximos.push(quotation);
      }
      return { vencidos, proximos };
    }),

  setStatus: editorProcedure
    .input(z.object({ id: z.number().int().positive(), status: EmailQuotationStatusSchema }))
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
