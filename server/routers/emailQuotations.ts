import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { emailQuotationItems, emailQuotations } from "../../drizzle/schema";
import { isImapConfigured } from "../services/emailInboxService";
import {
  getEmailQuotationWithItems,
  listEmailQuotations,
  syncEmailQuotations,
} from "../services/emailQuotationSyncService";

/**
 * Cotações recebidas por e-mail (COTEP/Compras MG, FUNARB, COPASA, Cemig...).
 */
export const emailQuotationsRouter = router({
  /** Status da configuração IMAP (para a UI mostrar orientação). */
  status: protectedProcedure.query(() => ({
    imapConfigured: isImapConfigured(),
  })),

  /** Dispara a sincronização da caixa de entrada (somente admin). */
  sync: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).optional())
    .mutation(async ({ input }) => {
      return syncEmailQuotations({ limit: input?.limit });
    }),

  /** Lista cotações recebidas (opcionalmente por status). */
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
    .query(async ({ input }) => {
      return listEmailQuotations(input?.status);
    }),

  /** Detalhe de uma cotação com seus itens. */
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const data = await getEmailQuotationWithItems(input.id);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada." });
      return data;
    }),

  /** Confirma (ou corrige) o produto associado a um item. */
  setItemMatch: protectedProcedure
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

  /** Atualiza o status de uma cotação (ex.: marcar como respondida/descartada). */
  setStatus: protectedProcedure
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
