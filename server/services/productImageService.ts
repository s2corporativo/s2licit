import { storagePut, storageGet } from "../storage";

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  url?: string;
}

export interface ProductImageData {
  productId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  altText?: string;
}

/**
 * Valida URL de imagem verificando se está acessível
 */
export async function validateImageUrl(url: string): Promise<ImageValidationResult> {
  try {
    // Validar formato de URL
    if (!url || typeof url !== "string") {
      return { valid: false, error: "URL inválida" };
    }

    const urlObj = new URL(url);

    // Verificar protocolo
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return { valid: false, error: "Protocolo de URL deve ser HTTP ou HTTPS" };
    }

    // Verificar se URL é acessível (HEAD request)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          valid: false,
          error: `URL retornou status ${response.status}`,
        };
      }

      // Verificar Content-Type
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.startsWith("image/")) {
        return {
          valid: false,
          error: "URL não aponta para uma imagem válida",
        };
      }

      return { valid: true, url };
    } catch (error) {
      return {
        valid: false,
        error: "URL não está acessível ou timeout na requisição",
      };
    }
  } catch (error) {
    return { valid: false, error: "URL inválida" };
  }
}

/**
 * Detecta coluna de imagem em headers de planilha
 * Busca por nomes comuns: image, imageUrl, imagem, foto, picture, url_imagem, etc
 */
export function detectImageColumn(headers: string[]): number | null {
  const imageColumnNames = [
    "image",
    "imageurl",
    "image_url",
    "imagem",
    "foto",
    "picture",
    "url_imagem",
    "url_foto",
    "image_link",
    "link_imagem",
    "product_image",
    "product_photo",
    "thumbnail",
    "photo_url",
    "image_link",
  ];

  for (let i = 0; i < headers.length; i++) {
    const normalizedHeader = headers[i]
      .toLowerCase()
      .trim()
      .replace(/[_\-\s]/g, "");

    if (
      imageColumnNames.some(
        (name) =>
          normalizedHeader === name.replace(/[_\-\s]/g, "") ||
          normalizedHeader.includes(name.replace(/[_\-\s]/g, ""))
      )
    ) {
      return i;
    }
  }

  return null;
}

/**
 * Extrai URLs de imagem de um texto (pode conter múltiplas URLs separadas por vírgula ou ponto-e-vírgula)
 */
export function extractImageUrls(text: string): string[] {
  if (!text || typeof text !== "string") {
    return [];
  }

  // Separar por vírgula, ponto-e-vírgula ou quebra de linha
  const urls = text
    .split(/[,;|\n]/)
    .map((url) => url.trim())
    .filter((url) => url.length > 0 && (url.startsWith("http://") || url.startsWith("https://")));

  return urls;
}

/**
 * Processa e valida URLs de imagem para um produto
 */
export async function processProductImages(
  imageUrls: string[]
): Promise<{ primary: string | null; validated: string[] }> {
  if (!imageUrls || imageUrls.length === 0) {
    return { primary: null, validated: [] };
  }

  const validated: string[] = [];

  for (const url of imageUrls) {
    const result = await validateImageUrl(url);
    if (result.valid && result.url) {
      validated.push(result.url);
    }
  }

  return {
    primary: validated.length > 0 ? validated[0] : null,
    validated,
  };
}

/**
 * Gera URL de thumbnail usando serviço de imagem (ex: Cloudinary)
 * Para simplificar, retorna a URL original com parâmetros de transformação
 */
export function generateThumbnailUrl(imageUrl: string, width: number = 40, height: number = 40): string {
  if (!imageUrl) {
    return "";
  }

  // Se for URL de Cloudinary, adicionar transformações
  if (imageUrl.includes("cloudinary.com")) {
    // cloudinary.com/image/upload/w_40,h_40,c_fill/...
    return imageUrl.replace("/upload/", `/upload/w_${width},h_${height},c_fill/`);
  }

  // Se for URL de Imgix, adicionar parâmetros
  if (imageUrl.includes("imgix")) {
    const separator = imageUrl.includes("?") ? "&" : "?";
    return `${imageUrl}${separator}w=${width}&h=${height}&fit=crop`;
  }

  // Fallback: retornar URL original (cliente pode fazer resize com CSS)
  return imageUrl;
}

/**
 * Normaliza URLs de imagem (remove espaços, adiciona protocolo se necessário)
 */
export function normalizeImageUrl(url: string): string {
  if (!url || typeof url !== "string") {
    return "";
  }

  let normalized = url.trim();

  // Adicionar protocolo se não tiver
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = `https://${normalized}`;
  }

  return normalized;
}

/**
 * Verifica se uma URL de imagem está em cache/S3
 */
export async function getImageFromStorage(key: string): Promise<string | null> {
  try {
    const { url } = await storageGet(key);
    return url;
  } catch (error) {
    return null;
  }
}

/**
 * Salva imagem em S3 e retorna URL
 */
export async function saveImageToStorage(
  imageBuffer: Buffer,
  fileName: string,
  mimeType: string = "image/jpeg"
): Promise<{ url: string; key: string }> {
  const key = `products/images/${fileName}`;
  const result = await storagePut(key, imageBuffer, mimeType);
  return result;
}

/**
 * Extrai nome de arquivo de URL
 */
export function getFileNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const fileName = pathname.substring(pathname.lastIndexOf("/") + 1);
    return fileName || "image.jpg";
  } catch {
    return "image.jpg";
  }
}

/**
 * Valida múltiplas URLs de imagem em paralelo
 */
export async function validateMultipleImageUrls(
  urls: string[]
): Promise<{ valid: string[]; invalid: Array<{ url: string; error: string }> }> {
  const results = await Promise.all(urls.map((url) => validateImageUrl(url)));

  const valid: string[] = [];
  const invalid: Array<{ url: string; error: string }> = [];

  results.forEach((result, index) => {
    if (result.valid && result.url) {
      valid.push(result.url);
    } else {
      invalid.push({
        url: urls[index],
        error: result.error || "Erro desconhecido",
      });
    }
  });

  return { valid, invalid };
}
