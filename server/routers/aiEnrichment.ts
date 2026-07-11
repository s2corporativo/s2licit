import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  enrichProductWithAI,
  enrichProductsBatch,
  validateEnrichedFields,
  mergeEnrichedFields,
  calculateEnrichmentScore,
  type EnrichedProductFields,
} from "../services/aiProductEnrichmentService";
import type { ScrapedProduct } from "../services/scraperIntegrationService";

export const aiEnrichmentRouter = router({
  /**
   * Enriquece um produto individual
   */
  enrichProduct: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        manufacturer: z.string().optional(),
        presentation: z.string().optional(),
        price: z.number().optional(),
        ean: z.string().optional(),
        productUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const product: ScrapedProduct = {
        name: input.name,
        description: input.description,
        manufacturer: input.manufacturer,
        presentation: input.presentation,
        price: input.price,
        ean: input.ean,
        productUrl: input.productUrl,
      };

      const enriched = await enrichProductWithAI(product);
      const validation = validateEnrichedFields(enriched);
      const score = calculateEnrichmentScore(product, enriched);

      return {
        enriched,
        validation,
        score,
        merged: mergeEnrichedFields(product, enriched),
      };
    }),

  /**
   * Enriquece múltiplos produtos em batch
   */
  enrichBatch: protectedProcedure
    .input(
      z.object({
        products: z.array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            manufacturer: z.string().optional(),
            presentation: z.string().optional(),
            price: z.number().optional(),
            ean: z.string().optional(),
            productUrl: z.string().optional(),
          })
        ),
        maxConcurrent: z.number().default(3),
      })
    )
    .mutation(async ({ input }) => {
      const products: ScrapedProduct[] = input.products.map((p) => ({
        name: p.name,
        description: p.description,
        manufacturer: p.manufacturer,
        presentation: p.presentation,
        price: p.price,
        ean: p.ean,
        productUrl: p.productUrl,
      }));

      const enrichedMap = await enrichProductsBatch(
        products,
        input.maxConcurrent
      );

      const results = Array.from(enrichedMap.entries()).map(
        ([key, enriched]) => {
          const product = products.find((p) => p.ean === key || p.name === key);
          if (!product) return null;

          const validation = validateEnrichedFields(enriched);
          const score = calculateEnrichmentScore(product, enriched);

          return {
            productKey: key,
            enriched,
            validation,
            score,
            merged: mergeEnrichedFields(product, enriched),
          };
        }
      );

      return {
        total: products.length,
        processed: enrichedMap.size,
        results: results.filter((r) => r !== null),
        successRate: (enrichedMap.size / products.length) * 100,
      };
    }),

  /**
   * Valida campos enriquecidos
   */
  validateEnrichment: protectedProcedure
    .input(
      z.object({
        enriched: z.object({
          activeIngredient: z.string().optional(),
          concentration: z.string().optional(),
          unit: z.string().optional(),
          indication: z.string().optional(),
          contraindication: z.string().optional(),
          dosage: z.string().optional(),
          administration: z.string().optional(),
          sideEffects: z.string().optional(),
          storage: z.string().optional(),
          validity: z.string().optional(),
          manufacturer: z.string().optional(),
          ncm: z.string().optional(),
          mapa: z.string().optional(),
          specieAnimal: z.string().optional(),
          therapeuticClass: z.string().optional(),
          confidence: z.number(),
          fieldsExtracted: z.array(z.string()),
          rawResponse: z.string(),
        }),
      })
    )
    .query(({ input }) => {
      return validateEnrichedFields(input.enriched as EnrichedProductFields);
    }),

  /**
   * Calcula score de qualidade
   */
  calculateScore: protectedProcedure
    .input(
      z.object({
        originalName: z.string(),
        enrichedFields: z.object({
          activeIngredient: z.string().optional(),
          concentration: z.string().optional(),
          unit: z.string().optional(),
          indication: z.string().optional(),
          contraindication: z.string().optional(),
          dosage: z.string().optional(),
          administration: z.string().optional(),
          sideEffects: z.string().optional(),
          storage: z.string().optional(),
          validity: z.string().optional(),
          manufacturer: z.string().optional(),
          ncm: z.string().optional(),
          mapa: z.string().optional(),
          specieAnimal: z.string().optional(),
          therapeuticClass: z.string().optional(),
          confidence: z.number(),
          fieldsExtracted: z.array(z.string()),
          rawResponse: z.string(),
        }),
      })
    )
    .query(({ input }) => {
      const product: ScrapedProduct = {
        name: input.originalName,
      };

      const score = calculateEnrichmentScore(
        product,
        input.enrichedFields as EnrichedProductFields
      );

      return { score };
    }),
});
