import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { extractDocumentText } from "../services/documentTextService";
import {
  analyzeAsLawyer,
  classifyDocument,
  TIPO_LABELS,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
} from "../services/legalDocAnalysisService";

/**
 * Análise jurídica de documentos: a IA reconhece o tipo de documento e o lê
 * como um advogado especialista em licitações/contratos públicos.
 */
export const legalAnalysisRouter = router({
  analisar: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().min(10),
        fileName: z.string(),
        mimeType: z.string(),
        // Permite ao usuário forçar o tipo se discordar da classificação da IA.
        tipoForcado: z.enum(TIPOS_DOCUMENTO).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { text, totalChars } = await extractDocumentText(input);

      const classificacao = input.tipoForcado
        ? { tipo: input.tipoForcado as TipoDocumento, confianca: 1, justificativa: "Tipo definido manualmente." }
        : await classifyDocument(text);

      const analise = await analyzeAsLawyer(text, classificacao.tipo);

      return {
        classificacao: {
          ...classificacao,
          tipoLabel: TIPO_LABELS[classificacao.tipo],
        },
        analise,
        totalChars,
        truncado: totalChars > 120_000,
      };
    }),

  /** Lista os tipos suportados (para o seletor de tipo manual na UI). */
  tipos: protectedProcedure.query(() =>
    TIPOS_DOCUMENTO.map((t) => ({ value: t, label: TIPO_LABELS[t] }))
  ),
});
