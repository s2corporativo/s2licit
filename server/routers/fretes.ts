import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getCompanySettings } from "../db";
import { freightQuotes, taxRules } from "../../drizzle/schema";
import { calcularCustoTotal } from "../services/custoTotalService";
import { aliquotaTotal } from "../services/taxEngine";

/**
 * Motor de Fretes + Custo Total de Aquisição (spec §17-19).
 * Cotações de frete manuais/tabelas; integrações com APIs de
 * transportadoras são interface pendente (documentado, spec §39).
 */

export const fretesRouter = router({
  listar: protectedProcedure
    .input(z.object({ tipo: z.enum(["entrada", "saida"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const base = db.select().from(freightQuotes);
      const rows = input?.tipo
        ? await base.where(eq(freightQuotes.tipo, input.tipo)).orderBy(desc(freightQuotes.createdAt)).limit(200)
        : await base.orderBy(desc(freightQuotes.createdAt)).limit(200);
      return rows;
    }),

  salvar: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        descricao: z.string().min(3).max(256),
        tipo: z.enum(["entrada", "saida"]),
        transportadora: z.string().max(128).optional(),
        origemCep: z.string().max(9).optional(),
        destinoCep: z.string().max(9).optional(),
        ufDestino: z.string().length(2).optional(),
        pesoKg: z.number().nonnegative().optional(),
        valorFrete: z.number().nonnegative(),
        prazoDias: z.number().int().nonnegative().optional(),
        validade: z.string().optional(),
        funilId: z.number().int().positive().optional(),
        supplierId: z.number().int().positive().optional(),
        observacoes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const valores = {
        descricao: input.descricao,
        tipo: input.tipo,
        transportadora: input.transportadora,
        origemCep: input.origemCep,
        destinoCep: input.destinoCep,
        ufDestino: input.ufDestino?.toUpperCase(),
        pesoKg: input.pesoKg != null ? String(input.pesoKg) : undefined,
        valorFrete: String(input.valorFrete),
        prazoDias: input.prazoDias,
        validade: input.validade ? new Date(`${input.validade}T12:00:00`) : undefined,
        funilId: input.funilId,
        supplierId: input.supplierId,
        observacoes: input.observacoes,
        criadoPor: ctx.user?.name ?? ctx.user?.email ?? "sistema",
      };
      if (input.id) {
        await db.update(freightQuotes).set(valores).where(eq(freightQuotes.id, input.id));
        return { id: input.id };
      }
      const [res] = await db.insert(freightQuotes).values(valores);
      return { id: Number((res as any).insertId) };
    }),

  remover: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      await db.delete(freightQuotes).where(eq(freightQuotes.id, input.id));
      return { ok: true };
    }),

  /**
   * Custo total de aquisição: produto + fretes + impostos (Motor Tributário
   * pela UF de destino) + taxas + custo financeiro → preço mínimo e
   * recomendado que cobrem TUDO.
   */
  custoTotal: protectedProcedure
    .input(
      z.object({
        precoProdutoUnit: z.number().positive(),
        quantidade: z.number().positive(),
        freteEntradaTotal: z.number().nonnegative().optional(),
        freteSaidaTotal: z.number().nonnegative().optional(),
        outrosCustosTotal: z.number().nonnegative().optional(),
        ufDestino: z.string().length(2).optional(),
        taxasPct: z.number().min(0).max(50).optional(),
        custoFinanceiroPct: z.number().min(0).max(50).optional(),
        margemMinimaPct: z.number().min(0).max(90).optional(),
        margemDesejadaPct: z.number().min(0).max(90).optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      let impostosPct = 0;
      if (db && input.ufDestino) {
        const regras = await db.select().from(taxRules);
        // UF de origem vem das configurações da empresa (antes era fixo "MG").
        const company = await getCompanySettings().catch(() => null);
        const ufOrigem = (company?.state || "MG").toUpperCase();
        impostosPct = aliquotaTotal({ ufOrigem, ufDestino: input.ufDestino, regras });
      }
      const res = calcularCustoTotal({
        precoProdutoUnit: input.precoProdutoUnit,
        quantidade: input.quantidade,
        freteEntradaTotal: input.freteEntradaTotal,
        freteSaidaTotal: input.freteSaidaTotal,
        outrosCustosTotal: input.outrosCustosTotal,
        impostosPct,
        taxasPct: input.taxasPct,
        custoFinanceiroPct: input.custoFinanceiroPct,
        margemMinimaPct: input.margemMinimaPct ?? 10,
        margemDesejadaPct: input.margemDesejadaPct ?? 25,
      });
      // Funções não serializam via tRPC — retorna os campos calculados
      return {
        custoUnitarioReal: res.custoUnitarioReal,
        custoLoteReal: res.custoLoteReal,
        impostosPct,
        percentuaisSobreVenda: res.percentuaisSobreVenda,
        precoMinimoUnit: res.precoMinimoUnit,
        precoRecomendadoUnit: res.precoRecomendadoUnit,
        alertas: res.alertas,
      };
    }),
});
