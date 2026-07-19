/**
 * scraperAgent.ts
 * Router do Agente de Scraping — gerencia fornecedores com login,
 * executa raspagem, testa credenciais e agenda atualizações automáticas.
 */

import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { scraperConfigs, scraperLogs } from "../../drizzle/schema";
import { and, eq, desc } from "drizzle-orm";
import { encryptPassword, decryptPassword } from "../utils/encryption";
import { executarScraper, testarLoginFornecedor, FORNECEDOR_CONFIGS } from "../services/scraperEngine";
import { expandAndSyncTambasaCatalog } from "../services/tambasaCatalogService";
import { logger } from "../_core/logger";

// Jobs em execução (em memória — suficiente para UI de progresso)
const runningJobs = new Map<number, { status: string; log: string[]; startedAt: Date }>();

// ─── Schemas ──────────────────────────────────────────────────────────────

// Seletores CSS/URLs para um fornecedor sem config embutida em
// FORNECEDOR_CONFIGS. Preenchido quando o usuário escolhe "Fornecedor
// personalizado" na tela de cadastro.
const customSelectorsSchema = z.object({
  loginUrl: z.string().url().optional(),
  loginTrigger: z.string().optional(),
  loginEmail: z.string().min(1),
  loginPassword: z.string().min(1),
  loginSubmit: z.string().min(1),
  loginSuccessUrl: z.string().optional(),
  loginSuccessText: z.string().optional(),
  loginSuccessSelector: z.string().optional(),
  categoryUrls: z.array(z.string().url()).min(1),
  productItem: z.string().min(1),
  productName: z.string().min(1),
  productPrice: z.string().min(1),
  productCode: z.string().optional(),
  productEan: z.string().optional(),
  productImage: z.string().optional(),
  productLink: z.string().optional(),
  nextPage: z.string().optional(),
  waitForSelector: z.string().optional(),
  navigationWait: z.number().optional(),
});

const cadastrarSchema = z.object({
  supplierId: z.number(),
  scraperType: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(4),
  scheduleTime: z.string().regex(/^\d{2}:\d{2}$/).default("02:00"),
  enabled: z.enum(["yes", "no"]).default("yes"),
  customSelectors: customSelectorsSchema.optional(),
  // Governança: o operador confirma que os termos de uso do site foram
  // revisados e a coleta está autorizada. Sem isso a captura não roda.
  tosAprovado: z.boolean().default(false),
});

const atualizarCredenciaisSchema = z.object({
  id: z.number(),
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

// A atualização manual SEMPRE pede a confirmação do login do fornecedor:
// o operador confirma o e-mail e digita a senha (ou reutiliza a salva).
// Credenciais enviadas aqui substituem as armazenadas antes da execução.
const executarSchema = z.object({
  scraperConfigId: z.number(),
  email: z.string().email().optional(),
  password: z.string().min(4).optional(),
  usarSenhaSalva: z.boolean().default(true),
});

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
        tosAprovado: scraperConfigs.tosAprovado,
        lastRunErrorMessage: scraperConfigs.lastRunErrorMessage,
        productsScrapedCount: scraperConfigs.productsScrapedCount,
        productsUpdatedCount: scraperConfigs.productsUpdatedCount,
      }).from(scraperConfigs).orderBy(desc(scraperConfigs.updatedAt));
    } catch (error) {
      logger.error('[ScraperAgent] Erro ao listar configs:', error);
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
        email: input.email,
        passwordHash: encryptPassword(input.password),
        scheduleTime: input.scheduleTime,
        enabled: input.enabled,
        customSelectors: input.customSelectors ?? null,
        tosAprovado: input.tosAprovado ?? false,
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
      if (input.email) updates.email = input.email; // e-mail em texto puro
      if (input.password) updates.passwordHash = encryptPassword(input.password);
      if (input.scheduleTime) updates.scheduleTime = input.scheduleTime;
      if (input.enabled) updates.enabled = input.enabled;
      if (input.customSelectors) updates.customSelectors = input.customSelectors;
      if (input.tosAprovado !== undefined) updates.tosAprovado = input.tosAprovado;

      await db.update(scraperConfigs).set(updates).where(eq(scraperConfigs.id, input.id));
      return { message: "Credenciais atualizadas com sucesso" };
    }),

  /** Testa login no site do fornecedor (sem raspar nem salvar nada) */
  testarConexao: adminProcedure
    .input(testarConexaoSchema)
    .mutation(async ({ input }: { input: z.infer<typeof testarConexaoSchema> }) => {
      return testarLoginFornecedor(input.scraperType, input.email, input.password, input.customSelectors);
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
      let scraperType = "";

      // Governança: captura só roda com os termos de uso do fornecedor
      // revisados e aprovados por um humano (checkbox na tela de captura).
      {
        const db = await getDb();
        if (!db) throw new Error("Banco indisponível");
        const [cfg] = await db
          .select({
            tosAprovado: scraperConfigs.tosAprovado,
            scraperType: scraperConfigs.scraperType,
          })
          .from(scraperConfigs)
          .where(eq(scraperConfigs.id, scraperConfigId))
          .limit(1);
        if (!cfg) throw new Error("Configuração de captura não encontrada.");
        if (!cfg.tosAprovado) {
          throw new Error(
            "Captura bloqueada: confirme na configuração do fornecedor que os termos de uso do site foram revisados e a coleta está autorizada."
          );
        }
        scraperType = cfg.scraperType.toLowerCase();
      }

      // Confirmação de login: se o operador digitou credenciais novas, elas
      // são gravadas (senha criptografada) antes de iniciar a captura. Sem
      // senha nova, exige explicitamente o uso da senha salva.
      if (input.password || input.email) {
        const db = await getDb();
        if (!db) throw new Error("Banco indisponível");
        const updates: Record<string, any> = {};
        if (input.email) updates.email = input.email;
        if (input.password) updates.passwordHash = encryptPassword(input.password);
        await db.update(scraperConfigs).set(updates).where(eq(scraperConfigs.id, scraperConfigId));
      } else if (!input.usarSenhaSalva) {
        throw new Error("Informe a senha do fornecedor ou marque 'usar senha salva'.");
      }

      if (runningJobs.has(scraperConfigId)) {
        const job = runningJobs.get(scraperConfigId)!;
        if (job.status === "running") {
          throw new Error("Scraper já está em execução para este fornecedor");
        }
      }

      runningJobs.set(scraperConfigId, {
        status: "running",
        log: [scraperType === "tambasa" ? "Descobrindo todo o catálogo Tambasa..." : "Job iniciado..."],
        startedAt: new Date(),
      });

      const runPromise = scraperType === "tambasa"
        ? expandAndSyncTambasaCatalog(scraperConfigId).then((result) => result.scraper)
        : executarScraper(scraperConfigId);

      runPromise
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

      return {
        message: scraperType === "tambasa"
          ? "Descoberta e sincronização completa da Tambasa iniciadas em background"
          : "Scraper iniciado em background",
      };
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

    // Só fornecedores habilitados E com termos de uso aprovados (governança)
    const ativos = await db.select({
      id: scraperConfigs.id,
      scraperType: scraperConfigs.scraperType,
    })
      .from(scraperConfigs)
      .where(and(eq(scraperConfigs.enabled, "yes"), eq(scraperConfigs.tosAprovado, true)));

    let iniciados = 0;
    for (const { id, scraperType } of ativos) {
      if (!runningJobs.has(id) || runningJobs.get(id)?.status !== "running") {
        const isTambasa = scraperType.toLowerCase() === "tambasa";
        runningJobs.set(id, {
          status: "running",
          log: [isTambasa ? "Descobrindo todo o catálogo Tambasa..." : "Job iniciado..."],
          startedAt: new Date(),
        });

        const runPromise = isTambasa
          ? expandAndSyncTambasaCatalog(id).then((result) => result.scraper)
          : executarScraper(id);

        runPromise
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
      // E-mail é texto puro; tolera registros antigos criptografados.
      const raw = rows[0].email ?? "";
      if (raw.includes("@")) return { email: raw };
      try {
        return { email: decryptPassword(raw) };
      } catch {
        return { email: raw };
      }
    }),
});
