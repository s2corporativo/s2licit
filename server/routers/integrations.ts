import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import {
  getIntegrationView,
  saveIntegrationSettings,
} from "../services/integrationSettingsService";
import { recordAudit } from "../services/auditService";

/**
 * Central de integrações: credenciais de WhatsApp e parâmetros gerais
 * configurados pela interface (IA e e-mail têm routers próprios; a tela
 * unificada monta as três seções juntas).
 */
export const integrationsRouter = router({
  get: adminProcedure.query(() => getIntegrationView()),

  save: adminProcedure
    .input(z.record(z.string().max(64), z.string().max(2048)))
    .mutation(async ({ input, ctx }) => {
      await saveIntegrationSettings(input);
      await recordAudit({
        userId: ctx.user?.id,
        action: "integration_config_save",
        entity: "integration_settings",
        summary: `Credenciais de integração atualizadas pela interface (${Object.keys(input).filter((k) => input[k]).length} chave(s))`,
      });
      return { ok: true };
    }),

  /** Envia uma mensagem de teste real pelo canal WhatsApp configurado. */
  testarWhatsapp: adminProcedure.mutation(async () => {
    const { isWhatsappConfigured, enviarWhatsapp } = await import("../services/whatsappService");
    if (!isWhatsappConfigured()) {
      return {
        ok: false as const,
        detalhe:
          "WhatsApp não configurado: preencha (ID do telefone + token + destino) para a Meta Cloud API, ou (webhook + destino) para provedor próprio, e salve antes de testar.",
      };
    }
    try {
      const enviado = await enviarWhatsapp(
        "✅ Teste do Sistema S2: o canal de WhatsApp está configurado e funcionando."
      );
      return enviado
        ? { ok: true as const, detalhe: "Mensagem de teste enviada — confira o WhatsApp de destino." }
        : { ok: false as const, detalhe: "O provedor não aceitou o envio. Verifique token, número e permissões." };
    } catch (err) {
      return { ok: false as const, detalhe: (err as Error).message };
    }
  }),
});
