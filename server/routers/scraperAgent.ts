/**
 * scraperAgent.ts
 * Router do Agente de Scraping — gerencia fornecedores com login,
 * executa raspagem, testa credenciais e agenda atualizações automáticas.
 */

import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { scraperConfigs, scraperLogs, suppliers } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import { executarScraper, FORNECEDOR_CONFIGS } from "../services/scraperEngine";

// Jobs em execução (em memória — suficiente para UI de progresso)
const runningJobs = new Map<number, { status: string; log: string[]; startedAt: Date }>();

// ─── Schemas ──────────────────────────────────────────────────────────────

const cadastrarSchema = z.object({
  supplierId: z.number(),
  scraperType: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(4),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).default("02:00"),
  enabled: z.enum(["yes", "no"]).default("yes"),
});

const atualizarCredenciaisSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  password: z.string().min(4).optional(),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  enabled: z.enum(["yes", "no"]).optional(),
});

const executarSchema = z.object({ scraperConfigId: z.number() });

const statusSchema = z.object({ scraperConfigId: z.number() });

const historicoSchema = z.object({ scraperConfigId: z.number(), limit: z.number().default(20) });

const verEmailSchema = z.object({ id: z.number() });

// ─── Router ───────────────────────────────────────────────────────────────

export const scraperAgentRouter = router({

  /** Lista fornecedores configurados para scraping */
  listar: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      return await db.select({
        id: scraperConfigs.id,
        supplierId: scraperConfigs.supplierId,
        scraperType: scraperConfigs.scraperType,
        enabled: scraperConfigs.enabled,
        scheduleTime: scraperConfigs.scheduleTime,
        lastRunAt: scraperConfigs.lastRunAt,
        lastRunStatus: scraperConfigs.lastRunStatus,
        lastRunErrorMessage: scraperConfigs.lastRunErrorMessage,
        productsScrapedCount: scraperConfigs.productsScrapedCount,
        productsUpdatedCount: scraperConfigs.productsUpdatedCount,
      }).from(scraperConfigs).orderBy(desc(scraperConfigs.updatedAt));
    } catch (error) {
      console.error('[ScraperAgent] Erro ao listar configs:', error);
      return [];
    }
  }),

  /** Tipos de scrapers disponíveis (fornecedores suportados) */
  tiposDisponiveis: protectedProcedure.query(() => {
    return Object.entries(FORNECEDOR_CONFIGS).map(([key, cfg]) => ({
      tipo: key,
      categorias: cfg.categoryUrls,
      suporta: {
        paginacao: !!cfg.nextPage,
        ean: !!cfg.productEan,
        codigo: !!cfg.productCode,
        imagem: !!cfg.productImage,
      },
    }));
  }),

  /** Cadastrar novo fornecedor para scraping */
  cadastrar: adminProcedure
    .input(cadastrarSchema)
    .mutation(async ({ input }: { input: z.infer<typeof cadastrarSchema> }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");

      const [result] = await db.insert(scraperConfigs).values({
        supplierId: input.supplierId,
        scraperType: input.scraperType,
        email: encryptPassword(input.email),
        passwordHash: encryptPassword(input.password),
        scheduleTime: input.scheduleTime,
        enabled: input.enabled,
      });

      return { id: (result as any).insertId, message: "Fornecedor configurado com sucesso" };
    }),

  /** Atualizar credenciais de um scraper */
  atualizarCredenciais: adminProcedure
    .input(atualizarCredenciaisSchema)
    .mutation(async ({ input }: { input: z.infer<typeof atualizarCredenciaisSchema> }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");

      const updates: Record<string, any> = {};
      if (input.email) updates.email = encryptPassword(input.email);
      if (input.password) updates.passwordHash = encryptPassword(input.password);
      if (input.scheduleTime) updates.scheduleTime = input.scheduleTime;
      if (input.enabled) updates.enabled = input.enabled;

      await db.update(scraperConfigs).set(updates).where(eq(scraperConfigs.id, input.id));
      return { message: "Credenciais atualizadas com sucesso" };
    }),

  /** Deletar configuração de um scraper */
  deletar: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }: { input: { id: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      await db.delete(scraperConfigs).where(eq(scraperConfigs.id, input.id));
      return { message: "Configuração deletada com sucesso" };
    }),

  /** Executar scraping de um fornecedor específico (dispara em background) */
  executar: adminProcedure
    .input(executarSchema)
    .mutation(async ({ input }: { input: z.infer<typeof executarSchema> }) => {
      const { scraperConfigId } = input;

      if (runningJobs.has(scraperConfigId)) {
        const job = runningJobs.get(scraperConfigId)!;
        if (job.status === "running") {
          throw new Error("Scraper já está em execução para este fornecedor");
        }
      }

      runningJobs.set(scraperConfigId, {
        status: "running",
        log: ["Job iniciado..."],
        startedAt: new Date(),
      });

      executarScraper(scraperConfigId)
        .then((r) => {
          runningJobs.set(scraperConfigId, {
            status: r.success ? "success" : "failed",
            log: r.log,
            startedAt: runningJobs.get(scraperConfigId)?.startedAt ?? new Date(),
          });
        })
        .catch((err) => {
          runningJobs.set(scraperConfigId, {
            status: "failed",
            log: [`Erro: ${err?.message}`],
            startedAt: runningJobs.get(scraperConfigId)?.startedAt ?? new Date(),
          });
        });

      return { message: "Scraper iniciado em background" };
    }),

  /** Consultar status de um job em execução */
  status: protectedProcedure
    .input(statusSchema)
    .query(({ input }: { input: z.infer<typeof statusSchema> }) => {
      const job = runningJobs.get(input.scraperConfigId);
      if (!job) return { status: "idle", log: [], startedAt: null };
      return job;
    }),

  /** Histórico de execuções de um scraper */
  historico: protectedProcedure
    .input(historicoSchema)
    .query(async ({ input }: { input: z.infer<typeof historicoSchema> }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(scraperLogs)
        .where(eq(scraperLogs.scraperConfigId, input.scraperConfigId))
        .orderBy(desc(scraperLogs.startedAt))
        .limit(input.limit);
    }),

  /** Executar scraping de TODOS os fornecedores habilitados */
  executarTodos: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível");

    const ativos = await db.select({ id: scraperConfigs.id })
      .from(scraperConfigs)
      .where(eq(scraperConfigs.enabled, "yes"));

    let iniciados = 0;
    for (const { id } of ativos) {
      if (!runningJobs.has(id) || runningJobs.get(id)?.status !== "running") {
        runningJobs.set(id, { status: "running", log: ["Job iniciado..."], startedAt: new Date() });
        executarScraper(id)
          .then((r) => {
            runningJobs.set(id, {
              status: r.success ? "success" : "failed",
              log: r.log,
              startedAt: runningJobs.get(id)?.startedAt ?? new Date(),
            });
          })
          .catch((err) => {
            runningJobs.set(id, {
              status: "failed",
              log: [`Erro: ${err?.message}`],
              startedAt: runningJobs.get(id)?.startedAt ?? new Date(),
            });
          });
        iniciados++;
        // Pequeno delay entre scrapers para não sobrecarregar
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    return { message: `${iniciados} scrapers iniciados`, total: ativos.length };
  }),

  /** Verificar email exibível de uma configuração (sem senha) */
  verEmail: adminProcedure
    .input(verEmailSchema)
    .query(async ({ input }: { input: z.infer<typeof verEmailSchema> }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const rows = await db.select({ email: scraperConfigs.email })
        .from(scraperConfigs).where(eq(scraperConfigs.id, input.id)).limit(1);
      if (!rows[0]) return { email: null };
      try {
        return { email: decryptPassword(rows[0].email) };
      } catch {
        return { email: "(erro ao descriptografar)" };
      }
    }),
});
