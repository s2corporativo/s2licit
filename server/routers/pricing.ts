import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";

export const pricingRouter = router({
  calculateBatchPrices: adminProcedure
    .input(z.object({
      products: z.array(z.object({ id: z.number(), basePrice: z.number() })),
      marginPercentage: z.number().positive(),
      icmsPercentage: z.number().min(0).default(0),
      freightValue: z.number().min(0).default(0),
    }))
    .query(({ input }: { input: any }) => {
      return input.products.map((p: any) => ({
        id: p.id,
        basePrice: p.basePrice,
        finalPrice: p.basePrice * (1 + input.marginPercentage / 100) * (1 + input.icmsPercentage / 100) + input.freightValue,
      }));
    }),

  getDefaultConfig: adminProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(({ input }: { input: any }) => {
      return {
        supplierId: input.supplierId,
        marginPercentage: 20,
        icmsPercentage: 18,
        freightValue: 0,
      };
    }),

  calculateSavings: adminProcedure
    .input(z.object({ originalPrice: z.number().positive(), newPrice: z.number().positive() }))
    .query(({ input }: { input: any }) => {
      const savings = input.originalPrice - input.newPrice;
      const savingsPercentage = (savings / input.originalPrice) * 100;
      return { savings, savingsPercentage };
    }),

  validateConfig: adminProcedure
    .input(z.object({
      supplierId: z.number(),
      marginPercentage: z.number().min(0),
      icmsPercentage: z.number().min(0).default(0),
      freightValue: z.number().min(0).default(0),
    }))
    .query(({ input }: { input: any }) => {
      const errors = [];
      if (input.marginPercentage < 0) errors.push("Margem não pode ser negativa");
      if (input.icmsPercentage < 0) errors.push("ICMS não pode ser negativo");
      return { isValid: errors.length === 0, errors };
    }),
});
