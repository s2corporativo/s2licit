import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { activeProvider, invokeLLM, listConfiguredProviders } from "../_core/llm";
import { ENV } from "../_core/env";

/**
 * Central de IA: status dos provedores e teste de conexão.
 */
export const aiRouter = router({
  status: protectedProcedure.query(() => {
    const active = activeProvider();
    return {
      preferido: ENV.aiProvider, // "auto" | "anthropic" | "groq"
      ativo: active ? { kind: active.kind, model: active.model } : null,
      configurados: listConfiguredProviders(),
      algumConfigurado: active != null,
    };
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
