import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  getCaptureJobStatus,
  getConnectorHealthList,
} from "../services/captureCoreService";
import {
  decideSafeCaptureObservation,
  listSafeCaptureReviewQueue,
} from "../services/captureSafeProcessor";
import { enqueuePriorityRefreshForTerms } from "../services/capturePriorityRefreshService";
import { captureRunnerStatus } from "../jobs/captureJobRunner";

export const captureCoreRouter = router({
  health: protectedProcedure.query(() => getConnectorHealthList()),

  jobStatus: protectedProcedure
    .input(z.object({ scraperConfigId: z.number().int().positive() }))
    .query(({ input }) => getCaptureJobStatus(input.scraperConfigId)),

  reviewQueue: adminProcedure
    .input(z.object({
      scraperConfigId: z.number().int().positive().optional(),
      supplierId: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    }).default({ limit: 100 }))
    .query(({ input }) => listSafeCaptureReviewQueue(input)),

  decideObservation: adminProcedure
    .input(z.object({
      observationId: z.number().int().positive(),
      decision: z.enum(["approve", "reject"]),
      expectedProductId: z.number().int().positive().nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(({ input, ctx }) => decideSafeCaptureObservation({
      ...input,
      userId: ctx.user.id,
    })),

  /** Atualização prioritária para itens de edital/proposta/cotação. */
  refreshTerms: adminProcedure
    .input(z.object({
      terms: z.array(z.string().min(1).max(512)).min(1).max(500),
      trigger: z.enum(["proposal", "api", "manual"]).default("proposal"),
    }))
    .mutation(({ input, ctx }) => enqueuePriorityRefreshForTerms({
      terms: input.terms,
      trigger: input.trigger,
      createdByUserId: ctx.user.id,
      priority: 100,
    })),

  runnerStatus: adminProcedure.query(() => captureRunnerStatus()),
});
