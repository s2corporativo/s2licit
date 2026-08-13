import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  getEmailConfigView,
  saveEmailConfig,
  testImapConnection,
  testSmtpConnection,
} from "../services/emailConfigService";
import { recordAudit } from "../services/auditService";

/**
 * Configuração de e-mail (IMAP para receber cotações, SMTP para enviar)
 * pela interface — antes só era possível por variável de ambiente.
 */
export const emailConfigRouter = router({
  get: adminProcedure.query(() => getEmailConfigView()),

  save: adminProcedure
    .input(
      z.object({
        imapHost: z.string().max(256).optional().nullable(),
        imapPort: z.number().int().min(1).max(65535).optional().nullable(),
        imapUser: z.string().max(320).optional().nullable(),
        imapPassword: z.string().max(512).optional().nullable(),
        imapTls: z.boolean().optional(),
        imapMailbox: z.string().max(128).optional().nullable(),
        smtpHost: z.string().max(256).optional().nullable(),
        smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
        smtpUser: z.string().max(320).optional().nullable(),
        smtpPassword: z.string().max(512).optional().nullable(),
        smtpSecure: z.boolean().optional(),
        smtpFrom: z.string().max(320).optional().nullable(),
        senderFilter: z.string().max(4000).optional().nullable(),
        subjectKeywordFilter: z.string().max(4000).optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await saveEmailConfig(input);
      await recordAudit({
        userId: ctx.user?.id,
        action: "email_config_save",
        entity: "email_settings",
        summary: `Configuração de e-mail atualizada pela interface${input.senderFilter != null || input.subjectKeywordFilter != null ? "; filtros de seleção de e-mails atualizados" : ""}`,
      });
      return { ok: true };
    }),

  testar: adminProcedure
    .input(z.object({ tipo: z.enum(["imap", "smtp"]) }))
    .mutation(async ({ input }) =>
      input.tipo === "imap" ? testImapConnection() : testSmtpConnection()
    ),
});
