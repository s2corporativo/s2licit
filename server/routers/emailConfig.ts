import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  getEmailConfigView,
  resetEmailConfig,
  saveEmailConfig,
  testImapConnection,
  testSmtpConnection,
} from "../services/emailConfigService";
import { recordAudit } from "../services/auditService";

/**
 * Configuração de e-mail (IMAP/SMTP) pela interface. Overrides persistidos
 * têm prioridade sobre a configuração de infraestrutura e podem ser removidos
 * explicitamente sem alterar process.env nem exigir redeploy.
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
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await saveEmailConfig(input);
      await recordAudit({
        userId: ctx.user?.id,
        action: "email_config_save",
        entity: "email_settings",
        summary: "Configuração de e-mail atualizada pela interface",
      });
      return { ok: true };
    }),

  reset: adminProcedure.mutation(async ({ ctx }) => {
    await resetEmailConfig();
    await recordAudit({
      userId: ctx.user?.id,
      action: "email_config_reset",
      entity: "email_settings",
      summary: "Overrides de e-mail removidos; configuração padrão da instalação restaurada",
    });
    return { ok: true };
  }),

  testar: adminProcedure
    .input(z.object({ tipo: z.enum(["imap", "smtp"]) }))
    .mutation(async ({ input }) =>
      input.tipo === "imap" ? testImapConnection() : testSmtpConnection(),
    ),
});
