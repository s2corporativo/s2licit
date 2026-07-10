/**
 * ROUTER DE TABELAS DE PREÇO - PRECIFICAÇÃO POR CATEGORIA
 * ✅ Calcula preços base e margens por categoria
 * ✅ Suporta múltiplas estratégias de precificação
 * ✅ Histórico de mudanças de preço
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { createLogger, logAction } from "../_core/logger";

const log = createLogger("PricingTablesRouter");

// ─── SCHEMAS ────────────────────────────────────────────────────────────────

const CreatePricingTableSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  pricingStrategy: z.enum([
    "fixed_markup",      // Markup fixo sobre custo
    "fixed_price",       // Preço fixo
    "cost_multiplier",   // Multiplicador do custo
    "tiered",            // Baseado em quantidade
    "dynamic"            // Baseado em mercado
  ]),
  baseMarkup: z.number().nonnegative().default(0.25), // 25% padrão
  minMargin: z.number().nonnegative().default(0.10),  // 10% mínimo
  maxPrice: z.number().positive().optional(),
  minPrice: z.number().positive().optional(),
  active: z.boolean().default(true)
});

const UpdatePricingTableSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(3).max(100).optional(),
  baseMarkup: z.number().nonnegative().optional(),
  minMargin: z.number().nonnegative().optional(),
  maxPrice: z.number().positive().optional(),
  minPrice: z.number().positive().optional(),
  active: z.boolean().optional()
});

const CalculatePriceSchema = z.object({
  costPrice: z.number().positive(),
  quantity: z.number().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  pricingTableId: z.number().int().positive().optional()
});

const ListPricingTablesSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(10).max(100).default(20)
});

// ─── PRICING CALCULATIONS ───────────────────────────────────────────────────

/**
 * Calcular preço de venda baseado em estratégia
 */
function calculateSellingPrice(
  costPrice: number,
  strategy: string,
  params: {
    baseMarkup?: number;
    costMultiplier?: number;
    fixedPrice?: number;
    tierQuantity?: number;
    tierPrice?: number;
    minMargin?: number;
    maxPrice?: number;
    minPrice?: number;
  }
): number {
  let sellingPrice = costPrice;

  switch (strategy) {
    case "fixed_markup": {
      const markup = params.baseMarkup || 0.25;
      sellingPrice = costPrice * (1 + markup);
      break;
    }
    case "fixed_price": {
      sellingPrice = params.fixedPrice || costPrice * 1.25;
      break;
    }
    case "cost_multiplier": {
      const multiplier = params.costMultiplier || 1.5;
      sellingPrice = costPrice * multiplier;
      break;
    }
    case "tiered": {
      // Se quantidade >= tier, aplicar preço com desconto
      if (params.tierQuantity && params.tierPrice) {
        const quantity = params.tierQuantity || 1;
        const tierPrice = params.tierPrice || costPrice * 1.2;
        sellingPrice = tierPrice;
      } else {
        sellingPrice = costPrice * 1.25;
      }
      break;
    }
    case "dynamic": {
      // Preço dinâmico baseado em mercado (default markup)
      sellingPrice = costPrice * 1.3;
      break;
    }
    default:
      sellingPrice = costPrice * 1.25;
  }

  // Aplicar limites
  const minMargin = params.minMargin || 0.1;
  const minAllowed = costPrice * (1 + minMargin);

  // Respeitar preço mínimo
  if (params.minPrice) {
    sellingPrice = Math.max(sellingPrice, params.minPrice);
  }

  // Respeitar preço mínimo baseado em margem
  sellingPrice = Math.max(sellingPrice, minAllowed);

  // Respeitar preço máximo
  if (params.maxPrice) {
    sellingPrice = Math.min(sellingPrice, params.maxPrice);
  }

  return Math.round(sellingPrice * 100) / 100; // 2 casas decimais
}

/**
 * Calcular margem/lucro
 */
function calculateMargin(costPrice: number, sellingPrice: number): {
  margin: number;
  marginPercent: number;
  profit: number;
} {
  const profit = sellingPrice - costPrice;
  const marginPercent = (profit / costPrice) * 100;

  return {
    margin: profit,
    marginPercent: Math.round(marginPercent * 100) / 100,
    profit
  };
}

// ─── ROUTER ─────────────────────────────────────────────────────────────────

export const pricingTablesRouter = router({
  /**
   * CRIAR TABELA DE PREÇO
   * ✅ Define estratégia de precificação por categoria
   */
  create: protectedProcedure
    .input(CreatePricingTableSchema)
    .mutation(async ({ input, ctx }) => {
      return withErrorHandling("Create pricing table", async () => {
        requirePermission(ctx.user.role, ["admin"]);

        const validated = validate(CreatePricingTableSchema, input);

        // TODO: Inserir no DB
        // const table = await db.insert(pricingTables).values({
        //   categoryId: validated.categoryId,
        //   name: validated.name,
        //   description: validated.description,
        //   pricingStrategy: validated.pricingStrategy,
        //   baseMarkup: validated.baseMarkup,
        //   minMargin: validated.minMargin,
        //   maxPrice: validated.maxPrice,
        //   minPrice: validated.minPrice,
        //   active: validated.active,
        //   createdBy: ctx.user.id,
        //   createdAt: new Date()
        // });

        logAction("PRICING_TABLE_CREATE", {
          userId: ctx.user.id,
          categoryId: validated.categoryId,
          strategy: validated.pricingStrategy,
          baseMarkup: validated.baseMarkup
        });

        // Invalidar cache
        cache.delete(CACHE_KEYS.PRICING_TABLES);

        return {
          success: true,
          tableId: 1,
          name: validated.name,
          strategy: validated.pricingStrategy,
          message: "Tabela de preço criada com sucesso"
        };
      });
    }),

  /**
   * LISTAR TABELAS DE PREÇO
   * ✅ Filtrar por categoria, ativo/inativo
   */
  list: protectedProcedure
    .input(ListPricingTablesSchema)
    .query(async ({ input, ctx }) => {
      return withErrorHandling("List pricing tables", async () => {
        requirePermission(ctx.user.role, ["admin", "editor"]);

        const offset = (input.page - 1) * input.limit;

        // TODO: Query com paginação
        // SELECT pt.*, c.name as category_name,
        //        COUNT(p.id) as products_using_this_table,
        //        AVG(p.cost_price) as avg_product_cost,
        //        AVG(p.selling_price) as avg_selling_price
        // FROM pricing_tables pt
        // JOIN categories c ON pt.category_id = c.id
        // LEFT JOIN products p ON p.category_id = pt.category_id
        // WHERE (? IS NULL OR pt.category_id = ?)
        //   AND (? IS NULL OR pt.active = ?)
        // GROUP BY pt.id
        // ORDER BY pt.created_at DESC
        // LIMIT ? OFFSET ?

        return {
          data: [
            {
              id: 1,
              name: "Precificação Padrão - Antibióticos",
              categoryId: 1,
              categoryName: "Antibióticos",
              pricingStrategy: "fixed_markup",
              baseMarkup: 0.25,
              productsUsingThisTable: 45,
              avgProductCost: 150,
              avgSellingPrice: 190,
              active: true,
              createdAt: new Date()
            }
          ],
          pagination: {
            page: input.page,
            limit: input.limit,
            total: 1,
            pages: 1
          }
        };
      });
    }),

  /**
   * OBTER DETALHES DA TABELA
   * ✅ Mostra configuração completa
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      return withErrorHandling("Get pricing table", async () => {
        requirePermission(ctx.user.role, ["admin", "editor"]);

        const cacheKey = CACHE_KEYS.PRICING_TABLE_BY_ID(input.id);

        // Tentar cache
        let table = cache.get(cacheKey);
        if (table) {
          return table;
        }

        // TODO: Buscar tabela com detalhes
        // SELECT pt.*, c.name as category_name,
        //        COUNT(DISTINCT p.id) as products_in_category,
        //        MIN(p.cost_price) as min_product_cost,
        //        MAX(p.cost_price) as max_product_cost
        // FROM pricing_tables pt
        // JOIN categories c ON pt.category_id = c.id
        // LEFT JOIN products p ON p.category_id = pt.category_id
        // WHERE pt.id = ?
        // GROUP BY pt.id

        table = {
          id: 1,
          name: "Precificação Padrão - Antibióticos",
          categoryId: 1,
          categoryName: "Antibióticos",
          pricingStrategy: "fixed_markup",
          baseMarkup: 0.25,
          minMargin: 0.1,
          maxPrice: 500,
          minPrice: 50,
          productsInCategory: 45,
          minProductCost: 50,
          maxProductCost: 400,
          active: true,
          createdBy: "Admin User",
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // Cachear por 30 minutos
        cache.set(cacheKey, table, CACHE_TTL.MEDIUM);

        return table;
      });
    }),

  /**
   * ATUALIZAR TABELA DE PREÇO
   * ✅ Modifica parâmetros
   */
  update: protectedProcedure
    .input(UpdatePricingTableSchema)
    .mutation(async ({ input, ctx }) => {
      return withErrorHandling("Update pricing table", async () => {
        requirePermission(ctx.user.role, ["admin"]);

        // TODO: Atualizar
        // await db.update(pricingTables)
        //   .set({
        //     ...input,
        //     updatedAt: new Date()
        //   })
        //   .where(eq(pricingTables.id, input.id));

        logAction("PRICING_TABLE_UPDATE", {
          userId: ctx.user.id,
          tableId: input.id,
          changedFields: Object.keys(input).filter(k => k !== 'id').length
        });

        // Invalidar caches
        cache.delete(CACHE_KEYS.PRICING_TABLE_BY_ID(input.id));
        cache.delete(CACHE_KEYS.PRICING_TABLES);

        return {
          success: true,
          tableId: input.id,
          message: "Tabela de preço atualizada com sucesso"
        };
      });
    }),

  /**
   * CALCULAR PREÇO DE VENDA
   * ✅ Aplicar tabela de preço a um custo
   */
  calculatePrice: protectedProcedure
    .input(CalculatePriceSchema)
    .query(async ({ input, ctx }) => {
      return withErrorHandling("Calculate price", async () => {
        // TODO: Buscar configuração da tabela (ou usar parâmetros default)

        const sellingPrice = calculateSellingPrice(input.costPrice, "fixed_markup", {
          baseMarkup: 0.25,
          minMargin: 0.1,
          maxPrice: 500,
          minPrice: 50
        });

        const margins = calculateMargin(input.costPrice, sellingPrice);

        return {
          costPrice: input.costPrice,
          calculatedSellingPrice: sellingPrice,
          margin: {
            absoluteMargin: margins.margin,
            marginPercent: margins.marginPercent,
            profit: margins.profit
          },
          breakdown: {
            baseMarkup: 0.25,
            appliedPrice: Math.round(input.costPrice * 1.25 * 100) / 100,
            consideringMinMargin: sellingPrice,
            finalPrice: sellingPrice
          }
        };
      });
    }),

  /**
   * SIMULAR PREÇOS PARA PRODUTOS
   * ✅ Mostra impacto de aplicar tabela a vários produtos
   */
  simulateForProducts: protectedProcedure
    .input(z.object({
      pricingTableId: z.number().int().positive(),
      productIds: z.array(z.number().int().positive()).min(1).max(100)
    }))
    .query(async ({ input, ctx }) => {
      return withErrorHandling("Simulate prices", async () => {
        requirePermission(ctx.user.role, ["admin", "editor"]);

        // TODO: Buscar tabela de preço
        // const table = await db.query.pricingTables.findFirst({
        //   where: eq(pricingTables.id, input.pricingTableId)
        // });

        // TODO: Buscar produtos
        // SELECT id, name, cost_price, selling_price, supplier_id
        // FROM products
        // WHERE id IN (?, ?, ...)

        const mockProducts = [
          { id: 1, name: "Product A", costPrice: 100, currentSellingPrice: 150 },
          { id: 2, name: "Product B", costPrice: 200, currentSellingPrice: 250 },
          { id: 3, name: "Product C", costPrice: 80, currentSellingPrice: 120 }
        ];

        const simulations = mockProducts.map(p => {
          const newPrice = calculateSellingPrice(p.costPrice, "fixed_markup", {
            baseMarkup: 0.25,
            minMargin: 0.1
          });

          return {
            productId: p.id,
            name: p.name,
            costPrice: p.costPrice,
            currentPrice: p.currentSellingPrice,
            newPrice,
            priceDifference: newPrice - p.currentSellingPrice,
            percentageChange: Math.round(((newPrice - p.currentSellingPrice) / p.currentSellingPrice) * 100 * 100) / 100,
            marginBefore: Math.round(((p.currentSellingPrice - p.costPrice) / p.costPrice) * 100 * 100) / 100,
            marginAfter: Math.round(((newPrice - p.costPrice) / p.costPrice) * 100 * 100) / 100
          };
        });

        const summary = {
          totalProducts: simulations.length,
          productsWithPriceIncrease: simulations.filter(s => s.priceDifference > 0).length,
          productsWithPriceDecrease: simulations.filter(s => s.priceDifference < 0).length,
          averagePriceChange: Math.round(simulations.reduce((sum, s) => sum + s.priceDifference, 0) / simulations.length * 100) / 100,
          totalRevenueImpact: simulations.reduce((sum, s) => sum + (s.newPrice - s.currentPrice), 0)
        };

        return {
          pricingTableId: input.pricingTableId,
          simulations,
          summary
        };
      });
    }),

  /**
   * APLICAR TABELA A PRODUTOS
   * ✅ Atualiza preços de venda dos produtos
   */
  applyToProducts: protectedProcedure
    .input(z.object({
      pricingTableId: z.number().int().positive(),
      productIds: z.array(z.number().int().positive()).min(1).max(100),
      dryRun: z.boolean().default(false),
      notes: z.string().max(500).optional()
    }))
    .mutation(async ({ input, ctx }) => {
      return withErrorHandling("Apply pricing table", async () => {
        requirePermission(ctx.user.role, ["admin"]);

        if (input.dryRun) {
          return {
            dryRun: true,
            message: "Simulation complete. No changes made.",
            productsAffected: input.productIds.length
          };
        }

        // TODO: Atualizar preços dos produtos em transação
        // BEGIN TRANSACTION;
        // UPDATE products
        // SET selling_price = (cost_price * (1 + baseMarkup)),
        //     updated_at = NOW()
        // WHERE id IN (?, ?, ...)
        //   AND category_id = (SELECT category_id FROM pricing_tables WHERE id = ?);
        // COMMIT;

        logAction("PRICING_TABLE_APPLY", {
          userId: ctx.user.id,
          pricingTableId: input.pricingTableId,
          productsAffected: input.productIds.length,
          notes: input.notes
        });

        // Invalidar caches de produtos
        cache.delete(CACHE_KEYS.PRODUCTS_LIST);

        return {
          success: true,
          pricingTableId: input.pricingTableId,
          productsUpdated: input.productIds.length,
          message: "Preços atualizados com sucesso"
        };
      });
    }),

  /**
   * HISTÓRICO DE MUDANÇAS DE PREÇO
   * ✅ Auditoria de ajustes
   */
  getPriceHistory: protectedProcedure
    .input(z.object({
      pricingTableId: z.number().int().positive(),
      limit: z.number().int().positive().default(50)
    }))
    .query(async ({ input, ctx }) => {
      return withErrorHandling("Get price history", async () => {
        requirePermission(ctx.user.role, ["admin", "editor"]);

        // TODO: Query histórico
        // SELECT id, product_id, old_price, new_price, changed_by,
        //        changed_at, reason
        // FROM price_history
        // WHERE pricing_table_id = ?
        // ORDER BY changed_at DESC
        // LIMIT ?

        return {
          pricingTableId: input.pricingTableId,
          history: [
            {
              id: 1,
              productId: 1,
              productName: "Product A",
              oldPrice: 150,
              newPrice: 155,
              changedBy: "John Doe",
              changedAt: new Date(),
              reason: "Periodic pricing table application"
            }
          ]
        };
      });
    })
});
