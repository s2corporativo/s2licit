import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getCompanySettings, upsertCompanySettings } from "../db";

export const companyRouter = router({
    get: protectedProcedure.query(() => getCompanySettings()),
    upsert: protectedProcedure
      .input(
        z.object({
          name: z.string().max(256).optional(),
          cnpj: z.string().max(18).optional().nullable(),
          address: z.string().optional().nullable(),
          city: z.string().max(128).optional().nullable(),
          state: z.string().max(2).optional().nullable(),
          zipCode: z.string().max(10).optional().nullable(),
          phone: z.string().max(32).optional().nullable(),
          email: z.string().max(320).optional().nullable(),
          website: z.string().max(256).optional().nullable(),
          logoUrl: z.string().optional().nullable(),
          bankInfo: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
          minMarginPercent: z.number().min(0).max(100).optional().nullable(),
        })
      )
      .mutation(({ input }) => upsertCompanySettings(input as any)),
  });
