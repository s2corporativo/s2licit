import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { scraperConfigs, scraperLogs } from "../../drizzle/schema";
import { tambasaScraper } from "../services/tambasaScraperService";
import { encryptPassword, decryptPassword } from "../utils/encryption";

export const scraperRouter = router({
  /**
   * Configura um novo scraper para um fornecedor
   */
  configureScraperForSupplier: adminProcedure
    .input(
      z.object({
        supplierId: z.number(),
        scraperType: z.enum(["tambasa"]),
        email: z.string().email(),
        password: z.string(),
        scheduleTime: z.string().regex(/^\d{2}:\d{2}$/),
      })
    )
    .mutation(async ({ input }: { input: { supplierId: number; scraperType: "tambasa"; email: string; password: string; scheduleTime: string } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const passwordHash = encryptPassword(input.password);

      const existing = await db
        .select()
        .from(scraperConfigs)
        .where(
          and(
            eq(scraperConfigs.supplierId, input.supplierId),
            eq(scraperConfigs.scraperType, input.scraperType)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(scraperConfigs)
          .set({
            email: input.email,
            passwordHash,
            scheduleTime: input.scheduleTime,
          })
          .where(eq(scraperConfigs.id, existing[0].id));

        return {
          success: true,
          message: "Scraper configuration updated",
          configId: existing[0].id,
        };
      }

      const result = await db.insert(scraperConfigs).values({
        supplierId: input.supplierId,
        scraperType: input.scraperType,
        email: input.email,
        passwordHash,
        scheduleTime: input.scheduleTime,
        enabled: "yes",
        lastRunStatus: "pending",
      });

      return {
        success: true,
        message: "Scraper configuration created",
        configId: result[0],
      };
    }),

  /**
   * Executa o scraper manualmente
   */
  runScraperNow: adminProcedure
    .input(z.object({ scraperConfigId: z.number() }))
    .mutation(async ({ input }: { input: { scraperConfigId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const config = await db
        .select()
        .from(scraperConfigs)
        .where(eq(scraperConfigs.id, input.scraperConfigId))
        .limit(1);

      if (config.length === 0) {
        throw new Error("Scraper configuration not found");
      }

      const scraperConfig = config[0];
      const password = decryptPassword(scraperConfig.passwordHash);

      const startTime = Date.now();

      try {
        const result = await tambasaScraper.run({
          // decryptPassword é tolerante: devolve texto plano inalterado e
          // decripta valores cifrados — cobre configs antigas e novas.
          email: decryptPassword(scraperConfig.email),
          password,
          supplierId: scraperConfig.supplierId,
          enabled: scraperConfig.enabled === "yes",
          scheduleTime: scraperConfig.scheduleTime || "02:00",
        });

        const duration = Date.now() - startTime;

        await db.insert(scraperLogs).values({
          scraperConfigId: input.scraperConfigId,
          status: result.success ? "success" : "failed",
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: duration,
          productsScraped: result.productsScraped,
          productsMatched: result.productsMatched,
          productsUpdated: result.productsUpdated,
          productsCreated: result.productsCreated,
          errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
        });

        await db
          .update(scraperConfigs)
          .set({
            lastRunAt: new Date(),
            lastRunStatus: result.success ? "success" : "failed",
            lastRunErrorMessage: result.errors.length > 0 ? result.errors[0] : undefined,
            productsScrapedCount: result.productsScraped,
            productsMatchedCount: result.productsMatched,
            productsUpdatedCount: result.productsUpdated,
            productsCreatedCount: result.productsCreated,
          })
          .where(eq(scraperConfigs.id, input.scraperConfigId));

        return {
          success: result.success,
          result,
        };
      } catch (error) {
        const duration = Date.now() - startTime;

        await db.insert(scraperLogs).values({
          scraperConfigId: input.scraperConfigId,
          status: "failed",
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: duration,
          errorMessage: String(error),
        });

        await db
          .update(scraperConfigs)
          .set({
            lastRunAt: new Date(),
            lastRunStatus: "failed",
            lastRunErrorMessage: String(error),
          })
          .where(eq(scraperConfigs.id, input.scraperConfigId));

        throw error;
      }
    }),

  /**
   * Obtém configurações do scraper
   */
  getScraperConfig: protectedProcedure
    .input(z.object({ scraperConfigId: z.number() }))
    .query(async ({ input }: { input: { scraperConfigId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const config = await db
        .select()
        .from(scraperConfigs)
        .where(eq(scraperConfigs.id, input.scraperConfigId))
        .limit(1);

      if (config.length === 0) {
        throw new Error("Scraper configuration not found");
      }

      const { passwordHash, ...safeConfig } = config[0];
      return safeConfig;
    }),

  /**
   * Lista todas as configurações de scraper
   */
  listScraperConfigs: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");

    const configs = await db.select().from(scraperConfigs);
    return configs.map(({ passwordHash, ...config }) => config);
  }),

  /**
   * Obtém histórico de execuções do scraper
   */
  getScraperLogs: protectedProcedure
    .input(
      z.object({
        scraperConfigId: z.number(),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input }: { input: { scraperConfigId: number; limit: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const logs = await db
        .select()
        .from(scraperLogs)
        .where(eq(scraperLogs.scraperConfigId, input.scraperConfigId))
        .orderBy(desc(scraperLogs.createdAt))
        .limit(input.limit);

      return logs;
    }),

  /**
   * Desabilita um scraper
   */
  disableScraperConfig: adminProcedure
    .input(z.object({ scraperConfigId: z.number() }))
    .mutation(async ({ input }: { input: { scraperConfigId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      await db
        .update(scraperConfigs)
        .set({ enabled: "no" })
        .where(eq(scraperConfigs.id, input.scraperConfigId));

      return { success: true };
    }),

  /**
   * Habilita um scraper
   */
  enableScraperConfig: adminProcedure
    .input(z.object({ scraperConfigId: z.number() }))
    .mutation(async ({ input }: { input: { scraperConfigId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      await db
        .update(scraperConfigs)
        .set({ enabled: "yes" })
        .where(eq(scraperConfigs.id, input.scraperConfigId));

      return { success: true };
    }),
});
