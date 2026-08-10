import { z } from "zod";
import { desc, sql } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  getUsageTotals,
  invokeLLM,
  listConfiguredProviders,
  usdBrlRate,
  type LlmProviderKind,
} from "../_core/llm";
import { getDb } from "../db";
import { aiUsageDaily } from "../../drizzle/schema";
import { getAiConfigView, resetAiConfig, saveAiConfig } from "../services/aiConfigService";
import { recordAudit } from "../services/auditService";

function selectedConfiguredProvider(
  preference: string,
  configured: Array<{ kind: LlmProviderKind; model: string }>,
): { kind: LlmProviderKind; model: string } | null {
  if (preference === "anthropic" || preference === "groq" || preference === "forge") {
    return configured.find((provider) => provider.kind === preference) ?? null;
  }
  return configured[0] ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const aiRouter = router({
  status: protectedProcedure.query(async () => {
    const [configured, rate, config] = await Promise.all([
      listConfiguredProviders(),
      usdBrlRate(),
      getAiConfigView(),
    ]);
    const active = selectedConfiguredProvider(config.aiProvider, configured);
    return {
      preferido: config.aiProvider,
      ativo: active,
      configurados: configured,
      algumConfigurado: configured.length > 0,
      consumo: getUsageTotals(),
      cotacaoUsdBrl: rate,
    };
  }),

  consumo: protectedProcedure.query(async () => {
    const db = await getDb();
    const rate = await usdBrlRate();
    if (!db) {
      return { totais: null, porProvedor: [], ultimosDias: [], cotacaoUsdBrl: rate };
    }
    const [totais] = await db
      .select({
        chamadas: sql<number>`COALESCE(SUM(${aiUsageDaily.chamadas}), 0)`.mapWith(Number),
        promptTokens: sql<number>`COALESCE(SUM(${aiUsageDaily.promptTokens}), 0)`.mapWith(Number),
        completionTokens: sql<number>`COALESCE(SUM(${aiUsageDaily.completionTokens}), 0)`.mapWith(Number),
        custoUsd: sql<string>`COALESCE(SUM(${aiUsageDaily.custoUsd}), 0)`,
      })
      .from(aiUsageDaily);
    const porProvedor = await db
      .select({
        provider: aiUsageDaily.provider,
        model: aiUsageDaily.model,
        chamadas: sql<number>`SUM(${aiUsageDaily.chamadas})`.mapWith(Number),
        promptTokens: sql<number>`SUM(${aiUsageDaily.promptTokens})`.mapWith(Number),
        completionTokens: sql<number>`SUM(${aiUsageDaily.completionTokens})`.mapWith(Number),
        custoUsd: sql<string>`SUM(${aiUsageDaily.custoUsd})`,
      })
      .from(aiUsageDaily)
      .groupBy(aiUsageDaily.provider, aiUsageDaily.model);
    const ultimosDias = await db
      .select({
        dia: aiUsageDaily.dia,
        chamadas: sql<number>`SUM(${aiUsageDaily.chamadas})`.mapWith(Number),
        promptTokens: sql<number>`SUM(${aiUsageDaily.promptTokens})`.mapWith(Number),
        completionTokens: sql<number>`SUM(${aiUsageDaily.completionTokens})`.mapWith(Number),
        custoUsd: sql<string>`SUM(${aiUsageDaily.custoUsd})`,
      })
      .from(aiUsageDaily)
      .groupBy(aiUsageDaily.dia)
      .orderBy(desc(aiUsageDaily.dia))
      .limit(30);
    const custoUsdTotal = Number(totais?.custoUsd ?? 0);
    return {
      totais: totais
        ? {
            chamadas: totais.chamadas,
            promptTokens: totais.promptTokens,
            completionTokens: totais.completionTokens,
            custoUsd: custoUsdTotal,
            custoBrl: custoUsdTotal * rate,
          }
        : null,
      porProvedor: porProvedor.map((provider) => ({
        ...provider,
        custoUsd: Number(provider.custoUsd),
        custoBrl: Number(provider.custoUsd) * rate,
      })),
      ultimosDias: ultimosDias.map((day) => ({
        ...day,
        custoUsd: Number(day.custoUsd),
        custoBrl: Number(day.custoUsd) * rate,
      })),
      cotacaoUsdBrl: rate,
    };
  }),

  getConfig: adminProcedure.query(() => getAiConfigView()),

  saveConfig: adminProcedure
    .input(
      z.object({
        aiProvider: z.enum(["auto", "anthropic", "groq"]).optional(),
        anthropicApiKey: z.string().max(512).optional().nullable(),
        anthropicModel: z.string().max(128).optional().nullable(),
        groqApiKey: z.string().max(512).optional().nullable(),
        groqModel: z.string().max(128).optional().nullable(),
        forgeApiUrl: z.string().max(512).optional().nullable(),
        forgeApiKey: z.string().max(512).optional().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await saveAiConfig(input);
      await recordAudit({
        userId: ctx.user?.id,
        action: "ai_config_save",
        entity: "ai_settings",
        summary: "Configuração de IA atualizada pela Central de Integrações",
      });
      return { ok: true };
    }),

  resetConfig: adminProcedure.mutation(async ({ ctx }) => {
    await resetAiConfig();
    await recordAudit({
      userId: ctx.user?.id,
      action: "ai_config_reset",
      entity: "ai_settings",
      summary: "Overrides de IA removidos; configuração padrão da instalação restaurada",
    });
    return { ok: true };
  }),

  testar: adminProcedure
    .input(z.object({ prompt: z.string().max(500).optional() }).optional())
    .mutation(async ({ input }) => {
      const [configured, config] = await Promise.all([
        listConfiguredProviders(),
        getAiConfigView(),
      ]);
      const active = selectedConfiguredProvider(config.aiProvider, configured);
      if (!active) {
        return {
          ok: false as const,
          erro: config.aiProvider === "auto"
            ? "Nenhum provedor de IA configurado."
            : `O provedor preferido (${config.aiProvider}) não possui credencial efetiva.`,
        };
      }
      try {
        const result = await invokeLLM({
          provider: active.kind,
          allowProviderFallback: false,
          messages: [{ role: "user", content: input?.prompt || "Responda apenas: OK" }],
          maxTokens: 64,
        });
        const content = result.choices[0]?.message.content;
        const texto = typeof content === "string" ? content : JSON.stringify(content ?? "");
        return {
          ok: true as const,
          provedor: active.kind,
          model: result.model || active.model,
          resposta: texto.slice(0, 500),
        };
      } catch (error) {
        return { ok: false as const, provedor: active.kind, erro: errorMessage(error) };
      }
    }),
});
