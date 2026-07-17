import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { products, proposals } from "../../drizzle/schema";
import { getDashboardStats, getDb, getExpiringProposals, getFinancialSummary, getMarginByCategory, getProductsPerCategory, getProposalFinancialStats } from "../db";

export const dashboardRouter = router({
    stats: protectedProcedure.query(() => getDashboardStats()),
    productsPerCategory: protectedProcedure.query(() => getProductsPerCategory()),
    expiringProposals: protectedProcedure
      .input(z.object({ daysAhead: z.number().optional() }).optional())
      .query(({ input }) => getExpiringProposals(input?.daysAhead ?? 7)),
    financialSummary: protectedProcedure.query(() => getFinancialSummary()),
    proposalStats: protectedProcedure.query(() => getProposalFinancialStats()),
    marginByCategory: protectedProcedure.query(() => getMarginByCategory()),
    extendedStats: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { revenueInOrders: 0, avgTicket: 0, wonProposals: 0, productsWithoutCategory: 0, productsWithoutAI: 0 };
      const [orderRows, wonRows, noCatRows, noAIRows] = await Promise.all([
        db.select({ total: sql<number>`COALESCE(SUM(CAST(${proposals.totalValue} AS DECIMAL(15,2))), 0)` })
          .from(proposals)
          .where(inArray(proposals.status, ["order", "in_transit", "delivered"])),
        db.select({ count: sql<number>`count(*)`, total: sql<number>`COALESCE(SUM(CAST(${proposals.totalValue} AS DECIMAL(15,2))), 0)` })
          .from(proposals)
          .where(eq(proposals.status, "delivered")),
        db.select({ count: sql<number>`count(*)` })
          .from(products)
          .where(and(eq(products.isActive, "yes"), isNull(products.categoryId))),
        db.select({ count: sql<number>`count(*)` })
          .from(products)
          .where(and(eq(products.isActive, "yes"), or(isNull(products.fichaTecnica), sql`${products.fichaTecnica} = ''`))),
      ]);
      const revenueInOrders = Number(orderRows[0]?.total ?? 0);
      const wonCount = Number(wonRows[0]?.count ?? 0);
      const wonTotal = Number(wonRows[0]?.total ?? 0);
      return {
        revenueInOrders,
        avgTicket: wonCount > 0 ? wonTotal / wonCount : 0,
        wonProposals: wonCount,
        productsWithoutCategory: Number(noCatRows[0]?.count ?? 0),
        productsWithoutAI: Number(noAIRows[0]?.count ?? 0),
      };
    }),

     recentActivity: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: proposals.id,
          title: proposals.title,
          orgName: proposals.orgName,
          status: proposals.status,
          totalValue: proposals.totalValue,
          updatedAt: proposals.updatedAt,
        })
        .from(proposals)
        .orderBy(desc(proposals.updatedAt))
        .limit(5);
    }),

    // ── catalogHealth: saúde cadastral detalhada do catálogo ──
    catalogHealth: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { withoutFichaTecnica: 0, withoutActiveIngredient: 0, withoutManufacturer: 0, withoutEan: 0, withoutCategory: 0, withoutImage: 0, withoutPrice: 0, total: 0 };
      // Query consolidada: 1 passagem pela tabela em vez de 7 queries separadas
      const [healthRow] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          noFicha: sql<number>`SUM(CASE WHEN (fichaTecnica IS NULL OR fichaTecnica = '') THEN 1 ELSE 0 END)`,
          noMfr: sql<number>`SUM(CASE WHEN (manufacturer IS NULL OR manufacturer = '') THEN 1 ELSE 0 END)`,
          noEan: sql<number>`SUM(CASE WHEN (ean IS NULL AND gtin IS NULL AND barcode IS NULL) THEN 1 ELSE 0 END)`,
          noCat: sql<number>`SUM(CASE WHEN categoryId IS NULL THEN 1 ELSE 0 END)`,
          noImg: sql<number>`SUM(CASE WHEN (imageUrl IS NULL OR imageUrl = '') THEN 1 ELSE 0 END)`,
          noPrice: sql<number>`SUM(CASE WHEN (price IS NULL OR price = '0.00') THEN 1 ELSE 0 END)`,
        })
        .from(products)
        .where(eq(products.isActive, "yes"));
      return {
        total: Number(healthRow?.total ?? 0),
        withoutFichaTecnica: Number(healthRow?.noFicha ?? 0),
        withoutActiveIngredient: Number(healthRow?.noFicha ?? 0), // alias para compatibilidade
        withoutManufacturer: Number(healthRow?.noMfr ?? 0),
        withoutEan: Number(healthRow?.noEan ?? 0),
        withoutCategory: Number(healthRow?.noCat ?? 0),
        withoutImage: Number(healthRow?.noImg ?? 0),
        withoutPrice: Number(healthRow?.noPrice ?? 0),
      };
    }),

    // ── proposalPipeline: pipeline de propostas por estágio com valor e prazo ──
    proposalPipeline: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          status: proposals.status,
          count: sql<number>`count(*)`,
          totalValue: sql<number>`COALESCE(SUM(CAST(${proposals.totalValue} AS DECIMAL(15,2))), 0)`,
        })
        .from(proposals)
        .groupBy(proposals.status);
      // Buscar prazo mais próximo por status
      const deadlines = await db
        .select({
          status: proposals.status,
          minDate: sql<Date>`MIN(${proposals.sentAt})`,
        })
        .from(proposals)
        .where(sql`${proposals.sentAt} IS NOT NULL`)
        .groupBy(proposals.status);
      const deadlineMap = Object.fromEntries(deadlines.map(d => [d.status, d.minDate]));
      return rows.map(r => ({
        status: r.status,
        count: Number(r.count),
        totalValue: Number(r.totalValue),
        nearestDeadline: deadlineMap[r.status] ?? null,
      }));
    }),

    // ── actionQueue: fila de ações do dia priorizadas ──
    actionQueue: protectedProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      // Paralelizar todas as queries com Promise.all para reduzir latência
      const [drafts, noCat, noFicha, expiring, sentProposals] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(proposals).where(eq(proposals.status, "draft")),
        db.select({ count: sql<number>`count(*)` }).from(products).where(and(eq(products.isActive, "yes"), isNull(products.categoryId))),
        db.select({ count: sql<number>`count(*)` }).from(products).where(and(eq(products.isActive, "yes"), or(isNull(products.fichaTecnica), sql`${products.fichaTecnica} = ''`))),
        db.select({ count: sql<number>`count(*)` }).from(proposals).where(and(
          sql`${proposals.sentAt} IS NOT NULL`,
          sql`DATE_ADD(${proposals.sentAt}, INTERVAL COALESCE(${proposals.validityDays}, 30) DAY) <= ${in7Days}`,
          sql`DATE_ADD(${proposals.sentAt}, INTERVAL COALESCE(${proposals.validityDays}, 30) DAY) >= ${now}`,
          sql`${proposals.status} NOT IN ('delivered','cancelled')`
        )),
        db.select({ count: sql<number>`count(*)` }).from(proposals).where(eq(proposals.status, "sent")),
      ]);
      const items: Array<{ type: string; label: string; detail: string; href: string; priority: "critical" | "warning" | "info" }> = [];
      const draftCount = Number(drafts[0]?.count ?? 0);
      const noCatCount = Number(noCat[0]?.count ?? 0);
      const noFichaCount = Number(noFicha[0]?.count ?? 0);
      const expiringCount = Number(expiring[0]?.count ?? 0);
      const sentCount = Number(sentProposals[0]?.count ?? 0);
      if (expiringCount > 0) items.push({ type: "proposal", label: `${expiringCount} proposta${expiringCount > 1 ? "s" : ""} vencendo em 7 dias`, detail: "Verificar prazo de entrega", href: "/propostas-admin", priority: "critical" });
      if (draftCount > 0) items.push({ type: "proposal", label: `${draftCount} proposta${draftCount > 1 ? "s" : ""} em rascunho`, detail: "Continuar montagem", href: "/propostas-admin", priority: "warning" });
      if (sentCount > 0) items.push({ type: "proposal", label: `${sentCount} proposta${sentCount > 1 ? "s" : ""} aguardando retorno`, detail: "Acompanhar status", href: "/propostas-admin", priority: "info" });
      if (noCatCount > 0) items.push({ type: "catalog", label: `${noCatCount} produto${noCatCount > 1 ? "s" : ""} sem categoria`, detail: "Reclassificar com IA", href: "/produtos", priority: noCatCount > 100 ? "warning" : "info" });
      if (noFichaCount > 0) items.push({ type: "catalog", label: `${noFichaCount} produto${noFichaCount > 1 ? "s" : ""} sem ficha técnica`, detail: "Enriquecer via IA", href: "/enriquecimento", priority: noFichaCount > 200 ? "warning" : "info" });
      const priorityOrder = { critical: 0, warning: 1, info: 2 };
      return items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }),
  });
