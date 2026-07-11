/**
 * Radar de oportunidades — PNCP (Portal Nacional de Contratações Públicas).
 *
 * Reaproveita o connector robusto server/connectors/pncpConnector (backoff,
 * rate limit, logging em api_logs) que estava presente mas desconectado.
 * A consulta pública do PNCP não exige autenticação (dados abertos).
 *
 * Fluxo: busca licitações de um período, filtra por palavras-chave no objeto
 * e permite abrir os itens de uma licitação específica para cruzar com o
 * catálogo de produtos.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  buscarItensPNCP,
  buscarLicitacoesMultiModalidade,
  normalizePncpLicitacao,
} from "../connectors/pncpConnector";
import type { NormalizedLicitacao } from "../connectors/baseConnector";

function toDateStr(d: Date): string {
  // PNCP espera AAAAMMDD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function matchesKeywords(lic: NormalizedLicitacao, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const haystack = `${lic.objeto} ${lic.descricaoDetalhada}`.toLowerCase();
  return keywords.some((k) => haystack.includes(k.toLowerCase()));
}

const BuscarSchema = z.object({
  // Palavras-chave (ex.: "medicamento", "seringa", "amoxicilina"). Vazio = tudo.
  keywords: z.array(z.string().min(2)).max(20).default([]),
  // Janela de datas; padrão: últimos 7 dias.
  diasAtras: z.number().int().min(1).max(90).default(7),
  uf: z.string().length(2).optional(),
  pagina: z.number().int().positive().default(1),
  // Modalidades PNCP (8 = pregão eletrônico, 6 = concorrência eletrônica).
  modalidades: z.array(z.number().int()).max(6).default([8, 6]),
});

const ItensSchema = z.object({
  cnpj: z.string().min(14).max(14),
  ano: z.number().int().min(2020).max(2100),
  sequencial: z.number().int().positive(),
});

export const pncpRadarRouter = router({
  /**
   * Busca oportunidades no PNCP filtradas por palavra-chave e UF.
   */
  buscarOportunidades: protectedProcedure
    .input(BuscarSchema)
    .query(async ({ input }) => {
      const now = new Date();
      const inicio = new Date(now);
      inicio.setDate(inicio.getDate() - input.diasAtras);

      const { data, totalRegistros, totalPaginas } = await buscarLicitacoesMultiModalidade(
        toDateStr(inicio),
        toDateStr(now),
        input.pagina,
        input.modalidades,
      );

      const uf = input.uf?.toUpperCase();
      const oportunidades = data
        .map(normalizePncpLicitacao)
        .filter((lic) => matchesKeywords(lic, input.keywords))
        .filter((lic) => (uf ? lic.uf.toUpperCase() === uf : true));

      return {
        totalRegistros,
        totalPaginas,
        pagina: input.pagina,
        encontradas: oportunidades.length,
        oportunidades,
      };
    }),

  /**
   * Lista os itens de uma licitação específica (para cruzar com o catálogo).
   */
  itensDaLicitacao: protectedProcedure
    .input(ItensSchema)
    .query(async ({ input }) => {
      const itens = await buscarItensPNCP(input.cnpj, input.ano, input.sequencial);
      return { total: itens.length, itens };
    }),
});
