import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  ETAPAS_FUNIL,
  emailQuotations,
  funilEventos,
  funilOportunidades,
  licitacoes,
  type EtapaFunil,
} from "../../drizzle/schema";

/**
 * Funil de Oportunidades — pipeline unificado (kanban) da operação:
 * nova → triagem → análise → cotação → precificação → proposta → enviada →
 * disputa → habilitação → vencida/perdida/cancelada → contrato → entrega →
 * faturamento → recebimento → encerrada.
 *
 * Toda movimentação registra um evento (de/para, justificativa, usuário) —
 * histórico auditável exigido pelo processo comercial.
 */

const etapaSchema = z.enum(ETAPAS_FUNIL);

/** Etapas consideradas "encerradas" (não contam como trabalho aberto). */
export const ETAPAS_FINAIS: EtapaFunil[] = ["perdida", "cancelada", "encerrada"];

export const funilRouter = router({
  /** Kanban completo: oportunidades agrupadas por etapa. */
  kanban: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { etapas: ETAPAS_FUNIL, colunas: {} as Record<string, FunilCard[]> };
    const rows = await db
      .select()
      .from(funilOportunidades)
      .orderBy(desc(funilOportunidades.updatedAt))
      .limit(500);
    const colunas: Record<string, FunilCard[]> = {};
    for (const e of ETAPAS_FUNIL) colunas[e] = [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    for (const r of rows) {
      let diasPrazo: number | null = null;
      if (r.prazoEnvio) {
        const alvo = new Date(r.prazoEnvio);
        alvo.setHours(0, 0, 0, 0);
        diasPrazo = Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
      }
      colunas[r.etapa]?.push({
        id: r.id,
        titulo: r.titulo,
        orgao: r.orgao,
        modalidade: r.modalidade,
        numeroProcesso: r.numeroProcesso,
        valorEstimado: r.valorEstimado ? Number(r.valorEstimado) : null,
        prazoEnvio: r.prazoEnvio ? new Date(r.prazoEnvio).toISOString() : null,
        diasPrazo,
        risco: r.risco,
        origemTipo: r.origemTipo,
      });
    }
    return { etapas: ETAPAS_FUNIL, colunas };
  }),

  /** Detalhe de uma oportunidade com o histórico de movimentações. */
  detalhe: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [op] = await db
        .select()
        .from(funilOportunidades)
        .where(eq(funilOportunidades.id, input.id))
        .limit(1);
      if (!op) return null;
      const eventos = await db
        .select()
        .from(funilEventos)
        .where(eq(funilEventos.oportunidadeId, input.id))
        .orderBy(desc(funilEventos.createdAt));
      return { ...op, eventos };
    }),

  /** Cria oportunidade manual. */
  criar: protectedProcedure
    .input(
      z.object({
        titulo: z.string().min(3).max(512),
        orgao: z.string().max(256).optional(),
        modalidade: z.string().max(128).optional(),
        numeroProcesso: z.string().max(128).optional(),
        objeto: z.string().max(8000).optional(),
        valorEstimado: z.number().nonnegative().optional(),
        prazoEnvio: z.string().optional(), // yyyy-mm-dd
        risco: z.enum(["baixo", "medio", "alto"]).optional(),
        responsavel: z.string().max(128).optional(),
        observacoes: z.string().max(8000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const [res] = await db.insert(funilOportunidades).values({
        titulo: input.titulo,
        orgao: input.orgao,
        modalidade: input.modalidade,
        numeroProcesso: input.numeroProcesso,
        objeto: input.objeto,
        origemTipo: "manual",
        valorEstimado: input.valorEstimado != null ? String(input.valorEstimado) : undefined,
        prazoEnvio: input.prazoEnvio ? new Date(`${input.prazoEnvio}T12:00:00`) : undefined,
        risco: input.risco ?? "medio",
        responsavel: input.responsavel ?? ctx.user?.name ?? undefined,
        observacoes: input.observacoes,
      });
      const id = Number((res as any).insertId);
      await db.insert(funilEventos).values({
        oportunidadeId: id,
        deEtapa: null,
        paraEtapa: "nova",
        justificativa: "Criada manualmente",
        usuario: ctx.user?.name ?? ctx.user?.email ?? "sistema",
      });
      return { id };
    }),

  /** Cria oportunidade a partir de uma cotação recebida por e-mail. */
  criarDeCotacao: protectedProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      // Evita duplicar: reaproveita se já existir para esta cotação
      const [existente] = await db
        .select()
        .from(funilOportunidades)
        .where(
          and(
            eq(funilOportunidades.origemTipo, "email"),
            eq(funilOportunidades.origemId, input.quotationId),
          ),
        )
        .limit(1);
      if (existente) return { id: existente.id, jaExistia: true };

      const [q] = await db
        .select()
        .from(emailQuotations)
        .where(eq(emailQuotations.id, input.quotationId))
        .limit(1);
      if (!q) throw new Error("Cotação não encontrada");
      const [res] = await db.insert(funilOportunidades).values({
        titulo: q.orgao ?? q.subject ?? `Cotação #${q.id}`,
        orgao: q.orgao,
        objeto: q.subject,
        origemTipo: "email",
        origemId: q.id,
        prazoEnvio: q.prazoResposta ? new Date(q.prazoResposta) : undefined,
        etapa: "triagem",
        responsavel: ctx.user?.name ?? undefined,
      });
      const id = Number((res as any).insertId);
      await db.insert(funilEventos).values({
        oportunidadeId: id,
        deEtapa: null,
        paraEtapa: "triagem",
        justificativa: `Criada a partir da cotação por e-mail #${q.id}`,
        usuario: ctx.user?.name ?? ctx.user?.email ?? "sistema",
      });
      return { id, jaExistia: false };
    }),

  /** Cria oportunidade a partir de uma licitação do radar PNCP. */
  criarDeLicitacao: protectedProcedure
    .input(z.object({ licitacaoId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const [existente] = await db
        .select()
        .from(funilOportunidades)
        .where(
          and(
            eq(funilOportunidades.origemTipo, "pncp"),
            eq(funilOportunidades.origemId, input.licitacaoId),
          ),
        )
        .limit(1);
      if (existente) return { id: existente.id, jaExistia: true };

      const [lic] = await db
        .select()
        .from(licitacoes)
        .where(eq(licitacoes.id, input.licitacaoId))
        .limit(1);
      if (!lic) throw new Error("Licitação não encontrada");
      // Datas na tabela licitacoes são strings (formato da API) — valida antes
      const parseData = (s: string | null): Date | undefined => {
        if (!s) return undefined;
        const d = new Date(s);
        return isNaN(d.getTime()) ? undefined : d;
      };
      const [res] = await db.insert(funilOportunidades).values({
        titulo: `${lic.orgao ?? "Órgão"} — ${(lic.objeto ?? "").slice(0, 400)}`,
        orgao: lic.orgao?.slice(0, 256),
        modalidade: lic.modalidade,
        numeroProcesso: lic.numero ?? lic.externalId,
        objeto: lic.objeto,
        origemTipo: "pncp",
        origemId: lic.id,
        valorEstimado: lic.valorEstimado ?? undefined,
        dataAbertura: parseData(lic.dataAbertura),
        prazoEnvio: parseData(lic.dataEncerramento),
        etapa: "triagem",
        responsavel: ctx.user?.name ?? undefined,
      });
      const id = Number((res as any).insertId);
      await db.insert(funilEventos).values({
        oportunidadeId: id,
        deEtapa: null,
        paraEtapa: "triagem",
        justificativa: `Criada a partir do radar PNCP (licitação #${lic.id})`,
        usuario: ctx.user?.name ?? ctx.user?.email ?? "sistema",
      });
      return { id, jaExistia: false };
    }),

  /** Move a oportunidade de etapa, registrando o evento. */
  mover: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        paraEtapa: etapaSchema,
        justificativa: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const [op] = await db
        .select()
        .from(funilOportunidades)
        .where(eq(funilOportunidades.id, input.id))
        .limit(1);
      if (!op) throw new Error("Oportunidade não encontrada");
      if (op.etapa === input.paraEtapa) return { ok: true, semMudanca: true };

      await db
        .update(funilOportunidades)
        .set({ etapa: input.paraEtapa })
        .where(eq(funilOportunidades.id, input.id));
      await db.insert(funilEventos).values({
        oportunidadeId: input.id,
        deEtapa: op.etapa,
        paraEtapa: input.paraEtapa,
        justificativa: input.justificativa,
        usuario: ctx.user?.name ?? ctx.user?.email ?? "sistema",
      });
      return { ok: true, semMudanca: false };
    }),

  /** Atualiza campos gerais da oportunidade. */
  atualizar: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        titulo: z.string().min(3).max(512).optional(),
        orgao: z.string().max(256).optional(),
        modalidade: z.string().max(128).optional(),
        numeroProcesso: z.string().max(128).optional(),
        objeto: z.string().max(8000).optional(),
        valorEstimado: z.number().nonnegative().nullable().optional(),
        prazoEnvio: z.string().nullable().optional(),
        risco: z.enum(["baixo", "medio", "alto"]).optional(),
        responsavel: z.string().max(128).optional(),
        observacoes: z.string().max(8000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      const { id, valorEstimado, prazoEnvio, ...resto } = input;
      await db
        .update(funilOportunidades)
        .set({
          ...resto,
          ...(valorEstimado !== undefined
            ? { valorEstimado: valorEstimado != null ? String(valorEstimado) : null }
            : {}),
          ...(prazoEnvio !== undefined
            ? { prazoEnvio: prazoEnvio ? new Date(`${prazoEnvio}T12:00:00`) : null }
            : {}),
        })
        .where(eq(funilOportunidades.id, id));
      return { ok: true };
    }),

  /** Resumo para o dashboard: contagens por etapa + prazos críticos. */
  resumo: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { porEtapa: {} as Record<string, number>, abertas: 0, prazoCritico: 0 };
    const rows = await db.select().from(funilOportunidades);
    const porEtapa: Record<string, number> = {};
    let abertas = 0;
    let prazoCritico = 0;
    const hoje = new Date();
    for (const r of rows) {
      porEtapa[r.etapa] = (porEtapa[r.etapa] ?? 0) + 1;
      if (!ETAPAS_FINAIS.includes(r.etapa)) {
        abertas++;
        if (r.prazoEnvio) {
          const dias = (new Date(r.prazoEnvio).getTime() - hoje.getTime()) / 86400000;
          if (dias <= 3) prazoCritico++;
        }
      }
    }
    return { porEtapa, abertas, prazoCritico };
  }),
});

interface FunilCard {
  id: number;
  titulo: string;
  orgao: string | null;
  modalidade: string | null;
  numeroProcesso: string | null;
  valorEstimado: number | null;
  prazoEnvio: string | null;
  diasPrazo: number | null;
  risco: string;
  origemTipo: string;
}
