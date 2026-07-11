import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

export const alertConfigRouter = router({
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    
    // Placeholder - implement when alert_configs table is available
    return { 
      userId: ctx.user.id, 
      priceVariationThreshold: 10, 
      notifyOnScraperFailure: true, 
      notifyOnNewTenders: true, 
      emailNotifications: true 
    };
  }),

  updateConfig: protectedProcedure
    .input(z.object({
      priceVariationThreshold: z.number().min(0).max(100).optional(),
      notifyOnScraperFailure: z.boolean().optional(),
      notifyOnNewTenders: z.boolean().optional(),
      emailNotifications: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      
      // Placeholder - implement when alert_configs table is available
      return { success: true };
    }),
});
