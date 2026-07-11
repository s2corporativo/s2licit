/**
 * scraperMultiRouter — Router de scrapers de múltiplos fornecedores.
 * Usa scraperEngine.ts (Puppeteer universal) em vez de ScraperFactory.
 */

import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { eq, desc } from "drizzle-orm";
import { scraperConfigs, scraperLogs, suppliers } from "../../drizzle/schema";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import { executarScraper, FORNECEDOR_CONFIGS } from "../services/scraperEngine";

export const scraperMultiRouter = router({

  /** Lista tipos de fornecedores suportados pelo motor de scraping */
  listSuppliers: protectedProcedure.query(() => {
    return Object.entries(FORNECEDOR_CONFIGS).map(([id, cfg]) => ({
      id,
      nome: id.charAt(0).toUpperCase() + id.slice(1),
      categorias: cfg.categoryUrls.length,
      suporta: {
        ean: !!cfg.productEan,
        codigo: !!cfg.productCode,
        imagem: !!cfg.productImage,
        paginacao: !!cfg.nextPage,
      },
    }));
  }),

  /** Configura scraper para um fornecedor (cria ou atualiza) */
  configureSupplier: protectedProcedure
    .input(z.object({
      supplierId: z.number(),
      scraperType: z.string(),
      email: z.string().email(),
      password: z.string().min(4),
      scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).default("02:00"),
      enabled: z.boolean().default(false),
    }))
    .mutation(async ({ input }: { input: { supplierId: number; scraperType: string; email: string; password: string; scheduleTime: string; enabled: boolean } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const encryptedPassword = encryptPassword(input.password);
      const existing = await db.select().from(scraperConfigs)
        .where(eq(scraperConfigs.supplierId, input.supplierId)).limit(1);

      if (existing.length > 0) {
        await db.update(scraperConfigs).set({
          email: input.email,
          passwordHash: encryptedPassword,
          scheduleTime: input.scheduleTime,
          enabled: input.enabled ? "yes" : "no",
          updatedAt: new Date(),
        }).where(eq(scraperConfigs.id, existing[0].id));
        return { success: true, message: "Configuração atualizada", id: existing[0].id };
      } else {
        const [result] = await db.insert(scraperConfigs).values({
          supplierId: input.supplierId,
          scraperType: input.scraperType,
          email: input.email,
          passwordHash: encryptedPassword,
          scheduleTime: input.scheduleTime,
          enabled: input.enabled ? "yes" : "no",
          lastRunStatus: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return { success: true, message: "Configuração criada", id: (result as any).insertId };
      }
    }),

  /** Retorna configuração de um fornecedor (sem senha) */
  getConfiguration: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(async ({ input }: { input: { supplierId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const rows = await db.select().from(scraperConfigs)
        .where(eq(scraperConfigs.supplierId, input.supplierId)).limit(1);
      if (!rows[0]) return null;
      const r = rows[0];
      return {
        id: r.id, supplierId: r.supplierId, scraperType: r.scraperType,
        email: r.email, scheduleTime: r.scheduleTime,
        enabled: r.enabled === "yes",
        lastRunAt: r.lastRunAt, lastRunStatus: r.lastRunStatus,
        createdAt: r.createdAt, updatedAt: r.updatedAt,
      };
    }),

  /** Executa scraper manualmente para um fornecedor (via scraperEngine) */
  runSupplierScraper: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .mutation(async ({ input }: { input: { supplierId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const rows = await db.select().from(scraperConfigs)
        .where(eq(scraperConfigs.supplierId, input.supplierId)).limit(1);
      if (!rows[0]) throw new Error(`Configuração não encontrada para fornecedor #${input.supplierId}`);

      // Delegar ao motor universal
      const result = await executarScraper(rows[0].id);
      return result;
    }),

  /** Histórico de execuções de um fornecedor */
  getExecutionHistory: protectedProcedure
    .input(z.object({ supplierId: z.number(), limit: z.number().default(10) }))
    .query(async ({ input }: { input: { supplierId: number; limit: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const rows = await db.select().from(scraperConfigs)
        .where(eq(scraperConfigs.supplierId, input.supplierId)).limit(1);
      if (!rows[0]) return [];
      return db.select().from(scraperLogs)
        .where(eq(scraperLogs.scraperConfigId, rows[0].id))
        .orderBy(desc(scraperLogs.startedAt))
        .limit(input.limit);
    }),

  /** Ativa/desativa um scraper */
  toggleSupplierScraper: protectedProcedure
    .input(z.object({ supplierId: z.number(), enabled: z.boolean() }))
    .mutation(async ({ input }: { input: { supplierId: number; enabled: boolean } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      await db.update(scraperConfigs)
        .set({ enabled: input.enabled ? "yes" : "no", updatedAt: new Date() })
        .where(eq(scraperConfigs.supplierId, input.supplierId));
      return { success: true, message: `Scraper ${input.enabled ? "ativado" : "desativado"}` };
    }),

  /** Remove configuração de um fornecedor */
  deleteConfiguration: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .mutation(async ({ input }: { input: { supplierId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const rows = await db.select().from(scraperConfigs)
        .where(eq(scraperConfigs.supplierId, input.supplierId)).limit(1);
      if (!rows[0]) throw new Error("Configuração não encontrada");
      await db.delete(scraperConfigs).where(eq(scraperConfigs.id, rows[0].id));
      return { success: true, message: "Configuração removida" };
    }),

  /** Lista todas as configurações de scrapers com nome do fornecedor */
  listAllConfigurations: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    return db.select({
      id: scraperConfigs.id,
      supplierId: scraperConfigs.supplierId,
      supplierName: suppliers.name,
      scraperType: scraperConfigs.scraperType,
      email: scraperConfigs.email,
      scheduleTime: scraperConfigs.scheduleTime,
      enabled: scraperConfigs.enabled,
      lastRunAt: scraperConfigs.lastRunAt,
      lastRunStatus: scraperConfigs.lastRunStatus,
      productsScrapedCount: scraperConfigs.productsScrapedCount,
      productsUpdatedCount: scraperConfigs.productsUpdatedCount,
    }).from(scraperConfigs)
      .leftJoin(suppliers, eq(scraperConfigs.supplierId, suppliers.id));
  }),
});
