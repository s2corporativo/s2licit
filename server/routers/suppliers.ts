import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { createSupplier, deleteSupplier, getSupplierById, listSuppliers, updateSupplier } from "../db";

export const suppliersRouter = router({
    list: protectedProcedure
      .input(z.object({ activeOnly: z.boolean().optional() }).optional())
      .query(({ input }) => listSuppliers(input?.activeOnly)),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getSupplierById(input.id)),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(256),
          code: z.string().optional(),
          contact: z.string().optional(),
          email: z.string().email().optional().or(z.literal("")),
          phone: z.string().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(({ input }) => createSupplier(input)),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(256).optional(),
          code: z.string().optional(),
          contact: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          notes: z.string().optional(),
          isActive: z.enum(["yes", "no"]).optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateSupplier(id, data);
      }),

    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteSupplier(input.id)),
  });
