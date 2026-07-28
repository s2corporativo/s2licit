import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  syncPortalOpportunities,
  type PortalOpportunitySource,
} from "../services/portalOpportunitySyncService";

const sourceEnum = z.enum(["fundep", "funarbe"]);

export const portalOpportunitySyncRouter = router({
  status: protectedProcedure.query(() => ({
    enabled: process.env.PORTAL_OPPORTUNITY_SYNC_ENABLED !== "false",
    cron: process.env.PORTAL_OPPORTUNITY_SYNC_CRON || "0 7,12,17 * * *",
    timezone: "America/Sao_Paulo",
    sources: ["fundep", "funarbe"] as PortalOpportunitySource[],
    submissionPolicy:
      "O sistema captura, cruza com a Tambasa e prepara a proposta. O envio exige confirmação humana.",
  })),

  sync: adminProcedure
    .input(
      z
        .object({
          sources: z.array(sourceEnum).min(1).max(2).optional(),
          maxFundepGroups: z.number().int().min(1).max(200).optional(),
        })
        .optional(),
    )
    .mutation(({ input }) =>
      syncPortalOpportunities({
        sources: input?.sources,
        maxFundepGroups: input?.maxFundepGroups,
      }),
    ),
});
