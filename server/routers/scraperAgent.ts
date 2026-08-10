/**
 * scraperAgent.ts
 *
 * Fachada compatível da Central de Captura. A UI antiga continua usando os
 * mesmos endpoints principais, mas execução/status/histórico agora vêm do
 * Capture Core persistente em vez de Maps em memória.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { scraperConfigs, scraperLogs } from "../../drizzle/schema";
import { captureConnectorHealth, captureJobs } from "../../drizzle/captureCoreSchema";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import { FORNECEDOR_CONFIGS, testarLoginFornecedor } from "../services/scraperEngine";
import { getConnectorCapabilities } from "../services/captureConnectorCapabilities";
import {
  decideCaptureObservation,
  enqueueCaptureJob,
  getCaptureJobStatus,
  getConnectorHealthList,
  listCaptureJobHistory,
  listCaptureReviewQueue,
} from "../services/captureCoreService";
import { captureRunnerStatus } from "../jobs/captureJobRunner";
import { logger } from "../_core/logger";

const customSelectorsSchema = z.object({
  loginUrl: z.string().url().optional(),
  loginTrigger: z.string().optional(),
  loginEmail: z.string().min(1),
  loginPassword: z.string().min(1),
  loginSubmit: z.string().min(1),
  loginSuccessUrl: z.string().optional(),
  loginSuccessText: z.string().optional(),
  loginSuccessSelector: z.string().optional(),
  categoryUrls: z.array(z.string().url()).default([]),
  searchUrlTemplate: z.string().url().optional(),
  useStructuredData: z.boolean().optional(),
  productItem: z.string().min(1),
  productName: z.string().min(1),
  productPrice: z.string().min(1),
  productCode: z.string().optional(),
  productEan: z.string().optional(),
  productImage: z.string().optional(),
  productLink: z.string().optional(),
  nextPage: z.string().optional(),
  waitForSelector: z.string().optional(),
  navigationWait: z.number().int().min(0).max(60_000).optional(),
}).refine(
  (value) => value.categoryUrls.length > 0 || Boolean(value.searchUrlTemplate),
  { message: "Informe ao menos uma URL de categoria ou uma URL de busca." },
);

const cadastrarSchema = z.object({
  supplierId: z.number().int().positive(),
  scraperType: z.string().min(1).max(64),
  email: z.string().email(),
  password: z.string().min(4),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).default("02:00"),
  enabled: z.enum(["yes", "no"]).default("yes"),
  customSelectors: customSelectorsSchema.optional(),
  tosAprovado: z.boolean().default(false),
});

const atualizarCredenciaisSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email().optional(),
  password: z.string().min(4).optional(),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  enabled: z.enum(["yes", "no"]).optional(),
  customSelectors: customSelectorsSchema.optional(),
  tosAprovado: z.boolean().optional(),
});

const testarConexaoSchema = z.object({
  scraperType: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  customSelectors: customSelectorsSchema.optional(),
});

const executarSchema = z.object({
  scraperConfigId: z.number().int().positive(),
  email: z.string().email().optional(),
  password: z.string().min(4).optional(),
  usarSenhaSalva: z.boolean().default(true),
});

export const scraperAgentRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      const configs = await db.select({
        id: scraperConfigs.id,
        supplierId: scraperConfigs.supplierId,
        scraperType: scraperConfigs.scraperType,
        enabled: scraperConfigs.enabled,
        scheduleTime: scraperConfigs.scheduleTime,
        lastRunAt: scraperConfigs.lastRunAt,
        lastRunStatus: scraperConfigs.lastRunStatus,
        tosAprovado: scraperConfigs.tosAprovado,
        lastRunErrorMessage: scraperConfigs.lastRunErrorMessage,
        productsScrapedCount: scraperConfigs.productsScrapedCount,
        productsUpdatedCount: scraperConfigs.productsUpdatedCount,
        customSelectors: scraperConfigs.customSelectors,
      }).from(scraperConfigs).orderBy(desc(scraperConfigs.updatedAt));

      const active = await db.select({
        scraperConfigId: captureJobs.scraperConfigId,
        status: captureJobs.status,
        stage: captureJobs.progressStage,
        message: captureJobs.progressMessage,
      }).from(captureJobs)
        .where(inArray(captureJobs.status, ["queued", "running"]));
      const activeByConfig = new Map(active.map((job) => [job.scraperConfigId, job]));

      const healthRows = await db.select().from(captureConnectorHealth);
      const healthByConfig = new Map(healthRows.map((row) => [row.scraperConfigId, row]));

      return configs.map((config) => {
        const activeJob = activeByConfig.get(config.id);
        const health = healthByConfig.get(config.id);
        const capabilities = getConnectorCapabilities(config.scraperType, config.customSelectors as any);
        return {
          ...config,
          // Compatibilidade com o frontend atual: ele já sabe renderizar running.
          lastRunStatus: activeJob ? "running" : config.lastRunStatus,
          captureStage: activeJob?.stage ?? null,
          captureMessage: activeJob?.message ?? null,
          healthStatus: health?.status ?? "unknown",
          healthScore: health?.score != null ? Number(health.score) : null,
          capabilities,
        };
      });
    } catch (error) {
      logger.error("[ScraperAgent] Erro ao listar configs:", error);
      return [];
    }
  }),

  tiposDisponiveis: protectedProcedure.query(() =>
    Object.entries(FORNECEDOR_CONFIGS)
      .filter(([key]) => key !== "generico")
      .map(([key, cfg]) => ({
        tipo: key,
        categorias: cfg.categoryUrls,
        capacidades: getConnectorCapabilities(key, cfg),
        suporta: {
          paginacao: Boolean(cfg.nextPage),
          busca: Boolean(cfg.searchUrlTemplate),
          ean: Boolean(cfg.productEan || cfg.useStructuredData),
          codigo: Boolean(cfg.productCode || cfg.useStructuredData),
          imagem: Boolean(cfg.productImage || cfg.useStructuredData),
        },
      })),
  ),

  cadastrar: adminProcedure.input(cadastrarSchema).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível");

    const [existing] = await db.select({ id: scraperConfigs.id })
      .from(scraperConfigs)
      .where(eq(scraperConfigs.supplierId, input.supplierId))
      .limit(1);
    if (existing) {
      throw new Error("Este fornecedor já possui uma configuração de captura. Edite a existente para evitar jobs duplicados.");
    }

    const [result] = await db.insert(scraperConfigs).values({
      supplierId: input.supplierId,
      scraperType: input.scraperType,
      email: input.email,
      passwordHash: encryptPassword(input.password),
      scheduleTime: input.scheduleTime,
      enabled: input.enabled,
      customSelectors: input.customSelectors ?? null,
      tosAprovado: input.tosAprovado,
    });
    return { id: Number((result as any).insertId), message: "Fornecedor configurado com sucesso" };
  }),

  atualizarCredenciais: adminProcedure.input(atualizarCredenciaisSchema).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível");
    const updates: Record<string, unknown> = {};
    if (input.email) updates.email = input.email;
    if (input.password) updates.passwordHash = encryptPassword(input.password);
    if (input.scheduleTime) updates.scheduleTime = input.scheduleTime;
    if (input.enabled) updates.enabled = input.enabled;
    if (input.customSelectors) updates.customSelectors = input.customSelectors;
    if (input.tosAprovado !== undefined) updates.tosAprovado = input.tosAprovado;
    await db.update(scraperConfigs).set(updates).where(eq(scraperConfigs.id, input.id));
    return { message: "Configuração atualizada com sucesso" };
  }),

  testarConexao: adminProcedure.input(testarConexaoSchema).mutation(async ({ input }) => {
    const custom = input.customSelectors
      ? ({ ...input.customSelectors, categoryUrls: input.customSelectors.categoryUrls ?? [] } as any)
      : undefined;
    return testarLoginFornecedor(input.scraperType, input.email, input.password, custom);
  }),

  deletar: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível");
    const [active] = await db.select({ id: captureJobs.id }).from(captureJobs)
      .where(and(eq(captureJobs.scraperConfigId, input.id), inArray(captureJobs.status, ["queued", "running"])))
      .limit(1);
    if (active) throw new Error("Não é possível remover a configuração enquanto há captura ativa.");
    await db.delete(scraperConfigs).where(eq(scraperConfigs.id, input.id));
    return { message: "Configuração removida com sucesso" };
  }),

  executar: adminProcedure.input(executarSchema).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível");

    if (input.password || input.email) {
      const updates: Record<string, unknown> = {};
      if (input.email) updates.email = input.email;
      if (input.password) updates.passwordHash = encryptPassword(input.password);
      await db.update(scraperConfigs).set(updates).where(eq(scraperConfigs.id, input.scraperConfigId));
    } else if (!input.usarSenhaSalva) {
      throw new Error("Informe a senha do fornecedor ou marque 'usar senha salva'.");
    }

    const job = await enqueueCaptureJob({
      scraperConfigId: input.scraperConfigId,
      mode: "full",
      trigger: "manual",
      priority: 80,
      createdByUserId: ctx.user.id,
    });
    return {
      message: job.reused
        ? `Já existe uma captura ${job.status} para este fornecedor.`
        : `Captura ${job.mode} enfileirada com sucesso.`,
      jobId: job.id,
      mode: job.mode,
    };
  }),

  buscarAgora: adminProcedure.input(z.object({
    scraperConfigId: z.number().int().positive(),
    termo: z.string().min(1).max(512),
  })).mutation(async ({ input, ctx }) => {
    const job = await enqueueCaptureJob({
      scraperConfigId: input.scraperConfigId,
      mode: "search",
      trigger: "api",
      query: input.termo,
      priority: 100,
      createdByUserId: ctx.user.id,
    });
    return { jobId: job.id, status: job.status, reused: job.reused };
  }),

  status: protectedProcedure.input(z.object({ scraperConfigId: z.number().int().positive() }))
    .query(({ input }) => getCaptureJobStatus(input.scraperConfigId)),

  historico: protectedProcedure.input(z.object({
    scraperConfigId: z.number().int().positive(),
    limit: z.number().int().min(1).max(100).default(20),
  })).query(async ({ input }) => {
    const current = await listCaptureJobHistory(input.scraperConfigId, input.limit);
    if (current.length > 0) return current;
    // Compatibilidade histórica durante a transição.
    const db = await getDb();
    if (!db) return [];
    return db.select().from(scraperLogs)
      .where(eq(scraperLogs.scraperConfigId, input.scraperConfigId))
      .orderBy(desc(scraperLogs.startedAt)).limit(input.limit);
  }),

  executarTodos: adminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível");
    const ativos = await db.select({ id: scraperConfigs.id })
      .from(scraperConfigs)
      .where(and(eq(scraperConfigs.enabled, "yes"), eq(scraperConfigs.tosAprovado, true)));
    let iniciados = 0;
    let reutilizados = 0;
    const jobs: number[] = [];
    for (const config of ativos) {
      try {
        const job = await enqueueCaptureJob({
          scraperConfigId: config.id,
          mode: "full",
          trigger: "bulk",
          priority: 60,
          createdByUserId: ctx.user.id,
        });
        jobs.push(job.id);
        if (job.reused) reutilizados++;
        else iniciados++;
      } catch (error) {
        logger.warn(`[ScraperAgent] Config #${config.id} não enfileirada: ${(error as Error).message}`);
      }
    }
    return {
      message: `${iniciados} captura(s) enfileirada(s); ${reutilizados} já estavam em andamento.`,
      total: ativos.length,
      jobs,
    };
  }),

  reviewQueue: adminProcedure.input(z.object({
    scraperConfigId: z.number().int().positive().optional(),
    supplierId: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  }).default({ limit: 100 })).query(({ input }) => listCaptureReviewQueue(input)),

  decideObservation: adminProcedure.input(z.object({
    observationId: z.number().int().positive(),
    decision: z.enum(["approve", "reject"]),
    expectedProductId: z.number().int().positive().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })).mutation(({ input, ctx }) => decideCaptureObservation({
    ...input,
    userId: ctx.user.id,
  })),

  health: protectedProcedure.query(() => getConnectorHealthList()),

  runnerStatus: adminProcedure.query(() => captureRunnerStatus()),

  verEmail: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível");
    const [row] = await db.select({ email: scraperConfigs.email })
      .from(scraperConfigs).where(eq(scraperConfigs.id, input.id)).limit(1);
    if (!row) return { email: null };
    const raw = row.email ?? "";
    if (raw.includes("@")) return { email: raw };
    try { return { email: decryptPassword(raw) }; }
    catch { return { email: raw }; }
  }),
});
