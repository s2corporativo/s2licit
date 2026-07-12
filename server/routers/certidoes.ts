import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { certidoes } from "../../drizzle/schema";
import { consultarCnpj } from "../connectors/brasilApiConnector";

/**
 * Classifica uma certidão pela validade em relação a uma data de referência.
 * Pura e exportada para teste.
 */
export function classificarValidade(
  dataValidade: Date,
  referencia: Date,
  diasAlerta = 30,
): "vencida" | "vence_em_breve" | "valida" {
  const msPorDia = 24 * 60 * 60 * 1000;
  const diff = Math.floor((dataValidade.getTime() - referencia.getTime()) / msPorDia);
  if (diff < 0) return "vencida";
  if (diff <= diasAlerta) return "vence_em_breve";
  return "valida";
}

const CertidaoInput = z.object({
  tipo: z.string().min(1).max(128),
  orgaoEmissor: z.string().max(256).optional().nullable(),
  numero: z.string().max(128).optional().nullable(),
  dataEmissao: z.string().optional().nullable(),   // ISO date
  dataValidade: z.string(),                         // ISO date (obrigatória)
  arquivoUrl: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

export const certidoesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(certidoes).where(eq(certidoes.ativa, true)).orderBy(asc(certidoes.dataValidade));
  }),

  /** Alertas: certidões vencidas ou vencendo em até N dias. */
  alertas: protectedProcedure
    .input(z.object({ diasAlerta: z.number().int().min(1).max(180).default(30) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { vencidas: [], vencendo: [] };
      const diasAlerta = input?.diasAlerta ?? 30;
      const rows = await db.select().from(certidoes).where(eq(certidoes.ativa, true));
      const hoje = new Date();
      const vencidas: typeof rows = [];
      const vencendo: typeof rows = [];
      for (const c of rows) {
        if (!c.dataValidade) continue;
        const status = classificarValidade(new Date(c.dataValidade), hoje, diasAlerta);
        if (status === "vencida") vencidas.push(c);
        else if (status === "vence_em_breve") vencendo.push(c);
      }
      return { vencidas, vencendo };
    }),

  create: adminProcedure.input(CertidaoInput).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
    const [res] = await db.insert(certidoes).values({
      tipo: input.tipo,
      orgaoEmissor: input.orgaoEmissor ?? null,
      numero: input.numero ?? null,
      dataEmissao: input.dataEmissao ? new Date(input.dataEmissao) : null,
      dataValidade: new Date(input.dataValidade),
      arquivoUrl: input.arquivoUrl ?? null,
      observacoes: input.observacoes ?? null,
    });
    return { id: (res as any).insertId as number };
  }),

  update: adminProcedure
    .input(CertidaoInput.partial().extend({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
      const { id, dataEmissao, dataValidade, ...rest } = input;
      await db
        .update(certidoes)
        .set({
          ...rest,
          ...(dataEmissao !== undefined ? { dataEmissao: dataEmissao ? new Date(dataEmissao) : null } : {}),
          ...(dataValidade !== undefined ? { dataValidade: new Date(dataValidade) } : {}),
        })
        .where(eq(certidoes.id, id));
      return { success: true };
    }),

  remove: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível." });
    await db.update(certidoes).set({ ativa: false }).where(eq(certidoes.id, input.id));
    return { success: true };
  }),

  /** Consulta pública de CNPJ (BrasilAPI) — útil na diligência de concorrentes/órgãos. */
  consultarCnpj: protectedProcedure
    .input(z.object({ cnpj: z.string().min(11).max(20) }))
    .query(async ({ input }) => {
      return consultarCnpj(input.cnpj);
    }),
});
