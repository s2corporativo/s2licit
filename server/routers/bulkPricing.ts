import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createBulkPricingApplication,
  listBulkPricingApplications,
  getBulkPricingApplication,
  createBulkPricingDetails,
  getBulkPricingDetails,
  applyPricesToProducts,
  revertBulkPricingApplication,
} from "../db/bulkPricingQueries";
import { getDb } from "../db";
import { products } from "../../drizzle/schema";
import { inArray } from "drizzle-orm";

export const bulkPricingRouter = router({
  /**
   * Aplicar precificação em massa para múltiplos produtos
   */
  applyBulkPricing: adminProcedure
    .input(
      z.object({
        productIds: z.array(z.number()).min(1, "Selecione pelo menos um produto"),
        marginPercentage: z.number().min(0),
        icmsPercentage: z.number().min(0).default(0),
        ipPercentage: z.number().min(0).default(0),
        pisPercentage: z.number().min(0).default(0),
        cofinsPercentage: z.number().min(0).default(0),
        freightType: z.enum(["fixed", "percentage"]).default("fixed"),
        freightValue: z.number().min(0).default(0),
        roundingMethod: z.enum(["round", "ceil", "floor"]).default("round"),
        categoryId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        // Buscar produtos
        const productList = await db
          .select({ id: products.id, price: products.price, name: products.name })
          .from(products)
          .where(inArray(products.id, input.productIds));

        if (productList.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum produto encontrado" });
        }

        // Calcular novos preços
        const margin = input.marginPercentage / 100;
        const icms = input.icmsPercentage / 100;
        const ip = input.ipPercentage / 100;
        const pis = input.pisPercentage / 100;
        const cofins = input.cofinsPercentage / 100;
        const totalTax = icms + ip + pis + cofins;

        const updates = productList.map((p) => {
          const basePrice = Number(p.price) || 0;
          const freightAmount =
            input.freightType === "percentage"
              ? basePrice * (input.freightValue / 100)
              : input.freightValue;
          const priceAfterTax = basePrice * (1 + totalTax);
          const priceAfterFreight = priceAfterTax + freightAmount;
          let newPrice = priceAfterFreight * (1 + margin);

          // Arredondamento
          if (input.roundingMethod === "ceil") newPrice = Math.ceil(newPrice * 100) / 100;
          else if (input.roundingMethod === "floor") newPrice = Math.floor(newPrice * 100) / 100;
          else newPrice = Math.round(newPrice * 100) / 100;

          return {
            productId: p.id,
            oldPrice: basePrice,
            newPrice,
            priceIncrease: newPrice - basePrice,
          };
        });

        // Aplicar preços no banco
        const { updated, errors } = await applyPricesToProducts(
          updates.map((u) => ({ productId: u.productId, newPrice: u.newPrice }))
        );

        // Calcular estatísticas
        const avgIncrease =
          updates.reduce((sum, u) => sum + u.priceIncrease, 0) / updates.length;
        const minNewPrice = Math.min(...updates.map((u) => u.newPrice));
        const maxNewPrice = Math.max(...updates.map((u) => u.newPrice));

        // Registrar aplicação no histórico
        const application = await createBulkPricingApplication({
          categoryId: input.categoryId,
          totalProducts: productList.length,
          updatedCount: updated,
          skippedCount: 0,
          errorCount: errors.length,
          marginPercentage: String(input.marginPercentage),
          icmsPercentage: String(input.icmsPercentage),
          ipPercentage: String(input.ipPercentage),
          pisPercentage: String(input.pisPercentage),
          cofinsPercentage: String(input.cofinsPercentage),
          freightType: input.freightType,
          freightValue: String(input.freightValue),
          averagePriceIncrease: String(avgIncrease),
          minNewPrice: String(minNewPrice),
          maxNewPrice: String(maxNewPrice),
          appliedBy: ctx.user?.id,
          status: errors.length > 0 ? "completed" : "completed",
        });

        // Registrar detalhes
        await createBulkPricingDetails(application.id, updates);

        return {
          success: true,
          totalProducts: productList.length,
          updatedCount: updated,
          skippedCount: 0,
          errorCount: errors.length,
          errors,
          message: `${updated} produtos atualizados com sucesso`,
          details: {
            averagePriceIncrease: avgIncrease,
            minNewPrice,
            maxNewPrice,
          },
          applicationId: application.id,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao aplicar precificação: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Simular aplicação de precificação (preview)
   */
  previewBulkPricing: adminProcedure
    .input(
      z.object({
        productIds: z.array(z.number()).min(1),
        marginPercentage: z.number().min(0),
        icmsPercentage: z.number().min(0).default(0),
        ipPercentage: z.number().min(0).default(0),
        pisPercentage: z.number().min(0).default(0),
        cofinsPercentage: z.number().min(0).default(0),
        freightType: z.enum(["fixed", "percentage"]).default("fixed"),
        freightValue: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        const productList = await db
          .select({ id: products.id, price: products.price, name: products.name })
          .from(products)
          .where(inArray(products.id, input.productIds));

        const margin = input.marginPercentage / 100;
        const icms = input.icmsPercentage / 100;
        const ip = input.ipPercentage / 100;
        const pis = input.pisPercentage / 100;
        const cofins = input.cofinsPercentage / 100;
        const totalTax = icms + ip + pis + cofins;

        const previews = productList.map((p) => {
          const basePrice = Number(p.price) || 0;
          const freightAmount =
            input.freightType === "percentage"
              ? basePrice * (input.freightValue / 100)
              : input.freightValue;
          const priceAfterTax = basePrice * (1 + totalTax);
          const priceAfterFreight = priceAfterTax + freightAmount;
          const newPrice = Math.round(priceAfterFreight * (1 + margin) * 100) / 100;
          const increase = newPrice - basePrice;
          const increasePercentage = basePrice > 0 ? (increase / basePrice) * 100 : 0;

          return {
            productId: p.id,
            productName: p.name,
            currentPrice: basePrice,
            newPrice,
            increase,
            increasePercentage: Math.round(increasePercentage * 100) / 100,
          };
        });

        const totalIncrease = previews.reduce((sum, p) => sum + p.increase, 0);
        const avgIncrease = previews.length > 0 ? totalIncrease / previews.length : 0;

        return {
          success: true,
          products: previews,
          summary: {
            totalProducts: previews.length,
            averageIncrease: Math.round(avgIncrease * 100) / 100,
            minIncrease: Math.min(...previews.map((p) => p.increase)),
            maxIncrease: Math.max(...previews.map((p) => p.increase)),
            totalIncrease: Math.round(totalIncrease * 100) / 100,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao gerar prévia: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Obter histórico de aplicações de precificação
   */
  listApplicationHistory: adminProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const result = await listBulkPricingApplications(input.limit, input.offset);
        return {
          total: result.total,
          applications: result.applications.map((a) => ({
            ...a,
            marginPercentage: Number(a.marginPercentage),
            averagePriceIncrease: Number(a.averagePriceIncrease ?? 0),
            minNewPrice: Number(a.minNewPrice ?? 0),
            maxNewPrice: Number(a.maxNewPrice ?? 0),
          })),
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao buscar histórico: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Reverter aplicação de precificação
   */
  revertApplication: adminProcedure
    .input(z.object({ applicationId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const application = await getBulkPricingApplication(input.applicationId);
        if (!application) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Aplicação não encontrada" });
        }
        if (application.status === "reverted") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Aplicação já foi revertida" });
        }

        const { reverted, errors } = await revertBulkPricingApplication(input.applicationId);

        return {
          success: true,
          reverted,
          errors,
          message: `${reverted} preços revertidos com sucesso`,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao reverter: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Obter detalhes de uma aplicação
   */
  getApplicationDetails: adminProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      try {
        const [application, details] = await Promise.all([
          getBulkPricingApplication(input.applicationId),
          getBulkPricingDetails(input.applicationId),
        ]);

        if (!application) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Aplicação não encontrada" });
        }

        return {
          application: {
            ...application,
            marginPercentage: Number(application.marginPercentage),
          },
          details: details.map((d) => ({
            ...d,
            oldPrice: Number(d.oldPrice),
            newPrice: Number(d.newPrice),
            priceIncrease: Number(d.priceIncrease),
          })),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao buscar detalhes: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),
});
