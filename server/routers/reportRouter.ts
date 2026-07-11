import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export const reportRouter = router({
  importStats: adminProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input }: { input: { days: number } }) => {
      const db = await getDb();
      if (!db) return [];
      const result = await db.execute(sql`
        SELECT DATE(createdAt) as date, COUNT(*) as count, SUM(importedRows) as totalRows 
        FROM import_logs 
        WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ${input.days} DAY)
        GROUP BY DATE(createdAt)
        ORDER BY date DESC
      `);
      return result;
    }),

  priceAnalysis: adminProcedure
    .input(z.object({ supplierId: z.number().optional() }))
    .query(async ({ input }: { input: { supplierId?: number } }) => {
      const db = await getDb();
      if (!db) return [];
      // Placeholder parametrizado (evita interpolação direta do input no SQL)
      const whereClause = input.supplierId ? sql`WHERE supplierId = ${input.supplierId}` : sql``;
      const result = await db.execute(sql`
        SELECT supplierId, COUNT(*) as productCount, AVG(price) as avgPrice, MIN(price) as minPrice, MAX(price) as maxPrice
        FROM products
        ${whereClause}
        GROUP BY supplierId
      `);
      return result;
    }),

  consolidationReport: adminProcedure.query(async () => {
    // A tabela consolidation_logs não existe no schema — retornar lista vazia com aviso
    // em vez de quebrar a procedure com erro de SQL.
    console.warn(
      "[reportRouter] consolidationReport: tabela consolidation_logs não existe no schema; retornando lista vazia"
    );
    return [];
  }),
});
