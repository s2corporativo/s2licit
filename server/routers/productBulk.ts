import { eq } from "drizzle-orm";
import { z } from "zod";
import { products } from "../../drizzle/schema";
import { getDb, listProducts, mergeProductGroup } from "../db";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { recordAudit } from "../services/auditService";
import {
  buildDuplicateSelectionPlan,
  collectFilteredProductIds,
  type ProductSelectionFilters,
} from "../services/productBulkSelectionService";

const filterSchema = z.object({
  search: z.string().max(512).optional(),
  categoryId: z.number().int().positive().optional(),
  incomplete: z.boolean().optional(),
  isActive: z.enum(["yes", "no"]).default("yes"),
});

export const productBulkRouter = router({
  /**
   * Resolve a seleção global somente quando o operador pede "todos os
   * resultados filtrados". Pagina no servidor em lotes de 500 para não exigir
   * um payload de produtos completos no navegador.
   */
  filteredIds: protectedProcedure
    .input(filterSchema)
    .query(async ({ input }) => {
      const filters: ProductSelectionFilters = input;
      return collectFilteredProductIds(async (offset, limit) => {
        const page = await listProducts({
          ...filters,
          limit,
          offset,
          sortBy: "name",
          sortDir: "asc",
        });
        return {
          items: page.items.map((row) => ({ id: row.id })),
          total: page.total,
        };
      });
    }),

  /**
   * Planeja a resolução de duplicidades contra TODO o catálogo ativo.
   * Grupos parciais são devolvidos separadamente para que a UI informe quais
   * candidatos ficaram de fora da seleção em vez de mesclar silenciosamente.
   */
  duplicatePlan: protectedProcedure
    .input(z.object({
      selectedIds: z.array(z.number().int().positive()).min(1).max(50_000),
      minSimilarity: z.number().min(0.5).max(1).default(0.78),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          concentration: products.concentration,
          presentation: products.presentation,
          manufacturer: products.manufacturer,
          activeIngredient: products.activeIngredient,
          price: products.price,
        })
        .from(products)
        .where(eq(products.isActive, "yes"));
      return buildDuplicateSelectionPlan(rows, input.selectedIds, input.minSimilarity);
    }),

  /**
   * Mescla vários grupos confirmados pelo operador. Cada grupo usa o merge
   * canônico transacional existente, que redireciona referências e faz
   * soft-delete dos duplicados.
   */
  mergeDuplicateGroups: editorProcedure
    .input(z.object({
      groups: z.array(z.object({
        masterId: z.number().int().positive(),
        duplicateIds: z.array(z.number().int().positive()).min(1).max(1_000),
      })).min(1).max(200),
    }))
    .mutation(async ({ input, ctx }) => {
      const seen = new Set<number>();
      for (const group of input.groups) {
        if (group.duplicateIds.includes(group.masterId)) {
          throw new Error(`Grupo inválido: mestre ${group.masterId} também aparece como duplicado.`);
        }
        for (const id of [group.masterId, ...group.duplicateIds]) {
          if (seen.has(id)) throw new Error(`Produto ${id} aparece em mais de um grupo de merge.`);
          seen.add(id);
        }
      }

      let merged = 0;
      let redirected = 0;
      const results: Array<{ masterId: number; duplicateIds: number[]; merged: number; redirected: number }> = [];
      for (const group of input.groups) {
        const result = await mergeProductGroup(group.masterId, group.duplicateIds);
        merged += result.merged;
        redirected += result.redirected;
        results.push({ ...group, ...result });
      }

      await recordAudit({
        userId: ctx.user?.id ?? null,
        action: "product_bulk_merge_confirmed",
        entity: "products",
        origin: "operator",
        summary: `${input.groups.length} grupo(s) de duplicidades mesclados após confirmação humana (${merged} produto(s) absorvidos)`,
        changes: {
          groups: results.slice(0, 100),
          merged,
          redirected,
        },
      });

      return { groups: results.length, merged, redirected, results };
    }),
});
