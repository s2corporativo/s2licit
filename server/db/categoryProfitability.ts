import { and, eq, sql } from "drizzle-orm";
import { categories, products, proposalItems, proposals } from "../../drizzle/schema";
import { getDb } from "./_client";

export async function getMarginByCategory() {
  const db = await getDb();
  if (!db) return [];
  // Buscar proposal_items com categoria (via products), custo e preço sugerido
  const rows = await db
    .select({
      categoryName: categories.name,
      unitPrice: proposalItems.unitPrice,
      costPrice: proposalItems.costPrice,
      suggestedPrice: proposalItems.suggestedPrice,
      quantity: proposalItems.quantity,
      proposalStatus: proposals.status,
    })
    .from(proposalItems)
    .leftJoin(proposals, eq(proposalItems.proposalId, proposals.id))
    .leftJoin(products, eq(proposalItems.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        sql`${proposalItems.suggestedPrice} IS NOT NULL`,
        sql`CAST(${proposalItems.suggestedPrice} AS DECIMAL) > 0`
      )
    );

  // Agrupar por categoria
  const grouped: Record<string, {
    categoryName: string;
    totalRevenue: number;
    totalCost: number;
    itemCount: number;
    deliveredCount: number;
  }> = {};

  for (const row of rows) {
    const key = row.categoryName ?? "Sem Categoria";
    if (!grouped[key]) grouped[key] = { categoryName: key, totalRevenue: 0, totalCost: 0, itemCount: 0, deliveredCount: 0 };
    const qty = parseFloat(String(row.quantity ?? 1));
    const sale = parseFloat(String(row.suggestedPrice ?? 0));
    const cost = parseFloat(String(row.costPrice ?? row.unitPrice ?? 0));
    grouped[key].totalRevenue += sale * qty;
    grouped[key].totalCost += cost * qty;
    grouped[key].itemCount++;
    if (row.proposalStatus === "delivered") grouped[key].deliveredCount++;
  }

  return Object.values(grouped)
    .map((g) => ({
      categoryName: g.categoryName,
      totalRevenue: g.totalRevenue,
      totalCost: g.totalCost,
      itemCount: g.itemCount,
      deliveredCount: g.deliveredCount,
      marginPercent: g.totalRevenue > 0
        ? ((g.totalRevenue - g.totalCost) / g.totalRevenue) * 100
        : 0,
    }))
    .sort((a, b) => b.marginPercent - a.marginPercent);
}
