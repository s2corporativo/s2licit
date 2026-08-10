/**
 * Fachada compatível da Central de Captura.
 *
 * A UI antiga continua usando os endpoints principais, mas execução, status e
 * histórico são servidos pelo Capture Core persistente. Este router não executa
 * navegador nem altera catálogo diretamente.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { scraperConfigs, scraperLogs } from "../../drizzle/schema";
import {
  captureConnectorHealth,
  captureJobs,
} from "../../drizzle/captureCoreSchema";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import { assertSafeExternalUrl } from "../utils/urlGuard";
import {
  FORNECEDOR_CONFIGS,
  testarLoginFornecedor,
  type SelectorConfig,
} from "../services/scraperEngine";
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

function isSafeExternalTemplate(raw: string): boolean {
  try {
    const probe = raw.replace(/\{q\}|\{termo\}/gi, "capture-probe");
    const parsed = assertSafeExternalUrl(probe, "URL do conector");
    return !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

const externalUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine(isSafeExternalTemplate, {
    message: "Informe uma URL externa http/https válida e não privada.",
  });

const optionalSelectorSchema = z.string().trim().min(1).max(2_000).optional();

const customSelectorsSchema = z
  .object({
    loginUrl: externalUrlSchema.optional(),
    loginTrigger: optionalSelectorSchema,
    loginEmail: z.string().trim().min(1).max(2_000),
    loginPassword: z.string().trim().min(1).max(2_000),
    loginSubmit: z.string().trim().min(1).max(2_000),
    loginSuccessUrl: z.string().trim().min(1).max(2_048).optional(),
    loginSuccessText: z.string().trim().min(1).max(1_000).optional(),
    loginSuccessSelector: optionalSelectorSchema,
    categoryUrls: z.array(externalUrlSchema).max(5_000).default([]),
    searchUrlTemplate: externalUrlSchema.optional(),
    useStructuredData: z.boolean().optional(),
    productItem: z.string().trim().min(1).max(2_000),
    productName: z.string().trim().min(1).max(2_000),
    productPrice: z.string().trim().min(1).max(2_000),
    productCode: optionalSelectorSchema,
    productEan: optionalSelectorSchema,
    productImage: optionalSelectorSchema,
    productLink: optionalSelectorSchema,
    nextPage: optionalSelectorSchema,
    waitForSelector: optionalSelectorSchema,
    navigationWait: z.number().int().min(0).max(60_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.categoryUrls.length === 0 && !value.searchUrlTemplate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryUrls"],
        message: "Informe ao menos uma URL de categoria ou uma URL de busca.",
      });
    }
  });

const scheduleTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .refine((value) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }, "Horário inválido; use HH:MM entre 00:00 e 23:59.");

const loginIdentifierSchema = z.string().trim().min(1).max(320);
const scraperTypeSchema = z.string().trim().min(1).max(64);

const cadastrarSchema = z
  .object({
    supplierId: z.number().int().positive(),
    scraperType: scraperTypeSchema,
    // Nome legado preservado para compatibilidade com o frontend. Pode ser
    // e-mail, usuário ou CPF/CNPJ conforme o portal do fornecedor.
    email: loginIdentifierSchema,
    password: z.string().min(1).max(512),
    scheduleTime: scheduleTimeSchema.default("02:00"),
    enabled: z.enum(["yes", "no"]).default("yes"),
    customSelectors: customSelectorsSchema.optional(),
    tosAprovado: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const type = value.scraperType.toLowerCase();
    const hasPreset = Boolean(FORNECEDOR_CONFIGS[type]);
    if ((!hasPreset || type === "generico") && !value.customSelectors) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customSelectors"],
        message: "Conector sem preset homologado exige seletores personalizados.",
      });
    }
  });

const atualizarCredenciaisSchema = z.object({
  id: z.number().int().positive(),
  email: loginIdentifierSchema.optional(),
  password: z.string().min(1).max(512).optional(),
  scheduleTime: scheduleTimeSchema.optional(),
  enabled: z.enum(["yes", "no"]).optional(),
  customSelectors: customSelectorsSchema.nullable().optional(),
  tosAprovado: z.boolean().optional(),
});

const testarConexaoSchema = z.object({
  scraperType: scraperTypeSchema,
  email: loginIdentifierSchema,
  password: z.string().min(1).max(512),
  customSelectors: customSelectorsSchema.optional(),
});

const executarSchema = z.object({
  scraperConfigId: z.number().int().positive(),
  email: loginIdentifierSchema.optional(),
  password: z.string().min(1).max(512).optional(),
  usarSenhaSalva: z.boolean().default(true),
});

function normalizeScraperType(value: string): string {
  return value.trim().toLowerCase();
}

function decryptLoginIdentifier(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const decrypted = decryptPassword(value).trim();
    return decrypted || value;
  } catch {
    return value;
  }
}

export const scraperAgentRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível.");

    const configs = await db
      .select({
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
      })
      .from(scraperConfigs)
      .orderBy(desc(scraperConfigs.updatedAt));

    const [active, healthRows] = await Promise.all([
      db
        .select({
          scraperConfigId: captureJobs.scraperConfigId,
          status: captureJobs.status,
          stage: captureJobs.progressStage,
          message: captureJobs.progressMessage,
        })
        .from(captureJobs)
        .where(inArray(captureJobs.status, ["queued", "running"])),
      db.select().from(captureConnectorHealth),
    ]);

    const activeByConfig = new Map(
      active.map((job) => [job.scraperConfigId, job]),
    );
    const healthByConfig = new Map(
      healthRows.map((row) => [row.scraperConfigId, row]),
    );

    return configs.map((config) => {
      const activeJob = activeByConfig.get(config.id);
      const health = healthByConfig.get(config.id);
      const capabilities = getConnectorCapabilities(
        config.scraperType,
        config.customSelectors,
      );

      return {
        ...config,
        lastRunStatus: activeJob ? "running" : config.lastRunStatus,
        captureStage: activeJob?.stage ?? null,
        captureMessage: activeJob?.message ?? null,
        healthStatus: health?.status ?? "unknown",
        healthScore: health?.score != null ? Number(health.score) : null,
        capabilities,
      };
    });
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

  cadastrar: adminProcedure
    .input(cadastrarSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível.");

      const [existing] = await db
        .select({ id: scraperConfigs.id })
        .from(scraperConfigs)
        .where(eq(scraperConfigs.supplierId, input.supplierId))
        .limit(1);

      if (existing) {
        throw new Error(
          "Este fornecedor já possui uma configuração de captura. Edite a existente para evitar jobs duplicados.",
        );
      }

      const scraperType = normalizeScraperType(input.scraperType);
      const capabilities = getConnectorCapabilities(
        scraperType,
        input.customSelectors,
      );
      if (!capabilities.configured || !capabilities.authenticated) {
        throw new Error("Configuração de captura incompleta ou não suportada.");
      }
      if (!capabilities.fullCatalog && !capabilities.search) {
        throw new Error(
          "O conector não possui catálogo completo nem busca configurada. Configure ao menos uma estratégia de captura.",
        );
      }

      const [result] = await db.insert(scraperConfigs).values({
        supplierId: input.supplierId,
        scraperType,
        email: input.email.trim(),
        passwordHash: encryptPassword(input.password),
        scheduleTime: input.scheduleTime,
        enabled: input.enabled,
        customSelectors: input.customSelectors ?? null,
        tosAprovado: input.tosAprovado,
      });

      return {
        id: Number((result as { insertId?: unknown }).insertId),
        message: "Fornecedor configurado com sucesso.",
        capabilities,
      };
    }),

  atualizarCredenciais: adminProcedure
    .input(atualizarCredenciaisSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível.");

      const updates: Record<string, unknown> = {};
      if (input.email !== undefined) updates.email = input.email.trim();
      if (input.password !== undefined) {
        updates.passwordHash = encryptPassword(input.password);
      }
      if (input.scheduleTime !== undefined) updates.scheduleTime = input.scheduleTime;
      if (input.enabled !== undefined) updates.enabled = input.enabled;
      if (input.customSelectors !== undefined) {
        updates.customSelectors = input.customSelectors;
      }
      if (input.tosAprovado !== undefined) updates.tosAprovado = input.tosAprovado;

      if (Object.keys(updates).length === 0) {
        return { message: "Nenhuma alteração informada." };
      }

      await db
        .update(scraperConfigs)
        .set(updates)
        .where(eq(scraperConfigs.id, input.id));

      return { message: "Configuração atualizada com sucesso." };
    }),

  testarConexao: adminProcedure
    .input(testarConexaoSchema)
    .mutation(({ input }) => {
      const custom = input.customSelectors
        ? ({ ...input.customSelectors } as SelectorConfig)
        : undefined;
      return testarLoginFornecedor(
        normalizeScraperType(input.scraperType),
        input.email.trim(),
        input.password,
        custom,
      );
    }),

  deletar: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível.");

      const [config] = await db
        .select({ id: scraperConfigs.id })
        .from(scraperConfigs)
        .where(eq(scraperConfigs.id, input.id))
        .limit(1);
      if (!config) throw new Error("Configuração de captura não encontrada.");

      const [active] = await db
        .select({ id: captureJobs.id })
        .from(captureJobs)
        .where(
          and(
            eq(captureJobs.scraperConfigId, input.id),
            inArray(captureJobs.status, ["queued", "running"]),
          ),
        )
        .limit(1);

      if (active) {
        throw new Error(
          "Não é possível remover/desativar a configuração enquanto há captura ativa.",
        );
      }

      const [captureHistory, legacyHistory] = await Promise.all([
        db
          .select({ id: captureJobs.id })
          .from(captureJobs)
          .where(eq(captureJobs.scraperConfigId, input.id))
          .limit(1),
        db
          .select({ id: scraperLogs.id })
          .from(scraperLogs)
          .where(eq(scraperLogs.scraperConfigId, input.id))
          .limit(1),
      ]);

      if (captureHistory.length > 0 || legacyHistory.length > 0) {
        await db
          .update(scraperConfigs)
          .set({ enabled: "no", tosAprovado: false })
          .where(eq(scraperConfigs.id, input.id));

        return {
          removed: false,
          archived: true,
          message:
            "Configuração desativada. O histórico de captura foi preservado para auditoria.",
        };
      }

      await db.delete(scraperConfigs).where(eq(scraperConfigs.id, input.id));
      return {
        removed: true,
        archived: false,
        message: "Configuração sem histórico removida com sucesso.",
      };
    }),

  executar: adminProcedure
    .input(executarSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível.");

      if (input.password !== undefined || input.email !== undefined) {
        const updates: Record<string, unknown> = {};
        if (input.email !== undefined) updates.email = input.email.trim();
        if (input.password !== undefined) {
          updates.passwordHash = encryptPassword(input.password);
        }
        await db
          .update(scraperConfigs)
          .set(updates)
          .where(eq(scraperConfigs.id, input.scraperConfigId));
      } else if (!input.usarSenhaSalva) {
        throw new Error(
          "Informe a senha do fornecedor ou marque 'usar senha salva'.",
        );
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
        reused: job.reused,
      };
    }),

  buscarAgora: adminProcedure
    .input(
      z.object({
        scraperConfigId: z.number().int().positive(),
        termo: z.string().trim().min(1).max(512),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const job = await enqueueCaptureJob({
        scraperConfigId: input.scraperConfigId,
        mode: "search",
        trigger: "api",
        query: input.termo,
        priority: 100,
        createdByUserId: ctx.user.id,
      });
      return {
        jobId: job.id,
        status: job.status,
        reused: job.reused,
        mode: job.mode,
      };
    }),

  status: protectedProcedure
    .input(z.object({ scraperConfigId: z.number().int().positive() }))
    .query(({ input }) => getCaptureJobStatus(input.scraperConfigId)),

  historico: protectedProcedure
    .input(
      z.object({
        scraperConfigId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const current = await listCaptureJobHistory(
        input.scraperConfigId,
        input.limit,
      );
      if (current.length > 0) return current;

      const db = await getDb();
      if (!db) throw new Error("Banco indisponível.");
      return db
        .select()
        .from(scraperLogs)
        .where(eq(scraperLogs.scraperConfigId, input.scraperConfigId))
        .orderBy(desc(scraperLogs.startedAt))
        .limit(input.limit);
    }),

  executarTodos: adminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Banco indisponível.");

    const ativos = await db
      .select({ id: scraperConfigs.id })
      .from(scraperConfigs)
      .where(
        and(
          eq(scraperConfigs.enabled, "yes"),
          eq(scraperConfigs.tosAprovado, true),
        ),
      );

    let iniciados = 0;
    let reutilizados = 0;
    const jobs: number[] = [];
    const falhas: Array<{ scraperConfigId: number; error: string }> = [];

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
        if (job.reused) reutilizados += 1;
        else iniciados += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        falhas.push({ scraperConfigId: config.id, error: message });
        logger.warn(
          `[ScraperAgent] Config #${config.id} não enfileirada: ${message}`,
        );
      }
    }

    return {
      message:
        `${iniciados} captura(s) enfileirada(s); ${reutilizados} reutilizada(s); ` +
        `${falhas.length} falha(s).`,
      total: ativos.length,
      jobs,
      falhas,
    };
  }),

  reviewQueue: adminProcedure
    .input(
      z
        .object({
          scraperConfigId: z.number().int().positive().optional(),
          supplierId: z.number().int().positive().optional(),
          limit: z.number().int().min(1).max(500).default(100),
        })
        .default({ limit: 100 }),
    )
    .query(({ input }) => listCaptureReviewQueue(input)),

  decideObservation: adminProcedure
    .input(
      z.object({
        observationId: z.number().int().positive(),
        decision: z.enum(["approve", "reject"]),
        expectedProductId: z.number().int().positive().nullable().optional(),
        notes: z.string().max(2_000).nullable().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      decideCaptureObservation({
        ...input,
        userId: ctx.user.id,
      }),
    ),

  health: protectedProcedure.query(() => getConnectorHealthList()),

  runnerStatus: adminProcedure.query(() => captureRunnerStatus()),

  verEmail: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível.");

      const [row] = await db
        .select({ email: scraperConfigs.email })
        .from(scraperConfigs)
        .where(eq(scraperConfigs.id, input.id))
        .limit(1);

      if (!row) return { email: null };
      return { email: decryptLoginIdentifier(row.email) };
    }),
});
