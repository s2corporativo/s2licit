/**
 * OCR de imagens via IA de visão.
 * Transcreve fielmente imagens para alimentar o pipeline de extração.
 */
import { invokeLLM, listConfiguredProviders } from "../_core/llm";

const OCR_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const OCR_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;
const EXT_TO_MIME: Readonly<Record<(typeof OCR_EXTS)[number], string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024;

export function isOcrSupportedMime(mimeType: string, fileName = ""): boolean {
  if (mimeType && OCR_MIMES.has(mimeType.toLowerCase())) return true;
  const lower = fileName.toLowerCase();
  return OCR_EXTS.some((ext) => lower.endsWith(ext));
}

export function mimeParaOcr(mimeType: string, fileName = ""): string {
  if (mimeType && OCR_MIMES.has(mimeType.toLowerCase())) return mimeType.toLowerCase();
  const lower = fileName.toLowerCase();
  for (const ext of OCR_EXTS) {
    if (lower.endsWith(ext)) return EXT_TO_MIME[ext];
  }
  return "image/png";
}

export async function ocrImagem(buffer: Buffer, mimeType: string, fileName = ""): Promise<string> {
  if (!isOcrSupportedMime(mimeType, fileName)) {
    throw new Error(`Formato de imagem não suportado para OCR: ${mimeType || fileName || "desconhecido"}.`);
  }
  if (!buffer.length) throw new Error("Imagem vazia: não há conteúdo para OCR.");
  if (buffer.length > MAX_OCR_IMAGE_BYTES) {
    throw new Error(`Imagem excede o limite seguro de ${Math.round(MAX_OCR_IMAGE_BYTES / 1024 / 1024)} MB para OCR.`);
  }

  const providers = await listConfiguredProviders();
  if (!providers.some((provider) => provider.kind === "anthropic")) {
    throw new Error(
      "OCR de imagem requer uma credencial Anthropic configurada na Central de Integrações.",
    );
  }

  const mime = mimeParaOcr(mimeType, fileName);
  const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;
  const response = await invokeLLM({
    provider: "anthropic",
    allowProviderFallback: false,
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
    maxTokens: 4_000,
  });

  const content = response.choices[0]?.message.content;
  return typeof content === "string" ? content.trim() : "";
}
