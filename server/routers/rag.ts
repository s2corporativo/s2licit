/**
 * rag.ts — Router tRPC do Motor de Equivalências RAG.
 * ─────────────────────────────────────────────────────────────────────────────
 * Endpoints:
 *   - status        → configuração vigente + estatísticas do índice;
 *   - buscar        → busca de equivalências por descrição livre / TR;
 *   - reindexAll    → reindexação completa do catálogo (editorProcedure);
 *   - reindexOne    → reindexa um produto (após edição);
 *   - cleanOrphans  → limpa embeddings de produtos inativos;
 *   - config.get/set→ configuração (admin apenas para alterações).
 *
 * A busca (buscar) é protegida (protectedProcedure) — requer login, mas não
 * exige perfil editor, para que analistas consultem equivalências em cotações.
 */
import { z } from "zod";
import { adminProcedure, editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { buscarEquivalencias } from "../rag/search";
import { cleanOrphans, embeddingStats, reindexAll, reindexProduct } from "../rag/indexer";
import { getRagConfig, setRagConfigKey, updateRagConfig } from "../rag/ragConfig";

export const ragRouter = router({
  // ─── Consulta ─────────────────────────────────────────────────────────────
  status: protectedProcedure.query(async () => {
    const [config, stats] = await Promise.all([getRagConfig(), embeddingStats()]);
    return { config, stats };
  }),

  /** Busca equivalências por descrição livre ou texto de TR. */
  buscar: protectedProcedure
    .input(
      z.object({
        q: z.string().min(3).max(2000),
        tipoCatalogo: z
          .enum(["medicamento_veterinario", "medicamento_humano", "produto_nao_medicamentoso", "material_insumo_equipamento"])
          .optional(),
        topK: z.number().int().min(5).max(200).optional(),
        comJustificativa: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => buscarEquivalencias(input.q, input)),

  // ─── Indexação ────────────────────────────────────────────────────────────
  reindexAll: editorProcedure.mutation(async () => reindexAll()),

  reindexOne: editorProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .mutation(async ({ input }) => reindexProduct(input.productId)),

  cleanOrphans: editorProcedure.mutation(async () => cleanOrphans()),

  // ─── Configuração ─────────────────────────────────────────────────────────
  config: router({
    get: protectedProcedure.query(() => getRagConfig()),
    /**
     * Atualiza chaves de configuração. Apenas admin (ligar/desligar o motor e
     * trocar provedor de embedding é decisão de infraestrutura).
     */
    set: adminProcedure
      .input(
        z.object({
          values: z.record(z.string(), z.string().max(512)).refine(
            (v) => Object.keys(v).length > 0 && Object.keys(v).length <= 10,
            "Entre 1 e 10 chaves por chamada"
          ),
        })
      )
      .mutation(async ({ input }) => updateRagConfig(input.values)),

    /** Toggle rápido habilitado/desabilitado (admin). */
    toggle: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ input }) => {
        await setRagConfigKey("rag.enabled", input.enabled ? "true" : "false");
        return getRagConfig();
      }),
  }),
});
