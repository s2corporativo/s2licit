import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  getCaptureJobStatus,
  getConnectorHealthList,
} from "../services/captureCoreService";
import { listCaptureReviewObservations } from "../services/captureObservationService";
import { decideCaptureObservationTransactional } from "../services/captureReviewService";
import { enqueuePriorityRefreshForTerms } from "../services/capturePriorityRefreshService";
import { captureRunnerStatus } from "../jobs/captureJobRunner";

const reviewQueueInput = z.object({
  scraperConfigId: z.number().int().positive().optional(),
  supplierId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(500).default(100),
}).default({ limit: 100 });

const decisionInput = z.object({
  observationId: z.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
  expectedProductId: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

export const captureCoreRouter = router({
  health: protectedProcedure.query(() => getConnectorHealthList()),

  jobStatus: protectedProcedure
    .input(z.object({ scraperConfigId: z.number().int().positive() }))
    .query(({ input }) => getCaptureJobStatus(input.scraperConfigId)),

  reviewQueue: adminProcedure
    .input(reviewQueueInput)
    .query(({ input }) => listCaptureReviewObservations(input)),

  decideObservation: adminProcedure
    .input(decisionInput)
    .mutation(({ input, ctx }) =>
      decideCaptureObservationTransactional({
        ...input,
        userId: ctx.user.id,
      }),
    ),

  refreshTerms: adminProcedure
    .input(z.object({
      terms: z.array(z.string().trim().min(1).max(512)).min(1).max(500),
      trigger: z.enum(["proposal", "api", "manual"]).default("proposal"),
    }))
    .mutation(({ input, ctx }) =>
      enqueuePriorityRefreshForTerms({
        terms: input.terms,
        trigger: input.trigger,
        createdByUserId: ctx.user.id,
        priority: 100,
      }),
    ),

  runnerStatus: adminProcedure.query(() => captureRunnerStatus()),
});
