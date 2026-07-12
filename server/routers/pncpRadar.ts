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
  buscarResultadosItemPNCP,
  estatisticasPreco,
  normalizePncpLicitacao,
} from "../connectors/pncpConnector";
import { buscarLicitacoesComprasGov } from "../connectors/comprasGovConnector";
import { buscarLicitacoesFiemg } from "../connectors/fiemgConnector";
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

/** Fontes disponíveis no Radar. PNCP é a principal; as demais complementam. */
const FonteEnum = z.enum(["pncp", "comprasgov", "fiemg"]);

const BuscarSchema = z.object({
  // Palavras-chave (ex.: "medicamento", "seringa", "amoxicilina"). Vazio = tudo.
  keywords: z.array(z.string().min(2)).max(20).default([]),
  // Janela de datas; padrão: últimos 7 dias.
  diasAtras: z.number().int().min(1).max(90).default(7),
  uf: z.string().length(2).optional(),
  pagina: z.number().int().positive().default(1),
  // Modalidades PNCP (8 = pregão eletrônico, 6 = concorrência eletrônica).
  modalidades: z.array(z.number().int()).max(6).default([8, 6]),
  // Fontes a consultar. Padrão: todas. Fontes extras (comprasgov/fiemg) só são
  // consultadas na página 1 — o PNCP continua paginando normalmente.
  fontes: z.array(FonteEnum).min(1).default(["pncp", "comprasgov", "fiemg"]),
});

/** Rótulos legíveis das fontes para exibição/telemetria. */
const FONTE_LABEL: Record<string, string> = {
  pncp: "PNCP",
  comprasgov: "Compras.gov.br",
  fiemg: "Sistema S / FIEMG",
};

/** Deduplica mantendo a primeira ocorrência (PNCP tem prioridade na ordem). */
function dedupe(licitacoes: NormalizedLicitacao[]): NormalizedLicitacao[] {
  const vistos = new Set<string>();
  const saida: NormalizedLicitacao[] = [];
  for (const lic of licitacoes) {
    const chave = lic.dedupeKey || `${lic.source}:${lic.sourceId}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(lic);
  }
  return saida;
}

const ItensSchema = z.object({
  cnpj: z.string().min(14).max(14),
  ano: z.number().int().min(2020).max(2100),
  sequencial: z.number().int().positive(),
});

export const pncpRadarRouter = router({
  /**
   * Busca oportunidades em múltiplas fontes (PNCP + Compras.gov.br + FIEMG),
   * filtradas por palavra-chave e UF, com deduplicação.
   *
   * Cada fonte é consultada de forma isolada (Promise.allSettled): uma fonte
   * fora do ar ou lenta NUNCA derruba a busca — apenas contribui com zero e o
   * erro fica registrado em api_logs. As fontes complementares (Compras.gov.br
   * e FIEMG) só entram na página 1 para não conflitar com a paginação do PNCP.
   */
  buscarOportunidades: protectedProcedure
    .input(BuscarSchema)
    .query(async ({ input }) => {
      const now = new Date();
      const inicio = new Date(now);
      inicio.setDate(inicio.getDate() - input.diasAtras);
      const uf = input.uf?.toUpperCase();
      const fontes = new Set(input.fontes);
      const primeiraPagina = input.pagina === 1;

      // ── PNCP (fonte principal, paginada) ──
      const pncpPromise = fontes.has("pncp")
        ? buscarLicitacoesMultiModalidade(
            toDateStr(inicio),
            toDateStr(now),
            input.pagina,
            input.modalidades,
          )
        : Promise.resolve({ data: [], totalRegistros: 0, totalPaginas: 1 });

      // ── Compras.gov.br (complementar, só na página 1) ──
      const comprasPromise =
        fontes.has("comprasgov") && primeiraPagina
          ? buscarLicitacoesComprasGov(inicio, now, uf)
          : Promise.resolve([] as NormalizedLicitacao[]);

      // ── Sistema S / FIEMG (complementar, só na página 1) ──
      const fiemgPromise =
        fontes.has("fiemg") && primeiraPagina
          ? buscarLicitacoesFiemg(inicio, now)
          : Promise.resolve([] as NormalizedLicitacao[]);

      const [pncpRes, comprasRes, fiemgRes] = await Promise.allSettled([
        pncpPromise,
        comprasPromise,
        fiemgPromise,
      ]);

      const porFonte: Record<string, number> = {};
      const erros: string[] = [];

      // PNCP
      let totalRegistros = 0;
      let totalPaginas = 1;
      let pncpLicitacoes: NormalizedLicitacao[] = [];
      if (pncpRes.status === "fulfilled") {
        totalRegistros = pncpRes.value.totalRegistros;
        totalPaginas = pncpRes.value.totalPaginas;
        pncpLicitacoes = pncpRes.value.data.map(normalizePncpLicitacao);
      } else if (fontes.has("pncp")) {
        erros.push(`PNCP: ${String(pncpRes.reason).slice(0, 120)}`);
      }

      const comprasLicitacoes =
        comprasRes.status === "fulfilled" ? comprasRes.value : [];
      if (comprasRes.status === "rejected" && fontes.has("comprasgov")) {
        erros.push(`Compras.gov.br: ${String(comprasRes.reason).slice(0, 120)}`);
      }

      const fiemgLicitacoes = fiemgRes.status === "fulfilled" ? fiemgRes.value : [];
      if (fiemgRes.status === "rejected" && fontes.has("fiemg")) {
        erros.push(`FIEMG: ${String(fiemgRes.reason).slice(0, 120)}`);
      }

      // Ordem de merge define prioridade na deduplicação: PNCP primeiro.
      const todas = [...pncpLicitacoes, ...comprasLicitacoes, ...fiemgLicitacoes]
        .filter((lic) => matchesKeywords(lic, input.keywords))
        .filter((lic) => (uf ? lic.uf.toUpperCase() === uf : true));

      const oportunidades = dedupe(todas).sort((a, b) => {
        const ta = a.dataPublicacao ? a.dataPublicacao.getTime() : 0;
        const tb = b.dataPublicacao ? b.dataPublicacao.getTime() : 0;
        return tb - ta;
      });

      for (const lic of oportunidades) {
        porFonte[lic.source] = (porFonte[lic.source] ?? 0) + 1;
      }

      return {
        totalRegistros,
        totalPaginas,
        pagina: input.pagina,
        encontradas: oportunidades.length,
        oportunidades,
        // Telemetria por fonte para a UI mostrar a cobertura e sinalizar falhas.
        porFonte,
        fontesConsultadas: Array.from(fontes).map((f) => FONTE_LABEL[f] ?? f),
        erros,
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

  /**
   * Inteligência de preço: resultados homologados de um item (quem venceu e
   * por qual preço) + estatísticas (média, mínimo, máximo, mediana).
   */
  precoHomologado: protectedProcedure
    .input(ItensSchema.extend({ numeroItem: z.number().int().positive() }))
    .query(async ({ input }) => {
      const resultados = await buscarResultadosItemPNCP(
        input.cnpj,
        input.ano,
        input.sequencial,
        input.numeroItem,
      );
      return { resultados, estatisticas: estatisticasPreco(resultados) };
    }),
});
