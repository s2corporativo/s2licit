import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { deleteRequestingOrg, getRequestingOrgById, listRequestingOrgs, updateRequestingOrg, upsertRequestingOrg } from "../db";

export const orgsRouter = router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }))
      .query(({ input }) => listRequestingOrgs(input.search)),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getRequestingOrgById(input.id)),

    upsert: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(256),
          cnpj: z.string().max(18).optional().nullable(),
          address: z.string().optional().nullable(),
          city: z.string().max(128).optional().nullable(),
          state: z.string().max(2).optional().nullable(),
          phone: z.string().max(32).optional().nullable(),
          email: z.string().max(320).optional().nullable(),
          contactPerson: z.string().max(256).optional().nullable(),
          notes: z.string().optional().nullable(),
        })
      )
      .mutation(({ input }) => upsertRequestingOrg(input as any)),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(256).optional(),
          cnpj: z.string().max(18).optional().nullable(),
          address: z.string().optional().nullable(),
          city: z.string().max(128).optional().nullable(),
          state: z.string().max(2).optional().nullable(),
          phone: z.string().max(32).optional().nullable(),
          email: z.string().max(320).optional().nullable(),
          contactPerson: z.string().max(256).optional().nullable(),
          notes: z.string().optional().nullable(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateRequestingOrg(id, data as any);
      }),

    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteRequestingOrg(input.id)),
  });
