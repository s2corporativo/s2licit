import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { syncS2PortalOpportunities } from "../services/s2PortalOpportunitySyncService";
import {
  S2_TARGET_PORTAL_DEFINITIONS,
  S2_TARGET_PORTALS,
  type S2TargetPortal,
} from "../services/s2TargetPortals";

const sourceEnum = z.enum([
  "copasa",
  "cemig",
  "fundep",
  "funarbe",
  "comprasmg",
  "fiemg",
]);

export const portalOpportunitySyncRouter = router({
  status: protectedProcedure.query(() => ({
    enabled: process.env.PORTAL_OPPORTUNITY_SYNC_ENABLED !== "false",
    cron: process.env.PORTAL_OPPORTUNITY_SYNC_CRON || "0 7,12,17 * * *",
    timezone: "America/Sao_Paulo",
    sources: S2_TARGET_PORTALS.map((source) => ({
      source,
      label: S2_TARGET_PORTAL_DEFINITIONS[source].label,
      publicUrl: S2_TARGET_PORTAL_DEFINITIONS[source].publicUrl,
      discovery: S2_TARGET_PORTAL_DEFINITIONS[source].discovery,
    })),
    submissionPolicy:
      "O sistema captura, cruza com a Tambasa e prepara a proposta. Login, CAPTCHA e envio final exigem intervenção ou confirmação humana.",
  })),

  sync: adminProcedure
    .input(
      z
        .object({
          sources: z.array(sourceEnum).min(1).max(6).optional(),
          maxFundepGroups: z.number().int().min(1).max(200).optional(),
        })
        .optional(),
    )
    .mutation(({ input }) =>
      syncS2PortalOpportunities({
        sources: input?.sources as S2TargetPortal[] | undefined,
        maxFundepGroups: input?.maxFundepGroups,
      }),
    ),
});
