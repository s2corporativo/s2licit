import { z } from "zod";
import { protectedProcedure, editorProcedure, router } from "../_core/trpc";
import { addEquivalenceMember, applyEquivalenceGroups, createEquivalenceGroup, deleteEquivalenceGroup, getEquivalenceGroupWithMembers, getEquivalenceStats, listEquivalenceGroups, previewEquivalenceGroups, removeEquivalenceMember } from "../db";

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
