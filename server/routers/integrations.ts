import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  getIntegrationView,
  INTEGRATION_KEYS,
  removeIntegrationSetting,
  saveIntegrationSettings,
} from "../services/integrationSettingsService";
import { recordAudit } from "../services/auditService";

async function refreshSchedules(): Promise<void> {
  const { refreshRuntimeSchedules } = await import("../services/scheduledJobs");
  await refreshRuntimeSchedules();
}

/**
 * Central administrativa de integrações. IA e e-mail mantêm formulários
 * especializados, mas toda resolução de credenciais usa a mesma plataforma.
 */
export const integrationsRouter = router({
  get: adminProcedure.query(() => getIntegrationView()),

  save: adminProcedure
    .input(z.record(z.string().max(64), z.string().max(2048)))
    .mutation(async ({ input, ctx }) => {
      await saveIntegrationSettings(input);
      await refreshSchedules();
      await recordAudit({
        userId: ctx.user?.id,
        action: "integration_config_save",
        entity: "integration_settings",
        summary: `Credenciais/parâmetros de integração atualizados pela interface (${Object.keys(input).filter((key) => input[key]).length} chave(s))`,
      });
      return { ok: true };
    }),

  /** Remove somente o override do banco e restaura o fallback original da instalação. */
  remove: adminProcedure
    .input(z.object({ chave: z.string().max(64).refine((key) => key in INTEGRATION_KEYS, "Chave não permitida") }))
    .mutation(async ({ input, ctx }) => {
      await removeIntegrationSetting(input.chave);
      await refreshSchedules();
      await recordAudit({
        userId: ctx.user?.id,
        action: "integration_config_remove",
        entity: "integration_settings",
        summary: `Override de integração removido: ${input.chave}.`,
      });
      return { ok: true };
    }),

  testarWhatsapp: adminProcedure.mutation(async () => {
    const { isWhatsappConfigured, enviarWhatsapp } = await import("../services/whatsappService");
    if (!(await isWhatsappConfigured())) {
      return {
        ok: false as const,
        detalhe:
          "WhatsApp não configurado: preencha (ID do telefone + token + destino) para a Meta Cloud API, ou (webhook + destino) para provedor próprio.",
      };
    }
    try {
      const enviado = await enviarWhatsapp(
        "✅ Teste do Sistema S2: o canal de WhatsApp está configurado e funcionando.",
      );
      return enviado
        ? { ok: true as const, detalhe: "Mensagem de teste enviada — confira o WhatsApp de destino." }
        : { ok: false as const, detalhe: "O provedor não aceitou o envio. Verifique token, número e permissões." };
    } catch (err) {
      return { ok: false as const, detalhe: (err as Error).message };
    }
  }),
});
