import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { products } from "../../drizzle/schema";
import { eq, like, and } from "drizzle-orm";

/**
 * Algoritmo de similaridade Jaro-Winkler simplificado
 * Retorna score entre 0 e 1 (1 = idêntico)
 */
function jaroWinklerSimilarity(s1: string, s2: string): number {
  const s1Lower = s1.toLowerCase();
  const s2Lower = s2.toLowerCase();

  if (s1Lower === s2Lower) return 1;
  if (!s1Lower || !s2Lower) return 0;

  const len1 = s1Lower.length;
  const len2 = s2Lower.length;
  const maxDist = Math.max(len1, len2) / 2 - 1;

  if (maxDist < 0) return 0;

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - maxDist);
    const end = Math.min(i + maxDist + 1, len2);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1Lower[i] !== s2Lower[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1Lower[i] !== s2Lower[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  // Winkler: aumentar score se prefixo comum (até 4 caracteres)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1Lower[i] === s2Lower[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Extrair nome do arquivo da URL (remove extensão e caracteres especiais)
 */
function extractFileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").pop() || "";
    return filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[-_]/g, " ");
  } catch {
    return "";
  }
}

export const imagesRouter = router({
  /**
   * Buscar produtos por nome parcial com thumbnails
   * Retorna id, name, manufacturer, imageUrl atual
   */
  searchByName: publicProcedure
    .input(z.object({ nameTerm: z.string().min(1) }))
    .query(async ({ input }: { input: { nameTerm: string } }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const results = await db
        .select({
          id: products.id,
          name: products.name,
          manufacturer: products.manufacturer,
          imageUrl: products.imageUrl,
        })
        .from(products)
        .where(
          and(
            like(products.name, `%${input.nameTerm}%`),
            eq(products.isActive, "yes")
          )
        )
        .limit(100);

      return results;
    }),

  /**
   * Aplicar imageUrl a todos os produtos cujo nome contenha o termo
   * Retorna quantidade de produtos atualizados
   */
  applyImageByName: protectedProcedure
    .input(
      z.object({
        imageUrl: z.string().url(),
        nameTerm: z.string().min(1),
      })
    )
    .mutation(async ({ input }: { input: { imageUrl: string; nameTerm: string } }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const result = await db
        .update(products)
        .set({ imageUrl: input.imageUrl })
        .where(
          and(
            like(products.name, `%${input.nameTerm}%`),
            eq(products.isActive, "yes")
          )
        );

      return {
        updated: (result as any).rowsAffected || 0,
      };
    }),

  /**
   * Auto-vincular imagens por fuzzy matching (70%+)
   * Recebe URL de imagem e termo de busca, encontra produtos com similaridade > 70%
   */
  autoLinkImageByFuzzy: protectedProcedure
    .input(
      z.object({
        imageUrl: z.string().url(),
        searchTerm: z.string().min(1),
        similarityThreshold: z.number().default(0.7),
      })
    )
    .mutation(async ({ input }: { input: { imageUrl: string; searchTerm: string; similarityThreshold: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      // Extrair nome do arquivo da URL
      const fileNameFromUrl = extractFileNameFromUrl(input.imageUrl);

      // Buscar produtos com nome similar ao termo de busca
      const candidates = await db
        .select({
          id: products.id,
          name: products.name,
        })
        .from(products)
        .where(
          and(
            like(products.name, `%${input.searchTerm}%`),
            eq(products.isActive, "yes")
          )
        )
        .limit(500);

      // Calcular similaridade entre fileNameFromUrl e cada produto
      const matches = candidates
        .map((p) => ({
          id: p.id,
          name: p.name,
          score: jaroWinklerSimilarity(fileNameFromUrl, p.name),
        }))
        .filter((m) => m.score >= input.similarityThreshold)
        .sort((a, b) => b.score - a.score);

      // Atualizar produtos com score >= threshold
      let updated = 0;
      for (const match of matches) {
        await db
          .update(products)
          .set({ imageUrl: input.imageUrl })
          .where(eq(products.id, match.id));
        updated++;
      }

      return {
        updated,
        matches: matches.map((m) => ({ id: m.id, name: m.name, score: m.score })),
      };
    }),

  /**
   * Obter thumbnail de produto com fallback
   * Retorna imageUrl ou null se não disponível
   */
  getThumbnail: publicProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }: { input: { productId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const product = await db
        .select({ imageUrl: products.imageUrl })
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);

      return {
        productId: input.productId,
        imageUrl: product[0]?.imageUrl || null,
      };
    }),

  /**
   * Obter múltiplos thumbnails em lote
   * Retorna array de { productId, imageUrl }
   */
  getThumbnailsBatch: publicProcedure
    .input(z.object({ productIds: z.array(z.number()) }))
    .query(async ({ input }: { input: { productIds: number[] } }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      if (input.productIds.length === 0) return [];

      const results = await db
        .select({
          id: products.id,
          imageUrl: products.imageUrl,
        })
        .from(products)
        .where(
          and(
            eq(products.isActive, "yes")
          )
        )
        .limit(input.productIds.length);

      return input.productIds.map((id: number) => {
        const found = results.find((r) => r.id === id);
        return {
          productId: id,
          imageUrl: found?.imageUrl || null,
        };
      });
    }),

  /**
   * Detectar colunas de imagem em planilha importada
   * Retorna nome da coluna se encontrada (imageUrl, imagem, url_imagem, image, foto, picture, img)
   */
  detectImageColumn: publicProcedure
    .input(z.object({ headers: z.array(z.string()) }))
    .query(({ input }: { input: { headers: string[] } }) => {
      const imageColumnPatterns = [
        "imageurl",
        "imagem",
        "url_imagem",
        "image",
        "foto",
        "picture",
        "img",
        "image_url",
        "url_image",
        "photo",
        "fotografia",
      ];

      for (const header of input.headers) {
        const normalized = header.toLowerCase().trim();
        if (imageColumnPatterns.includes(normalized)) {
          return { detected: true, columnName: header };
        }
      }

      return { detected: false, columnName: null };
    }),

  /**
   * Estatísticas de imagens no catálogo
   * Retorna total de produtos, com imagem, sem imagem, percentual
   */
  getImageStats: publicProcedure.query(async (): Promise<any> => {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível");

    const allProducts = await db
      .select({ id: products.id, imageUrl: products.imageUrl })
      .from(products)
      .where(eq(products.isActive, "yes"));

    const withImage = allProducts.filter((p) => p.imageUrl && p.imageUrl.trim());
    const withoutImage = allProducts.length - withImage.length;

    return {
      total: allProducts.length,
      withImage: withImage.length,
      withoutImage,
      percentageWithImage: allProducts.length > 0 ? (withImage.length / allProducts.length) * 100 : 0,
    };
  }),
});

export type ImagesRouter = typeof imagesRouter;
