import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";

function legacyScraperDisabled(): never {
  throw new TRPCError({
    code: "METHOD_NOT_SUPPORTED",
    message: "Integração legada desativada. Use Fornecedores → Agente de Preços, que executa o scraperEngine real com credenciais criptografadas.",
  });
}

/**
 * Namespace mantido temporariamente apenas para compatibilidade de clientes
 * antigos. O motor legado usava regex fixa e devolvia listas vazias para
 * JavaScript/Selenium; por segurança, não executa mais operações.
 */
export const scraperIntegrationRouter = router({
  scrapeSupplier: protectedProcedure
    .input(z.object({ supplierId: z.number().int().positive() }))
    .mutation(() => legacyScraperDisabled()),

  testScraper: protectedProcedure
    .input(
      z.object({
        baseUrl: z.string().url(),
        catalogUrl: z.string().url().optional(),
        scraperType: z.enum(["http", "javascript", "selenium"]).default("http"),
      }),
    )
    .mutation(() => legacyScraperDisabled()),

  validateConfig: protectedProcedure
    .input(
      z.object({
        baseUrl: z.string().url(),
        catalogUrl: z.string().url().optional(),
        scraperType: z.enum(["http", "javascript", "selenium"]).default("http"),
      }),
    )
    .mutation(() => legacyScraperDisabled()),
});
