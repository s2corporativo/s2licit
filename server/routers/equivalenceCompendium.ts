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
import { assessCandidatesWithCompendiumKnowledge } from "../services/equivalenceKnowledgeAiService";

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
      // O motor determinístico sempre roda primeiro. Isso garante operação mesmo
      // sem provedor de IA e impede que a LLM seja usada como filtro primário.
      const base = await analyzeEquivalences({ ...input, useAI: false });
      const guarded = enforceCriticalTechnicalGuards(base.reference, base.candidates);

      const aiResult = input.useAI === false
        ? { candidates: guarded, knowledgeCount: 0, precedentCount: 0, aiUsed: false }
        : await assessCandidatesWithCompendiumKnowledge({ reference: base.reference, candidates: guarded });

      // Decisão humana persistida é aplicada por último e prevalece quando o
      // contexto técnico coincide; nunca sobrepõe um bloqueio técnico crítico.
      const learned = await applyPersistedEquivalenceMemory({
        reference: base.reference,
        description: input.description,
        candidates: aiResult.candidates,
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

      return {
        ...base,
        candidates: learned,
        engine: input.useAI === false ? "deterministic_memory" : aiResult.aiUsed ? "compendium_grounded_ai" : "deterministic_memory_fallback",
        compendiumKnowledgeCount: aiResult.knowledgeCount,
        feedbackMemoryCount: aiResult.precedentCount,
      };
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
