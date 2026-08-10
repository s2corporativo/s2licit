import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { recordAudit } from "../services/auditService";
import {
  analyzeEquivalences,
  bootstrapCompendiumFromCatalog,
  compendiumStats,
  getCompendiumEntry,
  listCompendium,
  recordEquivalenceFeedback,
  validateCompendiumEntry,
} from "../services/equivalenceCompendiumService";
import { applyPersistedEquivalenceMemory, enforceCriticalTechnicalGuards } from "../services/equivalenceGuardService";

export const equivalenceCompendiumRouter = router({
  stats: protectedProcedure.query(() => compendiumStats()),

  list: protectedProcedure.input(z.object({
    search: z.string().max(256).optional(),
    status: z.enum(["draft", "ai_review", "human_validated", "rejected"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  }).optional()).query(({ input }) => listCompendium(input ?? {})),

  get: protectedProcedure
    .input(z.object({ entryId: z.number().int().positive() }))
    .query(({ input }) => getCompendiumEntry(input.entryId)),

  analyze: protectedProcedure
    .input(z.object({
      productId: z.number().int().positive().optional(),
      description: z.string().min(2).max(12000).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      useAI: z.boolean().optional(),
    }).refine((value) => Boolean(value.productId || value.description?.trim()), {
      message: "Informe productId ou description",
    }))
    .mutation(async ({ input }) => {
      const result = await analyzeEquivalences(input);
      const guarded = enforceCriticalTechnicalGuards(result.reference, result.candidates);
      const learned = await applyPersistedEquivalenceMemory({
        reference: result.reference,
        description: input.description,
        candidates: guarded,
      });
      const rank = (candidate: (typeof learned)[number]) =>
        candidate.aiAssessment?.decision === "approved" ? 0 :
        candidate.aiAssessment?.decision === "needs_review" ? 1 : 2;
      learned.sort((a, b) => {
        const decision = rank(a) - rank(b);
        if (decision) return decision;
        if (b.technicalScore !== a.technicalScore) return b.technicalScore - a.technicalScore;
        const aPrice = Number(a.bestOffer?.effectivePrice ?? Number.POSITIVE_INFINITY);
        const bPrice = Number(b.bestOffer?.effectivePrice ?? Number.POSITIVE_INFINITY);
        return aPrice - bPrice;
      });
      return { ...result, candidates: learned };
    }),

  bootstrap: editorProcedure
    .input(z.object({ limit: z.number().int().min(1).max(2000).default(500) }).optional())
    .mutation(async ({ input, ctx }) => {
      const result = await bootstrapCompendiumFromCatalog(input?.limit ?? 500);
      await recordAudit({
        userId: ctx.user.id,
        action: "equivalence_compendium_bootstrap",
        entity: "equivalence_compendium_entries",
        summary: `Compêndio inicializado: ${result.entriesCreated} entradas; ${result.membersLinked} vínculos`,
        changes: result,
      });
      return result;
    }),

  feedback: editorProcedure
    .input(z.object({
      queryText: z.string().max(12000).optional(),
      referenceProductId: z.number().int().positive().optional(),
      candidateProductId: z.number().int().positive(),
      entryId: z.number().int().positive().optional(),
      decision: z.enum(["approved", "rejected", "needs_review"]),
      reason: z.string().max(4000).optional(),
      scoreSnapshot: z.unknown().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await recordEquivalenceFeedback({ ...input, userId: ctx.user.id });
      await recordAudit({
        userId: ctx.user.id,
        action: "equivalence_feedback",
        entity: "equivalence_compendium_feedback",
        entityId: input.candidateProductId,
        summary: `Decisão de equivalência: ${input.decision}`,
        changes: {
          referenceProductId: input.referenceProductId,
          candidateProductId: input.candidateProductId,
          entryId: input.entryId,
          decision: input.decision,
          reason: input.reason,
        },
      });
      return result;
    }),

  validateEntry: editorProcedure
    .input(z.object({ entryId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const result = await validateCompendiumEntry(input.entryId, ctx.user.id);
      await recordAudit({
        userId: ctx.user.id,
        action: "equivalence_compendium_validate",
        entity: "equivalence_compendium_entries",
        entityId: input.entryId,
        summary: "Entrada do compêndio validada por humano",
      });
      return result;
    }),
});
