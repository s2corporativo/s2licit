import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getCheaperAlternatives, getProductPriceHistory, getProductsWithPriceAlert, getSimilarProductsByIngredient, listProductsWithLandedCost, recordPriceHistory } from "../db";

export const priceIntelligenceRouter = router({
    // Similares por princípio ativo
    similarByIngredient: protectedProcedure
      .input(z.object({
        productId: z.number(),
        referencePrice: z.number().nullable().optional(),
      }))
      .query(({ input }) => getSimilarProductsByIngredient(input.productId, input.referencePrice ?? null)),

    cheaperAlternatives: protectedProcedure
      .input(z.object({
        productId: z.number(),
        referencePrice: z.number().nullable().optional(),
      }))
      .query(({ input }) => getCheaperAlternatives(input.productId, input.referencePrice ?? null)),

    // Histórico de preços
    priceHistory: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getProductPriceHistory(input.productId)),

    // Alertas de inflação
    priceAlerts: protectedProcedure
      .query(() => getProductsWithPriceAlert()),

    // Listagem com Landed Cost
    listWithLandedCost: protectedProcedure
      .input(z.object({
        categoryId: z.number().optional(),
        supplierId: z.number().optional(),
        search: z.string().optional(),
        limit: z.number().optional(),
      }).optional())
      .query(({ input }) => listProductsWithLandedCost(input)),

    // Registrar preço manualmente (com frete e impostos)
    recordPrice: protectedProcedure
      .input(z.object({
        productId: z.number(),
        supplierId: z.number(),
        price: z.string().nullable().optional(),
        freightValue: z.string().nullable().optional(),
        taxValue: z.string().nullable().optional(),
        importBatchId: z.number().nullable().optional(),
      }))
      .mutation(({ input }) => recordPriceHistory({
        ...input,
        price: input.price ?? null,
        freightValue: input.freightValue ?? null,
        taxValue: input.taxValue ?? null,
        importBatchId: input.importBatchId ?? null,
      })),
  });
