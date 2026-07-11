import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  evaluateOpportunity,
  getDecision,
  listRecentDecisions,
  recalculateDecision,
} from "../services/executiveDecisionService";

export const executiveDecisionRouter = router({
  evaluate: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .mutation(async ({ input }) => evaluateOpportunity(input.proposalId)),

  getDecision: protectedProcedure
    .input(z.object({ decisionId: z.number() }))
    .query(async ({ input }) => getDecision(input.decisionId)),

  listRecentDecisions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => listRecentDecisions(input.limit)),

  recalculateDecision: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .mutation(async ({ input }) => recalculateDecision(input.proposalId)),
});
