import { z } from "zod";
import { protectedProcedure, editorProcedure, router } from "../_core/trpc";
import { addEquivalenceMember, applyEquivalenceGroups, autoConfirmAboveThreshold, confirmEquivalenceGroup, createEquivalenceGroup, decideRelation, deleteEquivalenceGroup, getEquivalenceGroupWithMembers, getEquivalenceStats, getRelationStats, listConfirmedRelations, listEquivalenceGroups, listPendingRelations, listRelationsByProduct, previewEquivalenceGroups, removeEquivalenceMember, removeRelation, updateEquivalenceGroupRelation, upsertRelation, VALID_RELATION_TYPES } from "../db";

// Esquema Zod compartilhado do tipo de relação (Fonte Única para os routers).
export const relationTypeSchema = z.enum(
  VALID_RELATION_TYPES as unknown as [string, ...string[]]
) as z.ZodType<(typeof VALID_RELATION_TYPES)[number]>;

export const equivalencesRouter = router({
    list: protectedProcedure
      .input(z.object({ categoryId: z.number().optional() }).optional())
      .query(({ input }) => listEquivalenceGroups(input?.categoryId)),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getEquivalenceGroupWithMembers(input.id)),

    create: protectedProcedure
      .input(
        z.object({
          activeIngredient: z.string().min(1),
          categoryId: z.number().optional(),
          notes: z.string().optional(),
          productIds: z.array(z.number()).min(1),
        })
      )
      .mutation(({ input }) => createEquivalenceGroup(input)),

    updateRelation: editorProcedure
      .input(
        z.object({
          groupId: z.number(),
          relationType: relationTypeSchema,
          reason: z.string().optional(),
          confidence: z.number().min(0).max(1).nullable().optional(),
        })
      )
      .mutation(({ input }) => updateEquivalenceGroupRelation(input.groupId, input)),

    confirm: protectedProcedure
      .input(z.object({ groupId: z.number() }))
      .mutation(({ ctx, input }) =>
        confirmEquivalenceGroup(input.groupId, ctx.user?.id ?? null)
      ),

    addMember: protectedProcedure
      .input(z.object({ groupId: z.number(), productId: z.number() }))
      .mutation(({ input }) => addEquivalenceMember(input.groupId, input.productId)),

    removeMember: protectedProcedure
      .input(z.object({ groupId: z.number(), productId: z.number() }))
      .mutation(({ input }) => removeEquivalenceMember(input.groupId, input.productId)),

    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteEquivalenceGroup(input.id)),

    // Auto-geração de grupos por princípio ativo
    preview: protectedProcedure
      .input(
        z.object({
          batchId: z.number().optional(),
          categoryIdsA: z.array(z.number()).optional(),
          categoryIdsB: z.array(z.number()).optional(),
        }).optional()
      )
      .mutation(({ input }) =>
        previewEquivalenceGroups({
          batchId: input?.batchId,
          categoryIdsA: input?.categoryIdsA,
          categoryIdsB: input?.categoryIdsB,
        })
      ),

    applyAuto: protectedProcedure
      .input(
        z.object({
          groups: z.array(
            z.object({
              activeIngredient: z.string().min(1),
              productIds: z.array(z.number()),
              existingGroupId: z.number().nullable(),
            })
          ),
        })
      )
      .mutation(({ input }) => applyEquivalenceGroups(input.groups)),

    stats: protectedProcedure.query(() => getEquivalenceStats()),

    // ─── Relações entre produtos (product_relations) ───────────────────────────
    relationsList: protectedProcedure
      .input(z.object({ productId: z.number().optional(), pending: z.boolean().default(false) }).optional())
      .query(({ input }) => {
        if (input?.productId) return listRelationsByProduct(input.productId);
        if (input?.pending) return listPendingRelations();
        return listConfirmedRelations([]);
      }),

    relationCreate: protectedProcedure
      .input(
        z.object({
          productIdA: z.number(),
          productIdB: z.number(),
          relationType: relationTypeSchema,
          score: z.number().min(0).max(1).nullable().optional(),
          evidence: z
            .object({
              reason: z.string().optional(),
              matchingFields: z.record(z.string(), z.string()).optional(),
              conflictingFields: z
                .record(z.string(), z.object({ a: z.string(), b: z.string() }))
                .optional(),
            })
            .optional(),
        })
      )
      .mutation(({ ctx, input }) =>
        upsertRelation(input, { decidedBy: "user", userId: ctx.user?.id ?? null })
      ),

    relationDecide: editorProcedure
      .input(
        z.object({
          id: z.number(),
          decision: z.enum(["confirmed", "rejected"]),
        })
      )
      .mutation(({ ctx, input }) =>
        decideRelation(input.id, input.decision, ctx.user?.id ?? null)
      ),

    relationRemove: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => removeRelation(input.id)),

    relationsAutoConfirm: editorProcedure
      .input(z.object({ threshold: z.number().min(0).max(1).default(0.9) }).optional())
      .mutation(({ input }) => autoConfirmAboveThreshold(input?.threshold ?? 0.9)),

    relationsStats: protectedProcedure.query(() => getRelationStats()),

    relationsByProducts: protectedProcedure
      .input(z.object({ productIds: z.array(z.number()).min(2).max(500) }))
      .query(({ input }) => listConfirmedRelations(input.productIds)),
    // Geração inicial com 1 clique: preview + apply automático de todos os grupos novos
    generateAndApplyAll: protectedProcedure
      .input(
        z.object({
          crossOnly: z.boolean().default(false), // se true, apenas grupos que cruzam categorias
        }).optional()
      )
      .mutation(async ({ input }) => {
        // 1. Preview sem filtro de categoria (analisa todos os produtos)
        const groups = await previewEquivalenceGroups({});
        // 2. Filtra apenas grupos novos (sem grupo existente)
        const newGroups = groups.filter((g) => g.existingGroupId === null);
        // 3. Se crossOnly, filtra apenas grupos que cruzam categorias
        const toApply = input?.crossOnly
          ? newGroups.filter((g) => g.crossCategory)
          : newGroups;
        if (toApply.length === 0) return { created: 0, updated: 0, skipped: 0, total: groups.length };
        // 4. Aplica todos os grupos novos
        const result = await applyEquivalenceGroups(
          toApply.map((g) => ({
            activeIngredient: g.activeIngredient,
            productIds: g.members.map((m) => m.id),
            existingGroupId: null,
          }))
        );
        return { ...result, total: groups.length };
      }),
  });
