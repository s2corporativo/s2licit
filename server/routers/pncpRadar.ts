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
import { classifyThrownError, statusFromError } from "../integrations/core/integrationError";
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
  modalidades: z.array(z.number().int()).min(1).max(6).default([8, 6]),
  fontes: z.array(FonteEnum).min(1).default(["pncp", "comprasgov", "fiemg"]),
});

const FONTE_LABEL = {
  pncp: "PNCP",
  comprasgov: "Compras.gov.br",
  fiemg: "Sistema S / FIEMG",
} as const;

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
  fonte: keyof typeof FONTE_LABEL;
  label: string;
  status: IntegrationResultStatus;
  encontradas: number;
  durationMs: number;
  detail: string | null;
  partial: boolean;
  requestId: string | null;
};

interface RadarSourceResult {
  status: SourceStatus;
  data: NormalizedLicitacao[];
  totalRegistros?: number;
  totalPaginas?: number;
}

function detailForStatus(status: IntegrationResultStatus, error?: string): string | null {
  if (error) return error;
  if (status === "NO_RESULTS") return "Consulta concluída normalmente, sem oportunidades no período/filtro.";
  if (status === "PARTIAL") return "Fonte respondeu parcialmente; parte da cobertura pode estar indisponível.";
  if (status === "SUCCESS") return null;
  return "A fonte não pôde ser consultada com confiabilidade.";
}

async function loadPncpSource(input: {
  inicio: Date;
  fim: Date;
  pagina: number;
  modalidades: number[];
}): Promise<RadarSourceResult> {
  const startedAt = Date.now();
  const modalityResults = await Promise.allSettled(
    input.modalidades.map((modalidade) =>
      buscarLicitacoesPNCP(
        toDateStr(input.inicio),
        toDateStr(input.fim),
        input.pagina,
        50,
        modalidade,
      ),
    ),
  );
  const fulfilled = modalityResults
    .filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof buscarLicitacoesPNCP>>> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
  const failures = modalityResults
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => classifyThrownError(result.reason));

  const data = dedupe(fulfilled.flatMap((result) => result.data).map(normalizePncpLicitacao));
  const totalRegistros = fulfilled.reduce((sum, result) => sum + result.totalRegistros, 0);
  const totalPaginas = Math.max(1, ...fulfilled.map((result) => result.totalPaginas));
  let status: IntegrationResultStatus;
  if (!fulfilled.length) status = statusFromError(failures[0] ?? classifyThrownError(new Error("PNCP indisponível.")));
  else if (failures.length) status = "PARTIAL";
  else status = data.length ? "SUCCESS" : "NO_RESULTS";

  return {
    status: {
      fonte: "pncp",
      label: FONTE_LABEL.pncp,
      status,
      encontradas: data.length,
      durationMs: Date.now() - startedAt,
      detail: detailForStatus(
        status,
        failures.length ? failures.map((error) => error.message).join(" | ").slice(0, 500) : undefined,
      ),
      partial: status === "PARTIAL",
      requestId: fulfilled[0]?.requestId ?? null,
    },
    data,
    totalRegistros,
    totalPaginas,
  };
}

async function loadComprasGovSource(inicio: Date, fim: Date, uf?: string): Promise<RadarSourceResult> {
  try {
    const result = await buscarLicitacoesComprasGovResult(inicio, fim, uf);
    return {
      status: {
        fonte: "comprasgov",
        label: FONTE_LABEL.comprasgov,
        status: result.status,
        encontradas: result.data.length,
        durationMs: result.durationMs,
        detail: detailForStatus(result.status, result.error?.message),
        partial: result.status === "PARTIAL" || Boolean(result.metadata?.partial),
        requestId: result.requestId,
      },
      data: result.data,
    };
  } catch (error) {
    const classified = classifyThrownError(error);
    const status = statusFromError(classified);
    return {
      status: {
        fonte: "comprasgov",
        label: FONTE_LABEL.comprasgov,
        status,
        encontradas: 0,
        durationMs: 0,
        detail: classified.message,
        partial: false,
        requestId: null,
      },
      data: [],
    };
  }
}

async function loadFiemgSource(inicio: Date, fim: Date): Promise<RadarSourceResult> {
  try {
    const result = await buscarLicitacoesFiemgResult(inicio, fim);
    return {
      status: {
        fonte: "fiemg",
        label: FONTE_LABEL.fiemg,
        status: result.status,
        encontradas: result.data.length,
        durationMs: result.durationMs,
        detail: detailForStatus(result.status, result.error?.message),
        partial: result.status === "PARTIAL" || Boolean(result.metadata?.partial),
        requestId: result.requestId,
      },
      data: result.data,
    };
  } catch (error) {
    const classified = classifyThrownError(error);
    const status = statusFromError(classified);
    return {
      status: {
        fonte: "fiemg",
        label: FONTE_LABEL.fiemg,
        status,
        encontradas: 0,
        durationMs: 0,
        detail: classified.message,
        partial: false,
        requestId: null,
      },
      data: [],
    };
  }
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

      const tasks: Array<Promise<RadarSourceResult>> = [];
      if (fontes.has("pncp")) {
        tasks.push(
          loadPncpSource({ inicio, fim: now, pagina: input.pagina, modalidades: input.modalidades }),
        );
      }
      if (fontes.has("comprasgov") && primeiraPagina) tasks.push(loadComprasGovSource(inicio, now, uf));
      if (fontes.has("fiemg") && primeiraPagina) tasks.push(loadFiemgSource(inicio, now));

      // Fontes independentes são executadas concorrentemente. A latência do
      // Radar tende ao máximo das fontes, em vez da soma das latências.
      const sourceResults = await Promise.all(tasks);
      const statuses = sourceResults.map((result) => result.status);
      const all = sourceResults.flatMap((result) => result.data);
      const pncpResult = sourceResults.find((result) => result.status.fonte === "pncp");
      const totalRegistros = pncpResult?.totalRegistros ?? 0;
      const totalPaginas = pncpResult?.totalPaginas ?? 1;

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
