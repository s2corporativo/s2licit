import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import {
  scrapeSupplierCatalog,
  testScraper,
  validateScraperConfig,
  type ScraperConfig,
} from "../services/scraperIntegrationService";

export const scraperIntegrationRouter = router({
  /**
   * Executa scraper para fornecedor
   */
  scrapeSupplier: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .mutation(async ({ input }) => {
      return await scrapeSupplierCatalog(input.supplierId);
    }),

  /**
   * Testa configuração de scraper
   */
  testScraper: protectedProcedure
    .input(
      z.object({
        baseUrl: z.string(),
        catalogUrl: z.string().optional(),
        scraperType: z.enum(["http", "javascript", "selenium"]).default("http"),
      })
    )
    .mutation(async ({ input }) => {
      const config: ScraperConfig = {
        supplierId: 0,
        scraperType: input.scraperType,
        baseUrl: input.baseUrl,
        catalogUrl: input.catalogUrl,
        isActive: true,
      };

      return await testScraper(config);
    }),

  /**
   * Valida configuração de scraper
   */
  validateConfig: protectedProcedure
    .input(
      z.object({
        baseUrl: z.string(),
        catalogUrl: z.string().optional(),
        scraperType: z.enum(["http", "javascript", "selenium"]).default("http"),
      })
    )
    .mutation(async ({ input }) => {
      const config: ScraperConfig = {
        supplierId: 0,
        scraperType: input.scraperType,
        baseUrl: input.baseUrl,
        catalogUrl: input.catalogUrl,
        isActive: true,
      };

      return await validateScraperConfig(config);
    }),
});
