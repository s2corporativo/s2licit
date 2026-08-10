import { z } from "zod";
import { logger } from "../_core/logger";
import { adminProcedure, router } from "../_core/trpc";
import { recordAudit } from "../services/auditService";
import {
  getIntegrationView,
  INTEGRATION_KEYS,
  removeIntegrationSetting,
  saveIntegrationSettings,
} from "../services/integrationSettingsService";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function refreshSchedulesSafely(): Promise<string | null> {
  try {
    const { refreshRuntimeSchedules } = await import("../services/scheduledJobs");
    await refreshRuntimeSchedules();
    return null;
  } catch (error) {
    const detail = errorMessage(error);
    logger.error("[Integrations] Configuração persistida, mas refresh dos agendamentos falhou:", detail);
    return `Configuração salva, porém os agendamentos atuais não puderam ser recarregados: ${detail}`;
  }
}

async function auditSafely(input: {
  userId?: number;
  action: string;
  summary: string;
}): Promise<string | null> {
  try {
    await recordAudit({
      userId: input.userId,
      action: input.action,
      entity: "integration_settings",
      summary: input.summary,
    });
    return null;
  } catch (error) {
    const detail = errorMessage(error);
    logger.error("[Integrations] Configuração persistida, mas auditoria falhou:", detail);
    return `Configuração salva, porém o registro de auditoria falhou: ${detail}`;
  }
}

/**
 * Central administrativa de integrações. IA e e-mail mantêm formulários
 * especializados, mas toda resolução de credenciais usa a mesma plataforma.
 *
 * Persistência é a fronteira transacional. Efeitos pós-commit (audit/refresh)
 * são reportados como avisos em vez de produzir falso rollback na API.
 */
export const integrationsRouter = router({
  get: adminProcedure.query(() => getIntegrationView()),

  save: adminProcedure
    .input(z.record(z.string().max(64), z.string().max(2048)))
    .mutation(async ({ input, ctx }) => {
      await saveIntegrationSettings(input);
      const changedKeys = Object.keys(input).filter((key) => input[key]?.trim());
      const warnings = (
        await Promise.all([
          auditSafely({
            userId: ctx.user?.id,
            action: "integration_config_save",
            summary: `Credenciais/parâmetros de integração atualizados pela interface (${changedKeys.length} chave(s))`,
          }),
          refreshSchedulesSafely(),
        ])
      ).filter((warning): warning is string => Boolean(warning));

      return {
        ok: true as const,
        applied: changedKeys.length,
        warnings,
      };
    }),

  /** Remove somente o override do banco e restaura o fallback original da instalação. */
  remove: adminProcedure
    .input(z.object({
      chave: z.string().max(64).refine((key) => key in INTEGRATION_KEYS, "Chave não permitida"),
    }))
    .mutation(async ({ input, ctx }) => {
      await removeIntegrationSetting(input.chave);
      const warnings = (
        await Promise.all([
          auditSafely({
            userId: ctx.user?.id,
            action: "integration_config_remove",
            summary: `Override de integração removido: ${input.chave}.`,
          }),
          refreshSchedulesSafely(),
        ])
      ).filter((warning): warning is string => Boolean(warning));

      return { ok: true as const, warnings };
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
    } catch (error) {
      return { ok: false as const, detalhe: errorMessage(error) };
    }
  }),
});
