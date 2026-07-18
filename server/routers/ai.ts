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
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { aiUsageDaily } from "../../drizzle/schema";
import { getAiConfigView, saveAiConfig } from "../services/aiConfigService";
import { recordAudit } from "../services/auditService";

/**
 * Central de IA: status dos provedores, teste de conexão e consumo
 * (persistido em `ai_usage_daily` — sobrevive a restart e traz custo estimado).
 */
export const aiRouter = router({
  status: protectedProcedure.query(() => {
    const active = activeProvider();
    return {
      preferido: ENV.aiProvider, // "auto" | "anthropic" | "groq"
      ativo: active ? { kind: active.kind, model: active.model } : null,
      configurados: listConfiguredProviders(),
      algumConfigurado: active != null,
      consumo: getUsageTotals(),
      cotacaoUsdBrl: usdBrlRate(),
    };
  }),

  /** Consumo acumulado (histórico persistido) + últimos 30 dias por dia. */
  consumo: protectedProcedure.query(async () => {
    const db = await getDb();
    const rate = usdBrlRate();
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
      porProvedor: porProvedor.map((p) => ({
        ...p,
        chamadas: Number(p.chamadas),
        promptTokens: Number(p.promptTokens),
        completionTokens: Number(p.completionTokens),
        custoUsd: Number(p.custoUsd),
        custoBrl: Number(p.custoUsd) * rate,
      })),
      ultimosDias: ultimosDias.map((d) => ({
        ...d,
        chamadas: Number(d.chamadas),
        promptTokens: Number(d.promptTokens),
        completionTokens: Number(d.completionTokens),
        custoUsd: Number(d.custoUsd),
        custoBrl: Number(d.custoUsd) * rate,
      })),
      cotacaoUsdBrl: rate,
    };
  }),

  /** Configuração de chaves/preferências de IA para a tela (admin). */
  getConfig: adminProcedure.query(() => getAiConfigView()),

  /** Salva chaves/preferências de IA vindas da interface (admin). */
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
      })
    )
    .mutation(async ({ input, ctx }) => {
      await saveAiConfig(input);
      await recordAudit({
        userId: ctx.user?.id,
        action: "ai_config_save",
        entity: "ai_settings",
        summary: "Configuração de IA (chaves/provedor) atualizada pela interface",
      });
      return { ok: true };
    }),

  /** Testa o provedor ativo com um prompt mínimo (admin). */
  testar: adminProcedure
    .input(z.object({ prompt: z.string().max(500).optional() }).optional())
    .mutation(async ({ input }) => {
      const active = activeProvider();
      if (!active) {
        return { ok: false as const, erro: "Nenhum provedor de IA configurado." };
      }
      try {
        const result = await invokeLLM({
          messages: [
            { role: "user", content: input?.prompt || "Responda apenas: OK" },
          ],
        });
        const content = result.choices?.[0]?.message?.content;
        const texto = typeof content === "string" ? content : JSON.stringify(content);
        return {
          ok: true as const,
          provedor: active.kind,
          model: active.model,
          resposta: texto.slice(0, 500),
        };
      } catch (err) {
        return { ok: false as const, provedor: active.kind, erro: (err as Error).message };
      }
    }),
});
