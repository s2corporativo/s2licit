import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { taxRules } from "../../drizzle/schema";
import { aliquotaTotal, calcularImpostos } from "../services/taxEngine";

/**
 * Motor Tributário: CRUD das regras (versionadas, com vigência) e simulador.
 * O sistema calcula ESTIMATIVAS a partir das regras cadastradas — o
 * enquadramento definitivo é validado com o contador (spec §15).
 */

const tipoSchema = z.enum(["simples_efetiva", "icms", "difal", "st", "fcp", "iss", "ipi", "pis", "cofins", "outro"]);
const ufSchema = z.string().length(2).transform((s) => s.toUpperCase());

export const taxRulesRouter = router({
  listar: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(taxRules).orderBy(desc(taxRules.ativo), desc(taxRules.vigenciaInicio));
  }),

  salvar: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        descricao: z.string().min(3).max(256),
        tipo: tipoSchema,
        ufOrigem: ufSchema.nullable().optional(),
        ufDestino: ufSchema.nullable().optional(),
        percentual: z.number().min(0).max(100),
        vigenciaInicio: z.string(), // yyyy-mm-dd
        vigenciaFim: z.string().nullable().optional(),
        ativo: z.boolean().optional(),
        observacoes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const valores = {
        descricao: input.descricao,
        tipo: input.tipo,
        ufOrigem: input.ufOrigem ?? null,
        ufDestino: input.ufDestino ?? null,
        percentual: String(input.percentual),
        vigenciaInicio: new Date(`${input.vigenciaInicio}T12:00:00`),
        vigenciaFim: input.vigenciaFim ? new Date(`${input.vigenciaFim}T12:00:00`) : null,
        ativo: input.ativo ?? true,
        observacoes: input.observacoes,
      };
      if (input.id) {
        // No update NÃO mexemos em criadoPor — preserva quem cadastrou a regra.
        await db.update(taxRules).set(valores).where(eq(taxRules.id, input.id));
        return { id: input.id };
      }
      const [res] = await db
        .insert(taxRules)
        .values({ ...valores, criadoPor: ctx.user?.name ?? ctx.user?.email ?? "sistema" });
      return { id: Number((res as any).insertId) };
    }),

  desativar: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      await db.update(taxRules).set({ ativo: false }).where(eq(taxRules.id, input.id));
      return { ok: true };
    }),

  /** Simulador tributário por operação (spec §16). */
  simular: protectedProcedure
    .input(
      z.object({
        valorVenda: z.number().positive(),
        custo: z.number().nonnegative().optional(),
        ufOrigem: ufSchema.optional(),
        ufDestino: ufSchema.optional(),
        data: z.string().optional(), // yyyy-mm-dd
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const regras = await db.select().from(taxRules);
      return calcularImpostos({
        valorVenda: input.valorVenda,
        custo: input.custo,
        ufOrigem: input.ufOrigem,
        ufDestino: input.ufDestino,
        data: input.data ? new Date(`${input.data}T12:00:00`) : undefined,
        regras,
      });
    }),

  /** Alíquota total (%) para uma UF de destino — usada pela precificação. */
  aliquotaPara: protectedProcedure
    .input(z.object({ ufOrigem: ufSchema.optional(), ufDestino: ufSchema.optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { totalPercentual: 0 };
      const regras = await db.select().from(taxRules);
      return {
        totalPercentual: aliquotaTotal({
          ufOrigem: input.ufOrigem,
          ufDestino: input.ufDestino,
          regras,
        }),
      };
    }),
});
