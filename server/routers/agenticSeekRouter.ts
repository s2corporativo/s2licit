/**
 * agenticSeekRouter.ts
 * Rotas tRPC do módulo AgenticSeek (prospecção automatizada de licitações).
 *
 * Rotas:
 * - iniciar          [protected] Dispara uma nova busca por objetivo
 * - historico        [protected] Lista as buscas executadas
 * - status           [protected] Status + contadores de uma busca
 * - resultados       [protected] Resultados de uma busca (com filtros)
 * - exportarCsv      [protected] Resultados em CSV para download
 * - enviarParaFunil  [admin]  Envia um resultado validado ao funil
 * - cancelar         [protected] Cancela uma busca pendente/em execução (dono)
 *
 * Autorização: toda restrição existe também no backend (protectedProcedure/
 * adminProcedure). Nada público, nada sensível nas respostas.
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import {
  iniciarBusca,
  statusBusca,
  resultadosBusca,
  historicoBuscas,
  enviarParaFunil,
  cancelarBusca,
  toCSV,
} from "../services/agenticSeekService";

const IniciarSchema = z.object({
  // Objetivo em linguagem natural: "Encontre indústrias em Betim que abriram
  // licitação em 90 dias". Mín. 10 / máx. 4000 caracteres (validado no serviço).
  objetivo: z.string().min(10).max(4000),
  keywords: z.array(z.string().min(2).max(80)).max(20).optional(),
  uf: z.string().length(2).optional(),
  municipio: z.string().max(128).optional(),
  diasAtras: z.number().int().min(1).max(90).default(30),
  modalidades: z.array(z.number().int().min(1).max(99)).max(6).default([8, 6]),
  maxPaginas: z.number().int().min(1).max(10).optional(),
});

export const agenticSeekRouter = router({
  /** Dispara uma busca e devolve o id para acompanhamento por polling. */
  iniciar: protectedProcedure.input(IniciarSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user?.id;
    if (!userId) throw new Error("Sessão de usuário indisponível.");
    return iniciarBusca(userId, input);
  }),

  historico: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user?.id;
    if (!userId) throw new Error("Sessão de usuário indisponível.");
    return historicoBuscas(userId);
  }),

  status: protectedProcedure
    .input(z.object({ buscaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new Error("Sessão de usuário indisponível.");
      return statusBusca(input.buscaId, userId);
    }),

  resultados: protectedProcedure
    .input(
      z.object({
        buscaId: z.number().int().positive(),
        minScore: z.number().int().min(0).max(100).optional(),
        onlyValidadas: z.boolean().default(false),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new Error("Sessão de usuário indisponível.");
      return resultadosBusca(input.buscaId, userId, {
        minScore: input.minScore,
        onlyValidadas: input.onlyValidadas,
        limit: input.limit,
      });
    }),

  exportarCsv: protectedProcedure
    .input(z.object({ buscaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new Error("Sessão de usuário indisponível.");
      const { resultados: rows } = await resultadosBusca(input.buscaId, userId, { limit: 500 });
      return toCSV(rows);
    }),

  enviarParaFunil: adminProcedure
    .input(
      z.object({
        buscaId: z.number().int().positive(),
        resultadoId: z.number().int().positive(),
        responsavel: z.string().max(128).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return enviarParaFunil(input.buscaId, input.resultadoId, input.responsavel);
    }),

  cancelar: protectedProcedure
    .input(z.object({ buscaId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new Error("Sessão de usuário indisponível.");
      return cancelarBusca(input.buscaId, userId);
    }),
});
