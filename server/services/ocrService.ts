/**
 * ocrService.ts
 *
 * OCR de imagens digitalizadas (spec §2) via IA de visão. Transcreve o texto de
 * uma imagem (foto/scan de pedido, edital, tabela) para alimentar o mesmo
 * pipeline de extração de itens dos demais formatos.
 *
 * Usa a IA da Anthropic (visão). Não inventa: instrui a transcrever fielmente,
 * sem interpretar nem resumir.
 */

import { invokeLLM, activeProvider } from "../_core/llm";

const OCR_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const OCR_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

/** A entrada é uma imagem que deve passar por OCR? (puro, testável) */
export function isOcrSupportedMime(mimeType: string, fileName = ""): boolean {
  if (mimeType && OCR_MIMES.has(mimeType.toLowerCase())) return true;
  const lower = fileName.toLowerCase();
  return OCR_EXTS.some((ext) => lower.endsWith(ext));
}

/** Transcreve o texto de uma imagem. Requer a IA de visão da Anthropic. */
export async function ocrImagem(buffer: Buffer, mimeType: string): Promise<string> {
  const provider = activeProvider();
  if (!provider || provider.kind !== "anthropic") {
    throw new Error(
      "OCR de imagem requer a IA de visão da Anthropic. Defina ANTHROPIC_API_KEY (e AI_PROVIDER=anthropic ou auto).",
    );
  }

  const mime = mimeType && OCR_MIMES.has(mimeType.toLowerCase()) ? mimeType : "image/png";
  const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "Você é um OCR preciso. Transcreva fielmente TODO o texto visível na imagem, " +
          "preservando a ordem de leitura e as quebras de linha. Mantenha tabelas como texto " +
          "linha a linha. NÃO interprete, resuma nem invente conteúdo. Se não houver texto, responda vazio.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcreva o texto desta imagem." },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
    maxTokens: 4000,
  });

  const content = response.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}
