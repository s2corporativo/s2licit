import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getCompanySettings } from "../db";
import { sugerirPreco, type EstatisticasHomologado } from "../services/precificacaoInteligenteService";

/**
 * Precificação inteligente para a disputa: piso (não descer abaixo), alvo
 * (margem desejada) e sugerido (competitivo, calibrado pelo histórico).
 *
 * Consulta de histórico homologado permanece centralizada em pncpRadar,
 * evitando dois endpoints tRPC com a mesma responsabilidade.
 */

const ImpostosSchema = z.object({
  icmsPercentage: z.number().min(0).max(100).default(0),
  ipPercentage: z.number().min(0).max(100).default(0),
  pisPercentage: z.number().min(0).max(100).default(0),
  cofinsPercentage: z.number().min(0).max(100).default(0),
  freightType: z.enum(["fixed", "percentage"]).default("fixed"),
  freightValue: z.number().min(0).default(0),
});

const ItemSchema = z.object({
  descricao: z.string().max(500).optional(),
  custo: z.number().positive(),
  quantidade: z.number().positive().default(1),
  medianaHomologado: z.number().positive().optional(),
});

async function resolverMargens(margemMinima?: number, margemDesejada?: number) {
  const company = await getCompanySettings();
  const min = margemMinima ?? (Number(company?.minMarginPercent ?? "10") || 10);
  const desejada = margemDesejada ?? Math.max(min + 10, 30);
  return { min, desejada };
}

export const precificacaoRouter = router({
  sugerirLote: protectedProcedure
    .input(
      z.object({
        itens: z.array(ItemSchema).min(1).max(500),
        impostos: ImpostosSchema.optional(),
        margemMinima: z.number().min(0).max(99).optional(),
        margemDesejada: z.number().min(0).max(99).optional(),
      }),
    )
    .query(async ({ input }) => {
      const { min, desejada } = await resolverMargens(input.margemMinima, input.margemDesejada);
      const config = {
        supplierId: 0,
        region: "Nacional",
        icmsPercentage: input.impostos?.icmsPercentage ?? 0,
        ipPercentage: input.impostos?.ipPercentage ?? 0,
        pisPercentage: input.impostos?.pisPercentage ?? 0,
        cofinsPercentage: input.impostos?.cofinsPercentage ?? 0,
        freightType: input.impostos?.freightType ?? ("fixed" as const),
        freightValue: input.impostos?.freightValue ?? 0,
        roundingMethod: "round" as const,
      };

      const itens = input.itens.map((item) => {
        const stats: EstatisticasHomologado | null = item.medianaHomologado
          ? {
              amostras: 1,
              media: item.medianaHomologado,
              minimo: item.medianaHomologado,
              maximo: item.medianaHomologado,
              mediana: item.medianaHomologado,
            }
          : null;
        const suggestion = sugerirPreco({
          custo: item.custo,
          config,
          margemMinima: min,
          margemDesejada: desejada,
          estatisticasHomologado: stats,
        });
        return {
          descricao: item.descricao ?? "",
          quantidade: item.quantidade,
          custo: item.custo,
          ...suggestion,
          totalPiso: Number((suggestion.piso * item.quantidade).toFixed(2)),
          totalSugerido: Number((suggestion.sugerido * item.quantidade).toFixed(2)),
        };
      });

      return {
        margemMinima: min,
        margemDesejada: desejada,
        itens,
        totalPiso: Number(itens.reduce((sum, item) => sum + item.totalPiso, 0).toFixed(2)),
        totalSugerido: Number(itens.reduce((sum, item) => sum + item.totalSugerido, 0).toFixed(2)),
      };
    }),
});
