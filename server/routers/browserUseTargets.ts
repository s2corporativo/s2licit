/**
 * browserUseTargets.ts — gestão do coletor browser-use (PROMPT 2).
 *
 * Registro de alvos (portais sem API) e disparo de coleta. Alvo novo nasce
 * com enabled=false — só liga depois de alguém (admin) confirmar
 * explicitamente que os termos de uso do portal foram conferidos (guarda
 * de legalidade, PASSO 3a). Nunca presume permissão.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { browserUseExecutions, portalCollectionTargets } from "../../drizzle/schema";
import { buscarLicitacoesBrowserUse } from "../connectors/browserUseConnector";

const CriarAlvoSchema = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/, "use apenas minúsculas, números, - e _"),
  name: z.string().min(2).max(256),
  url: z.string().url(),
  agentTask: z.string().min(10).max(4000),
  requiredFields: z.array(z.string().min(1)).min(1).max(20),
  maxUsdPerExecution: z.number().positive().max(50).default(1),
  minIntervalSeconds: z.number().int().positive().default(3600),
  minSuccessRate: z.number().min(0).max(1).default(0.5),
});

export const browserUseTargetsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(portalCollectionTargets).orderBy(desc(portalCollectionTargets.createdAt));
  }),

  /** Cadastra um alvo novo — nasce SEMPRE desabilitado (guarda de
   * legalidade): habilitar exige uma chamada separada a `verifyCompliance`,
   * nunca acontece implicitamente na criação. */
  create: adminProcedure.input(CriarAlvoSchema).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

    const existente = await db
      .select()
      .from(portalCollectionTargets)
      .where(eq(portalCollectionTargets.slug, input.slug));
    if (existente.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: `Já existe um alvo com slug '${input.slug}'` });
    }

    const [result] = await db.insert(portalCollectionTargets).values({
      slug: input.slug,
      name: input.name,
      url: input.url,
      agentTask: input.agentTask,
      requiredFields: input.requiredFields,
      maxUsdPerExecution: input.maxUsdPerExecution.toFixed(4),
      minIntervalSeconds: input.minIntervalSeconds,
      minSuccessRate: input.minSuccessRate.toFixed(3),
      enabled: false,
    });
    return { id: (result as any).insertId ?? null };
  }),

  /** Guarda de legalidade (PASSO 3a): só um admin confirma, com registro de
   * quem e quando, que os termos de uso do portal foram conferidos. Sem
   * isso o alvo nunca é acionado (ver buscarLicitacoesBrowserUse). */
  verifyCompliance: adminProcedure
    .input(z.object({ slug: z.string(), termsUrl: z.string().url(), verifiedByName: z.string().min(2) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      await db
        .update(portalCollectionTargets)
        .set({
          enabled: true,
          termsVerifiedAt: new Date(),
          termsVerifiedBy: input.verifiedByName,
          termsUrl: input.termsUrl,
        })
        .where(eq(portalCollectionTargets.slug, input.slug));
      return { ok: true };
    }),

  /** Desliga um alvo (ex.: taxa de sucesso caiu, termos mudaram) — não
   * apaga o registro nem o histórico de execuções. */
  disable: adminProcedure.input(z.object({ slug: z.string() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
    await db
      .update(portalCollectionTargets)
      .set({ enabled: false })
      .where(eq(portalCollectionTargets.slug, input.slug));
    return { ok: true };
  }),

  /** Dispara uma coleta ad-hoc. NUNCA lança — buscarLicitacoesBrowserUse é
   * à prova de falha; retorna [] com o motivo registrado em
   * browserUseExecutions quando bloqueado/falha. */
  collect: adminProcedure.input(z.object({ slug: z.string() })).mutation(async ({ input }) => {
    const licitacoes = await buscarLicitacoesBrowserUse(input.slug);
    return { count: licitacoes.length, licitacoes };
  }),

  executions: protectedProcedure
    .input(z.object({ slug: z.string(), limit: z.number().int().positive().max(100).default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const target = (
        await db.select().from(portalCollectionTargets).where(eq(portalCollectionTargets.slug, input.slug))
      )[0];
      if (!target) return [];
      return db
        .select()
        .from(browserUseExecutions)
        .where(eq(browserUseExecutions.targetId, target.id))
        .orderBy(desc(browserUseExecutions.startedAt))
        .limit(input.limit);
    }),
});
