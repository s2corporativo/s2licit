import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { extractDocumentText } from "../services/documentTextService";
import {
  analyzeAsLawyer,
  classifyDocument,
  TIPO_LABELS,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
} from "../services/legalDocAnalysisService";

const analysisInput = z.object({
  fileBase64: z.string().min(10),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(128),
  tipoForcado: z.enum(TIPOS_DOCUMENTO).optional(),
});

export const legalAnalysisRouter = router({
  analisar: editorProcedure
    .input(analysisInput)
    .mutation(async ({ input }) => {
      const document = await extractDocumentText(input);
      const classificacao = input.tipoForcado
        ? {
            tipo: input.tipoForcado as TipoDocumento,
            confianca: 1,
            justificativa: "Tipo definido manualmente pelo operador.",
          }
        : await classifyDocument(document.text);

      const analise = await analyzeAsLawyer(document.text, classificacao.tipo);
      return {
        classificacao: {
          ...classificacao,
          tipoLabel: TIPO_LABELS[classificacao.tipo],
        },
        analise,
        documento: {
          totalChars: document.totalChars,
          pageCount: document.pageCount ?? null,
          ocrUsed: document.ocrUsed,
          ocrPages: document.ocrPages,
          ingestionTruncated: document.truncated,
        },
        cobertura: analise.cobertura,
        completo: !document.truncated && !analise.cobertura.truncado,
      };
    }),

  tipos: protectedProcedure.query(() =>
    TIPOS_DOCUMENTO.map((tipo) => ({ value: tipo, label: TIPO_LABELS[tipo] })),
  ),
});
