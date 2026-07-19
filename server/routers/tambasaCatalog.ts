import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  discoverTambasaCategories,
  expandAndSyncTambasaCatalog,
  isTambasaCatalogRunning,
} from "../services/tambasaCatalogService";

const configInput = z.object({
  scraperConfigId: z.number().int().positive(),
  maxCategories: z.number().int().min(10).max(3_000).optional(),
});

export const tambasaCatalogRouter = router({
  /** Informa se a descoberta/sincronização completa está em execução. */
  status: protectedProcedure
    .input(z.object({ scraperConfigId: z.number().int().positive() }))
    .query(({ input }) => ({
      running: isTambasaCatalogRunning(input.scraperConfigId),
    })),

  /**
   * Faz uma varredura autenticada das categorias disponíveis para a conta,
   * sem cadastrar produtos nem alterar a configuração salva.
   */
  descobrirCategorias: adminProcedure
    .input(configInput)
    .mutation(({ input }) =>
      discoverTambasaCategories(input.scraperConfigId, {
        maxCategories: input.maxCategories,
      }),
    ),

  /**
   * Descobre todo o catálogo, grava as rotas encontradas no conector e inicia
   * a captura completa, com cadastro, deduplicação, ofertas e histórico.
   */
  sincronizarCompleto: adminProcedure
    .input(configInput)
    .mutation(({ input }) =>
      expandAndSyncTambasaCatalog(input.scraperConfigId, {
        maxCategories: input.maxCategories,
      }),
    ),
});
