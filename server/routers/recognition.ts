import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { masterProducts } from "../../drizzle/schema";
import { eq, like } from "drizzle-orm";

/**
 * Algoritmo Jaro-Winkler para calcular similaridade entre strings
 */
function jaroWinklerSimilarity(s1: string, s2: string): number {
  const s1Lower = s1.toLowerCase();
  const s2Lower = s2.toLowerCase();
  
  if (s1Lower === s2Lower) return 1;
  
  const len1 = s1.length;
  const len2 = s2.length;
  const maxDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  
  if (maxDist < 0) return 0;
  
  let matches = 0;
  const s1Matched = new Array(len1).fill(false);
  const s2Matched = new Array(len2).fill(false);
  
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - maxDist);
    const end = Math.min(i + maxDist + 1, len2);
    
    for (let j = start; j < end; j++) {
      if (s2Matched[j] || s1Lower[i] !== s2Lower[j]) continue;
      s1Matched[i] = true;
      s2Matched[j] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0;
  
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matched[i]) continue;
    while (!s2Matched[k]) k++;
    if (s1Lower[i] !== s2Lower[k]) transpositions++;
    k++;
  }
  
  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  const s1Array = Array.from(s1Lower);
  const s2Array = Array.from(s2Lower);
  const prefixIndex = s1Array.findIndex((c, i) => c !== s2Array[i]);
  const prefix = prefixIndex === -1 ? Math.min(4, Math.min(s1Array.length, s2Array.length)) : Math.min(4, prefixIndex);
  
  return jaro + prefix * 0.1 * (1 - jaro);
}

// ─── Schemas ──────────────────────────────────────────────────────────────

const matchProductSchema = z.object({
  name: z.string().optional(),
  ean: z.string().optional(),
  mapa: z.string().optional(),
  concentration: z.string().optional(),
  presentation: z.string().optional(),
  threshold: z.number().default(0.7),
});

const searchMasterProductsSchema = z.object({
  query: z.string(),
  limit: z.number().default(10),
  threshold: z.number().default(0.6),
});

const detectDuplicatesInBatchSchema = z.object({
  products: z.array(
    z.object({
      name: z.string(),
      ean: z.string().optional(),
      mapa: z.string().optional(),
      concentration: z.string().optional(),
      presentation: z.string().optional(),
    })
  ),
  threshold: z.number().default(0.75),
});

// ─── Router ───────────────────────────────────────────────────────────────

export const recognitionRouter = router({
  /**
   * Reconhecer produto por nome, EAN ou MAPA
   */
  matchProduct: protectedProcedure
    .input(matchProductSchema)
    .query(async ({ input }: { input: z.infer<typeof matchProductSchema> }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const matches: any[] = [];

      // 1. Buscar por EAN (match exato)
      if (input.ean) {
        const eanMatch = await db
          .select()
          .from(masterProducts)
          .where(eq(masterProducts.ean, input.ean))
          .limit(1);
        if (eanMatch.length > 0) {
          matches.push({ ...eanMatch[0], score: 1.0, matchType: "EAN" });
        }
      }

      // 2. Buscar por MAPA (match exato)
      if (input.mapa) {
        const mapaMatch = await db
          .select()
          .from(masterProducts)
          .where(eq(masterProducts.codigoMapa, input.mapa))
          .limit(1);
        if (mapaMatch.length > 0) {
          matches.push({ ...mapaMatch[0], score: 0.95, matchType: "MAPA" });
        }
      }

      // 3. Buscar por nome (fuzzy match)
      if (input.name) {
        const candidates = await db
          .select()
          .from(masterProducts)
          .where(like(masterProducts.name, `%${input.name.slice(0, 30)}%`))
          .limit(20);

        for (const candidate of candidates) {
          const score = jaroWinklerSimilarity(input.name, candidate.name);
          if (score >= input.threshold) {
            matches.push({ ...candidate, score, matchType: "NAME" });
          }
        }
      }

      // Remover duplicatas e ordenar por score
      const uniqueMatches = Array.from(
        new Map(matches.map((m) => [m.id, m])).values()
      ).sort((a, b) => b.score - a.score);

      return uniqueMatches.slice(0, 5);
    }),

  /**
   * Buscar produtos no catálogo mestre com fuzzy matching
   */
  searchMasterProducts: protectedProcedure
    .input(searchMasterProductsSchema)
    .query(async ({ input }: { input: z.infer<typeof searchMasterProductsSchema> }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");

      const candidates = await db
        .select()
        .from(masterProducts)
        .where(like(masterProducts.name, `%${input.query.slice(0, 30)}%`))
        .limit(50);

      const results = candidates
        .map((candidate) => ({
          ...candidate,
          similarity: jaroWinklerSimilarity(input.query, candidate.name),
        }))
        .filter((r) => r.similarity >= input.threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, input.limit);

      return results;
    }),

  /**
   * Detectar duplicatas em um lote de produtos
   */
  detectDuplicatesInBatch: protectedProcedure
    .input(detectDuplicatesInBatchSchema)
    .query(async ({ input }: { input: z.infer<typeof detectDuplicatesInBatchSchema> }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco de dados não disponível");
      
      const results: any[] = [];

      for (const product of input.products) {
        let match = null;

        // 1. Buscar por EAN
        if (product.ean) {
          const eanMatch = await db
            .select()
            .from(masterProducts)
            .where(eq(masterProducts.ean, product.ean))
            .limit(1);
          if (eanMatch.length > 0) {
            match = { ...eanMatch[0], matchType: "EAN", score: 1.0 };
          }
        }

        // 2. Buscar por MAPA
        if (!match && product.mapa) {
          const mapaMatch = await db
            .select()
            .from(masterProducts)
            .where(eq(masterProducts.codigoMapa, product.mapa))
            .limit(1);
          if (mapaMatch.length > 0) {
            match = { ...mapaMatch[0], matchType: "MAPA", score: 0.95 };
          }
        }

        // 3. Buscar por nome (fuzzy)
        if (!match && product.name) {
          const candidates = await db
            .select()
            .from(masterProducts)
            .where(like(masterProducts.name, `%${product.name.slice(0, 30)}%`))
            .limit(10);

          for (const candidate of candidates) {
            const score = jaroWinklerSimilarity(product.name, candidate.name);
            if (score >= input.threshold) {
              match = { ...candidate, matchType: "NAME", score };
              break;
            }
          }
        }

        results.push({
          input: product,
          match,
          isDuplicate: !!match,
        });
      }

      return results;
    }),

  /**
   * Obter estatísticas do catálogo mestre
   */
  getMasterProductsStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco de dados não disponível");

    const allProducts = await db.select().from(masterProducts);
    const withEan = allProducts.filter((p) => p.ean).length;
    const withMapa = allProducts.filter((p) => p.codigoMapa).length;

    return {
      total: allProducts.length,
      withEan,
      withMapa,
      withoutIdentifier: allProducts.length - Math.max(withEan, withMapa),
    };
  }),
});
