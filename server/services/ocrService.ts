/**
 * OCR de imagens via IA de visão.
 * Transcreve fielmente imagens para alimentar o pipeline de extração.
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
const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function isOcrSupportedMime(mimeType: string, fileName = ""): boolean {
  if (mimeType && OCR_MIMES.has(mimeType.toLowerCase())) return true;
  const lower = fileName.toLowerCase();
  return OCR_EXTS.some((ext) => lower.endsWith(ext));
}

export function mimeParaOcr(mimeType: string, fileName = ""): string {
  if (mimeType && OCR_MIMES.has(mimeType.toLowerCase())) return mimeType.toLowerCase();
  const lower = fileName.toLowerCase();
  for (const [ext, mime] of Object.entries(EXT_TO_MIME)) {
    if (lower.endsWith(ext)) return mime;
  }
  return "image/png";
}

export async function ocrImagem(buffer: Buffer, mimeType: string, fileName = ""): Promise<string> {
  const provider = await activeProvider();
  if (!provider || provider.kind !== "anthropic") {
    throw new Error(
      "OCR de imagem requer Anthropic como provedor ativo. Configure a chave e selecione Anthropic/Auto na Central de Integrações.",
    );
  }

  const mime = mimeParaOcr(mimeType, fileName);
  const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "Você é um OCR preciso. Transcreva fielmente TODO o texto visível na imagem, preservando a ordem de leitura e as quebras de linha. " +
          "Mantenha tabelas como texto linha a linha. NÃO interprete, resuma nem invente conteúdo. Se não houver texto, responda vazio.",
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
