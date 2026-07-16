import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { precoFinalUnificado } from "../services/precoUnificado";
import { avaliarFrescorPrecos } from "../services/priceFreshnessService";

export const pricingRouter = router({
  /** §13 — quais preços dos produtos estão vencidos (para a revisão). */
  priceFreshness: protectedProcedure
    .input(z.object({ productIds: z.array(z.number().int().positive()).max(500) }))
    .query(({ input }) => avaliarFrescorPrecos(input.productIds)),

  calculateBatchPrices: adminProcedure
    .input(z.object({
      products: z.array(z.object({ id: z.number(), basePrice: z.number() })),
      marginPercentage: z.number().positive(),
      icmsPercentage: z.number().min(0).default(0),
      freightValue: z.number().min(0).default(0),
    }))
    .query(({ input }: { input: any }) => {
      // Fórmula unificada (divisor, imposto por dentro) — antes usava markup
      // multiplicativo `custo·(1+margem)·(1+icms)+frete`, que subprecificava.
      return input.products.map((p: any) => {
        const preco = precoFinalUnificado({
          custo: p.basePrice,
          margemPct: input.marginPercentage,
          impostosPct: input.icmsPercentage,
          freteUnit: input.freightValue,
        });
        return {
          id: p.id,
          basePrice: p.basePrice,
          finalPrice: preco ?? p.basePrice,
        };
      });
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
