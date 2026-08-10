/**
 * Radar de oportunidades multi-fonte.
 *
 * Regra de confiabilidade: NO_RESULTS significa consulta válida sem registros.
 * Falha, timeout, rate-limit e mudança de contrato são estados distintos e
 * aparecem explicitamente para a UI.
 */
import { z } from "zod";
import { editorProcedure, router } from "../_core/trpc";
import {
  buscarItensPNCP,
  buscarLicitacoesPNCP,
  buscarResultadosItemPNCP,
  estatisticasPreco,
  normalizePncpLicitacao,
} from "../connectors/pncpConnector";
import { buscarLicitacoesComprasGovResult } from "../connectors/comprasGovConnector";
import { buscarLicitacoesFiemgResult } from "../connectors/fiemgConnector";
import type { NormalizedLicitacao } from "../connectors/baseConnector";
import type { IntegrationResultStatus } from "../integrations/core/types";

function toDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function matchesKeywords(licitacao: NormalizedLicitacao, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const haystack = `${licitacao.objeto} ${licitacao.descricaoDetalhada}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

const FonteEnum = z.enum(["pncp", "comprasgov", "fiemg"]);
const BuscarSchema = z.object({
  keywords: z.array(z.string().min(2)).max(20).default([]),
  diasAtras: z.number().int().min(1).max(90).default(7),
  uf: z.string().length(2).optional(),
  pagina: z.number().int().positive().default(1),
  modalidades: z.array(z.number().int()).max(6).default([8, 6]),
  fontes: z.array(FonteEnum).min(1).default(["pncp", "comprasgov", "fiemg"]),
});

const FONTE_LABEL: Record<string, string> = {
  pncp: "PNCP",
  comprasgov: "Compras.gov.br",
  fiemg: "Sistema S / FIEMG",
};

function dedupe(licitacoes: NormalizedLicitacao[]): NormalizedLicitacao[] {
  const seen = new Set<string>();
  const output: NormalizedLicitacao[] = [];
  for (const licitacao of licitacoes) {
    const key = licitacao.dedupeKey || `${licitacao.source}:${licitacao.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(licitacao);
  }
  return output;
}

const ItensSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve conter 14 dígitos"),
  ano: z.number().int().min(2020).max(2100),
  sequencial: z.number().int().positive(),
});

type SourceStatus = {
  fonte: string;
  label: string;
  status: IntegrationResultStatus;
  encontradas: number;
  durationMs: number;
  detail: string | null;
  partial: boolean;
  requestId: string | null;
};

function detailForStatus(status: IntegrationResultStatus, error?: string): string | null {
  if (error) return error;
  if (status === "NO_RESULTS") return "Consulta concluída normalmente, sem oportunidades no período/filtro.";
  if (status === "PARTIAL") return "Fonte respondeu parcialmente; parte da cobertura pode estar indisponível.";
  if (status === "SUCCESS") return null;
  return "A fonte não pôde ser consultada com confiabilidade.";
}

export const pncpRadarRouter = router({
  buscarOportunidades: editorProcedure
    .input(BuscarSchema)
    .query(async ({ input }) => {
      const now = new Date();
      const inicio = new Date(now);
      inicio.setDate(inicio.getDate() - input.diasAtras);
      const uf = input.uf?.toUpperCase();
      const fontes = new Set(input.fontes);
      const primeiraPagina = input.pagina === 1;
      const statuses: SourceStatus[] = [];
      const all: NormalizedLicitacao[] = [];
      let totalRegistros = 0;
      let totalPaginas = 1;

      if (fontes.has("pncp")) {
        const startedAt = Date.now();
        const modalityResults = await Promise.allSettled(
          input.modalidades.map((modalidade) =>
            buscarLicitacoesPNCP(
              toDateStr(inicio),
              toDateStr(now),
              input.pagina,
              50,
              modalidade,
            ),
          ),
        );
        const failures = modalityResults.filter((result) => result.status === "rejected");
        const fulfilled = modalityResults.filter(
          (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof buscarLicitacoesPNCP>>> =>
            result.status === "fulfilled",
        );
        const pncpRaw = fulfilled.flatMap((result) => result.value.data);
        const pncpNormalized = dedupe(pncpRaw.map(normalizePncpLicitacao));
        all.push(...pncpNormalized);
        totalRegistros = fulfilled.reduce((sum, result) => sum + result.value.totalRegistros, 0);
        totalPaginas = Math.max(1, ...fulfilled.map((result) => result.value.totalPaginas));

        const status: IntegrationResultStatus =
          fulfilled.length === 0
            ? "UNAVAILABLE"
            : failures.length > 0
              ? "PARTIAL"
              : pncpNormalized.length === 0
                ? "NO_RESULTS"
                : "SUCCESS";
        const failureDetail = failures
          .map((result) => (result.status === "rejected" ? String(result.reason) : ""))
          .filter(Boolean)
          .join(" | ")
          .slice(0, 500);
        statuses.push({
          fonte: "pncp",
          label: FONTE_LABEL.pncp,
          status,
          encontradas: pncpNormalized.length,
          durationMs: Date.now() - startedAt,
          detail: detailForStatus(status, failureDetail || undefined),
          partial: status === "PARTIAL",
          requestId: null,
        });
      }

      if (fontes.has("comprasgov") && primeiraPagina) {
        try {
          const result = await buscarLicitacoesComprasGovResult(inicio, now, uf);
          all.push(...result.data);
          statuses.push({
            fonte: "comprasgov",
            label: FONTE_LABEL.comprasgov,
            status: result.status,
            encontradas: result.data.length,
            durationMs: result.durationMs,
            detail: detailForStatus(result.status, result.error?.message),
            partial: result.status === "PARTIAL" || Boolean(result.metadata?.partial),
            requestId: result.requestId,
          });
        } catch (error) {
          statuses.push({
            fonte: "comprasgov",
            label: FONTE_LABEL.comprasgov,
            status: "UNAVAILABLE",
            encontradas: 0,
            durationMs: 0,
            detail: (error as Error).message,
            partial: false,
            requestId: null,
          });
        }
      }

      if (fontes.has("fiemg") && primeiraPagina) {
        try {
          const result = await buscarLicitacoesFiemgResult(inicio, now);
          all.push(...result.data);
          statuses.push({
            fonte: "fiemg",
            label: FONTE_LABEL.fiemg,
            status: result.status,
            encontradas: result.data.length,
            durationMs: result.durationMs,
            detail: detailForStatus(result.status, result.error?.message),
            partial: result.status === "PARTIAL" || Boolean(result.metadata?.partial),
            requestId: result.requestId,
          });
        } catch (error) {
          statuses.push({
            fonte: "fiemg",
            label: FONTE_LABEL.fiemg,
            status: "UNAVAILABLE",
            encontradas: 0,
            durationMs: 0,
            detail: (error as Error).message,
            partial: false,
            requestId: null,
          });
        }
      }

      const oportunidades = dedupe(all)
        .filter((licitacao) => matchesKeywords(licitacao, input.keywords))
        .filter((licitacao) => (uf ? licitacao.uf.toUpperCase() === uf : true))
        .sort((a, b) => {
          const timeA = a.dataPublicacao ? a.dataPublicacao.getTime() : 0;
          const timeB = b.dataPublicacao ? b.dataPublicacao.getTime() : 0;
          return timeB - timeA;
        });

      const porFonte: Record<string, number> = {};
      for (const licitacao of oportunidades) {
        porFonte[licitacao.source] = (porFonte[licitacao.source] ?? 0) + 1;
      }

      const erros = statuses
        .filter((status) => !["SUCCESS", "NO_RESULTS"].includes(status.status))
        .map((status) => `${status.label}: ${status.detail ?? status.status}`);
      const coberturaDegradada = statuses.some((status) =>
        ["PARTIAL", "UNAVAILABLE", "TIMEOUT", "RATE_LIMITED", "AUTH_ERROR", "CONTRACT_ERROR", "CONFIG_ERROR"].includes(status.status),
      );

      return {
        totalRegistros,
        totalPaginas,
        pagina: input.pagina,
        encontradas: oportunidades.length,
        oportunidades,
        porFonte,
        fontesConsultadas: statuses.map((status) => status.label),
        statusFontes: statuses,
        coberturaDegradada,
        erros,
      };
    }),

  itensDaLicitacao: editorProcedure
    .input(ItensSchema)
    .query(async ({ input }) => {
      const itens = await buscarItensPNCP(input.cnpj, input.ano, input.sequencial);
      return { total: itens.length, itens };
    }),

  precoHomologado: editorProcedure
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
