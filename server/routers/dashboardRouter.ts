import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { count } from "drizzle-orm";
import { suppliers, products, categories, proposals } from "../../drizzle/schema";

export const dashboardRouter = router({
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    try {
      const [supplierCount, productCount, categoryCount, proposalCount] = await Promise.all([
        db.select({ count: count() }).from(suppliers).execute(),
        db.select({ count: count() }).from(products).execute(),
        db.select({ count: count() }).from(categories).execute(),
        db.select({ count: count() }).from(proposals).execute(),
      ]);

      return {
        suppliers: supplierCount[0]?.count || 0,
        products: productCount[0]?.count || 0,
        categories: categoryCount[0]?.count || 0,
        proposals: proposalCount[0]?.count || 0,
      };
    } catch (error) {
      console.error("Dashboard stats error:", error);
      return {
        suppliers: 0,
        products: 0,
        categories: 0,
        proposals: 0,
      };
    }
  }),

  recentImports: adminProcedure.query(async () => {
    // Placeholder - implement when import_logs table is available
    return [];
  }),
});
