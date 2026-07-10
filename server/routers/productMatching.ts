import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  matchProductToMaster,
  findSimilarMasterProducts,
  calculateMatchingStats,
  groupProductsByMaster,
  type MasterProductMatch,
} from "../services/productMatchingService";
import { listMasterProducts } from "../db";

export const productMatchingRouter = router({
  /**
   * Encontra Master Product correspondente para um produto
   */
  matchProduct: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        ean: z.string().optional().nullable(),
        codigoMapa: z.string().optional().nullable(),
        concentration: z.string().optional().nullable(),
        presentation: z.string().optional().nullable(),
        manufacturer: z.string().optional().nullable(),
        minSimilarity: z.number().min(0).max(1).default(0.7),
      })
    )
    .query(async ({ input }: { input: { name: string; ean?: string | null; codigoMapa?: string | null; concentration?: string | null; presentation?: string | null; manufacturer?: string | null; minSimilarity: number } }) => {
      const masterProducts = await listMasterProducts();

      if (!masterProducts || masterProducts.length === 0) {
        return {
          match: null,
          message: "Nenhum Master Product disponível",
        };
      }

      const match = await matchProductToMaster(input, masterProducts as MasterProductMatch[], input.minSimilarity);

      return {
        match,
        message: match ? `Produto encontrado com ${(match.similarity * 100).toFixed(1)}% de similaridade` : "Nenhuma correspondência encontrada",
      };
    }),

  /**
   * Encontra produtos similares a um produto
   */
  findSimilar: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        concentration: z.string().optional().nullable(),
        presentation: z.string().optional().nullable(),
        minSimilarity: z.number().min(0).max(1).default(0.6),
        limit: z.number().min(1).max(20).default(5),
      })
    )
    .query(async ({ input }: { input: { name: string; concentration?: string | null; presentation?: string | null; minSimilarity: number; limit: number } }) => {
      const masterProducts = await listMasterProducts();

      if (!masterProducts || masterProducts.length === 0) {
        return {
          matches: [],
          message: "Nenhum Master Product disponível",
        };
      }

      const matches = await findSimilarMasterProducts(input, masterProducts as MasterProductMatch[], input.minSimilarity, input.limit);

      return {
        matches,
        message: `${matches.length} produto(s) similar(es) encontrado(s)`,
      };
    }),

  /**
   * Calcula estatísticas de matching para um lote de produtos
   */
  calculateStats: protectedProcedure
    .input(
      z.object({
        products: z.array(
          z.object({
            name: z.string(),
            ean: z.string().optional().nullable(),
            codigoMapa: z.string().optional().nullable(),
            concentration: z.string().optional().nullable(),
            presentation: z.string().optional().nullable(),
          })
        ),
      })
    )
    .query(async ({ input }: { input: { products: Array<{ name: string; ean?: string | null; codigoMapa?: string | null; concentration?: string | null; presentation?: string | null }> } }) => {
      const masterProducts = await listMasterProducts();

      if (!masterProducts || masterProducts.length === 0) {
        return {
          stats: null,
          message: "Nenhum Master Product disponível",
        };
      }

      const stats = await calculateMatchingStats(input.products, masterProducts as MasterProductMatch[]);

      return {
        stats,
        message: `${stats.totalProducts} produto(s) analisado(s), ${stats.totalProducts - stats.unmatched} correspondência(s) encontrada(s)`,
      };
    }),

  /**
   * Agrupa produtos por Master Product correspondente
   */
  groupByMaster: protectedProcedure
    .input(
      z.object({
        products: z.array(
          z.object({
            name: z.string(),
            ean: z.string().optional().nullable(),
            codigoMapa: z.string().optional().nullable(),
            concentration: z.string().optional().nullable(),
            presentation: z.string().optional().nullable(),
            manufacturer: z.string().optional().nullable(),
          })
        ),
      })
    )
    .query(async ({ input }: { input: { products: Array<{ name: string; ean?: string | null; codigoMapa?: string | null; concentration?: string | null; presentation?: string | null; manufacturer?: string | null }> } }) => {
      const masterProducts = await listMasterProducts();

      if (!masterProducts || masterProducts.length === 0) {
        return {
          groupings: [],
          message: "Nenhum Master Product disponível",
        };
      }

      const groupings = await groupProductsByMaster(input.products, masterProducts as MasterProductMatch[]);

      return {
        groupings,
        message: `${groupings.length} grupo(s) de produto(s) identificado(s)`,
      };
    }),

  /**
   * Lista todos os Master Products disponíveis
   */
  listMasterProducts: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(1000).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }: { input: { limit: number; offset: number } }) => {
      const masterProducts = await listMasterProducts();

      if (!masterProducts) {
        return {
          products: [],
          total: 0,
          message: "Nenhum Master Product disponível",
        };
      }

      const sliced = masterProducts.slice(input.offset, input.offset + input.limit);

      return {
        products: sliced,
        total: masterProducts.length,
        message: `${sliced.length} de ${masterProducts.length} Master Product(s)`,
      };
    }),

  /**
   * Busca Master Products por termo
   */
  searchMasterProducts: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).default(10),
      })
    )
    .query(async ({ input }: { input: { query: string; limit: number } }) => {
      const masterProducts = await listMasterProducts();

      if (!masterProducts) {
        return {
          results: [],
          message: "Nenhum Master Product disponível",
        };
      }

      const query = input.query.toLowerCase();
      const results = masterProducts
        .filter(
          (mp) =>
            mp.name?.toLowerCase().includes(query) ||
            mp.activeIngredient?.toLowerCase().includes(query) ||
            mp.manufacturer?.toLowerCase().includes(query)
        )
        .slice(0, input.limit);

      return {
        results,
        message: `${results.length} resultado(s) encontrado(s)`,
      };
    }),
});
