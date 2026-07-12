import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { precoFinalUnificado } from "../services/precoUnificado";
import {
  listCategoryPricingRules,
  getCategoryPricingRule,
  createCategoryPricingRule,
  updateCategoryPricingRule,
  deleteCategoryPricingRule,
} from "../db/categoryPricingQueries";

export const categoryPricingRouter = router({
  /**
   * Listar todas as regras de precificação por categoria
   */
  listRules: protectedProcedure.query(async () => {
    try {
      const rules = await listCategoryPricingRules();
      return rules.map((r) => ({
        ...r,
        marginPercentage: Number(r.marginPercentage),
        icmsPercentage: Number(r.icmsPercentage ?? 0),
        ipPercentage: Number(r.ipPercentage ?? 0),
        pisPercentage: Number(r.pisPercentage ?? 0),
        cofinsPercentage: Number(r.cofinsPercentage ?? 0),
        freightValue: Number(r.freightValue ?? 0),
        minPrice: r.minPrice ? Number(r.minPrice) : null,
        maxPrice: r.maxPrice ? Number(r.maxPrice) : null,
        isActive: r.isActive === "yes",
      }));
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Erro ao listar regras: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }),

  /**
   * Obter regra por ID de categoria
   */
  getRule: protectedProcedure
    .input(z.object({ categoryId: z.number() }))
    .query(async ({ input }) => {
      try {
        const rule = await getCategoryPricingRule(input.categoryId);
        if (!rule) return null;
        return {
          ...rule,
          marginPercentage: Number(rule.marginPercentage),
          icmsPercentage: Number(rule.icmsPercentage ?? 0),
          ipPercentage: Number(rule.ipPercentage ?? 0),
          pisPercentage: Number(rule.pisPercentage ?? 0),
          cofinsPercentage: Number(rule.cofinsPercentage ?? 0),
          freightValue: Number(rule.freightValue ?? 0),
          minPrice: rule.minPrice ? Number(rule.minPrice) : null,
          maxPrice: rule.maxPrice ? Number(rule.maxPrice) : null,
          isActive: rule.isActive === "yes",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao obter regra: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Criar nova regra de precificação
   */
  createRule: adminProcedure
    .input(
      z.object({
        categoryId: z.number(),
        marginPercentage: z.number().min(0),
        icmsPercentage: z.number().min(0).default(0),
        ipPercentage: z.number().min(0).default(0),
        pisPercentage: z.number().min(0).default(0),
        cofinsPercentage: z.number().min(0).default(0),
        freightType: z.enum(["fixed", "percentage"]).default("fixed"),
        freightValue: z.number().min(0).default(0),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        roundingMethod: z.enum(["round", "ceil", "floor"]).default("round"),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const rule = await createCategoryPricingRule({
          categoryId: input.categoryId,
          marginPercentage: String(input.marginPercentage),
          icmsPercentage: String(input.icmsPercentage),
          ipPercentage: String(input.ipPercentage),
          pisPercentage: String(input.pisPercentage),
          cofinsPercentage: String(input.cofinsPercentage),
          freightType: input.freightType,
          freightValue: String(input.freightValue),
          minPrice: input.minPrice ? String(input.minPrice) : undefined,
          maxPrice: input.maxPrice ? String(input.maxPrice) : undefined,
          roundingMethod: input.roundingMethod,
          isActive: input.isActive ? "yes" : "no",
        });

        return {
          ...rule,
          marginPercentage: Number(rule.marginPercentage),
          icmsPercentage: Number(rule.icmsPercentage ?? 0),
          ipPercentage: Number(rule.ipPercentage ?? 0),
          pisPercentage: Number(rule.pisPercentage ?? 0),
          cofinsPercentage: Number(rule.cofinsPercentage ?? 0),
          freightValue: Number(rule.freightValue ?? 0),
          isActive: rule.isActive === "yes",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao criar regra: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Atualizar regra existente
   */
  updateRule: adminProcedure
    .input(
      z.object({
        categoryId: z.number(),
        marginPercentage: z.number().min(0).optional(),
        icmsPercentage: z.number().min(0).optional(),
        ipPercentage: z.number().min(0).optional(),
        pisPercentage: z.number().min(0).optional(),
        cofinsPercentage: z.number().min(0).optional(),
        freightType: z.enum(["fixed", "percentage"]).optional(),
        freightValue: z.number().min(0).optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        roundingMethod: z.enum(["round", "ceil", "floor"]).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { categoryId, ...rest } = input;

        const updateData: Record<string, any> = {};
        if (rest.marginPercentage !== undefined) updateData.marginPercentage = String(rest.marginPercentage);
        if (rest.icmsPercentage !== undefined) updateData.icmsPercentage = String(rest.icmsPercentage);
        if (rest.ipPercentage !== undefined) updateData.ipPercentage = String(rest.ipPercentage);
        if (rest.pisPercentage !== undefined) updateData.pisPercentage = String(rest.pisPercentage);
        if (rest.cofinsPercentage !== undefined) updateData.cofinsPercentage = String(rest.cofinsPercentage);
        if (rest.freightType !== undefined) updateData.freightType = rest.freightType;
        if (rest.freightValue !== undefined) updateData.freightValue = String(rest.freightValue);
        if (rest.minPrice !== undefined) updateData.minPrice = String(rest.minPrice);
        if (rest.maxPrice !== undefined) updateData.maxPrice = String(rest.maxPrice);
        if (rest.roundingMethod !== undefined) updateData.roundingMethod = rest.roundingMethod;
        if (rest.isActive !== undefined) updateData.isActive = rest.isActive ? "yes" : "no";

        const rule = await updateCategoryPricingRule(categoryId, updateData);
        return {
          ...rule,
          marginPercentage: Number(rule.marginPercentage),
          icmsPercentage: Number(rule.icmsPercentage ?? 0),
          ipPercentage: Number(rule.ipPercentage ?? 0),
          pisPercentage: Number(rule.pisPercentage ?? 0),
          cofinsPercentage: Number(rule.cofinsPercentage ?? 0),
          freightValue: Number(rule.freightValue ?? 0),
          isActive: rule.isActive === "yes",
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao atualizar regra: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Deletar regra
   */
  deleteRule: adminProcedure
    .input(z.object({ categoryId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const deleted = await deleteCategoryPricingRule(input.categoryId);
        return { success: deleted };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao deletar regra: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Calcular preço com regra de categoria
   */
  calculatePrice: protectedProcedure
    .input(
      z.object({
        categoryId: z.number(),
        basePrice: z.number().min(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const rule = await getCategoryPricingRule(input.categoryId);
        if (!rule) {
          return {
            basePrice: input.basePrice,
            finalPrice: input.basePrice,
            breakdown: null,
            ruleFound: false,
          };
        }

        const margin = Number(rule.marginPercentage) / 100;
        const icms = Number(rule.icmsPercentage ?? 0) / 100;
        const ip = Number(rule.ipPercentage ?? 0) / 100;
        const pis = Number(rule.pisPercentage ?? 0) / 100;
        const cofins = Number(rule.cofinsPercentage ?? 0) / 100;
        const totalTax = icms + ip + pis + cofins;

        const freightValue = Number(rule.freightValue ?? 0);
        const freightAmount =
          rule.freightType === "percentage"
            ? input.basePrice * (freightValue / 100)
            : freightValue;

        // Fórmula unificada (divisor, imposto por dentro) — antes markup.
        const finalPrice = precoFinalUnificado({
          custo: input.basePrice, margemPct: margin * 100,
          impostosPct: totalTax * 100, freteUnit: freightAmount,
        }) ?? input.basePrice;

        return {
          basePrice: input.basePrice,
          finalPrice: Math.round(finalPrice * 100) / 100,
          ruleFound: true,
          breakdown: {
            // Imposto por dentro: % sobre a venda (finalPrice).
            taxAmount: Math.round(finalPrice * totalTax * 100) / 100,
            freightAmount,
            marginAmount:
              Math.round((finalPrice - input.basePrice - freightAmount - finalPrice * totalTax) * 100) / 100,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao calcular preço: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),
});
