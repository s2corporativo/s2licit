import { z } from "zod";
import { desc, sql } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  activeProvider,
  getUsageTotals,
  invokeLLM,
  listConfiguredProviders,
  usdBrlRate,
} from "../_core/llm";
import { getDb } from "../db";
import { aiUsageDaily } from "../../drizzle/schema";
import { getAiConfigView, resetAiConfig, saveAiConfig } from "../services/aiConfigService";
import { recordAudit } from "../services/auditService";

export const aiRouter = router({
  status: protectedProcedure.query(async () => {
    const [active, configured, rate, config] = await Promise.all([
      activeProvider(),
      listConfiguredProviders(),
      usdBrlRate(),
      getAiConfigView(),
    ]);
    return {
      preferido: config.aiProvider,
      ativo: active ? { kind: active.kind, model: active.model } : null,
      configurados: configured,
      algumConfigurado: active != null,
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
        chamadas: sql<number>`COALESCE(SUM(${aiUsageDaily.chamadas}), 0)`,
        promptTokens: sql<number>`COALESCE(SUM(${aiUsageDaily.promptTokens}), 0)`,
        completionTokens: sql<number>`COALESCE(SUM(${aiUsageDaily.completionTokens}), 0)`,
        custoUsd: sql<string>`COALESCE(SUM(${aiUsageDaily.custoUsd}), 0)`,
      })
      .from(aiUsageDaily);
    const porProvedor = await db
      .select({
        provider: aiUsageDaily.provider,
        model: aiUsageDaily.model,
        chamadas: sql<number>`SUM(${aiUsageDaily.chamadas})`,
        promptTokens: sql<number>`SUM(${aiUsageDaily.promptTokens})`,
        completionTokens: sql<number>`SUM(${aiUsageDaily.completionTokens})`,
        custoUsd: sql<string>`SUM(${aiUsageDaily.custoUsd})`,
      })
      .from(aiUsageDaily)
      .groupBy(aiUsageDaily.provider, aiUsageDaily.model);
    const ultimosDias = await db
      .select({
        dia: aiUsageDaily.dia,
        chamadas: sql<number>`SUM(${aiUsageDaily.chamadas})`,
        promptTokens: sql<number>`SUM(${aiUsageDaily.promptTokens})`,
        completionTokens: sql<number>`SUM(${aiUsageDaily.completionTokens})`,
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
            chamadas: Number(totais.chamadas),
            promptTokens: Number(totais.promptTokens),
            completionTokens: Number(totais.completionTokens),
            custoUsd: custoUsdTotal,
            custoBrl: custoUsdTotal * rate,
          }
        : null,
      porProvedor: porProvedor.map((provider) => ({
        ...provider,
        chamadas: Number(provider.chamadas),
        promptTokens: Number(provider.promptTokens),
        completionTokens: Number(provider.completionTokens),
        custoUsd: Number(provider.custoUsd),
        custoBrl: Number(provider.custoUsd) * rate,
      })),
      ultimosDias: ultimosDias.map((day) => ({
        ...day,
        chamadas: Number(day.chamadas),
        promptTokens: Number(day.promptTokens),
        completionTokens: Number(day.completionTokens),
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
      const active = await activeProvider();
      if (!active) return { ok: false as const, erro: "Nenhum provedor de IA configurado." };
      try {
        const result = await invokeLLM({
          messages: [{ role: "user", content: input?.prompt || "Responda apenas: OK" }],
          maxTokens: 64,
        });
        const content = result.choices?.[0]?.message?.content;
        const texto = typeof content === "string" ? content : JSON.stringify(content);
        return {
          ok: true as const,
          provedor: active.kind,
          model: result.model || active.model,
          resposta: texto.slice(0, 500),
        };
      } catch (err) {
        return { ok: false as const, provedor: active.kind, erro: (err as Error).message };
      }
    }),
});
