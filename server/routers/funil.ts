import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  ETAPAS_FUNIL,
  funilEventos,
  funilOportunidades,
  type EtapaFunil,
} from "../../drizzle/schema";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  decideOpportunity,
  ensureOpportunityFromLicitacao,
  ensureOpportunityFromQuotation,
  ensureOpportunityFromRadar,
  getAllowedTransitions,
  moveOpportunity,
  parseOpportunityDecision,
} from "../services/opportunityWorkflowService";

/**
 * Pipeline canônico da operação:
 * entrada → triagem → GO/NO-GO → análise → preço → proposta → disputa →
 * habilitação → contrato → entrega → faturamento → recebimento.
 */

const etapaSchema = z.enum(ETAPAS_FUNIL);

const radarOpportunitySchema = z.object({
  source: z.enum(["pncp", "comprasgov", "fiemg"]),
  sourceId: z.string().min(1).max(256),
  orgao: z.string().min(1).max(512),
  modalidade: z.string().max(128),
  numeroProcesso: z.string().max(128),
  objeto: z.string().min(1).max(20_000),
  descricaoDetalhada: z.string().max(20_000).optional(),
  uf: z.string().max(2).optional(),
  municipio: z.string().max(128).optional(),
  dataPublicacao: z.string().datetime({ offset: true }).nullable().optional(),
  dataAbertura: z.string().datetime({ offset: true }).nullable().optional(),
  dataEncerramento: z.string().datetime({ offset: true }).nullable().optional(),
  valorEstimado: z.number().nonnegative().optional(),
  status: z.string().max(64).optional(),
  links: z.array(z.string().max(2048)).max(10).optional(),
  dedupeKey: z.string().max(512).optional(),
});

/** Etapas encerradas, fora da carga operacional aberta. */
export const ETAPAS_FINAIS: EtapaFunil[] = ["perdida", "cancelada", "encerrada"];

export const funilRouter = router({
  kanban: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { etapas: ETAPAS_FUNIL, colunas: {} as Record<string, FunilCard[]> };

    const rows = await db
      .select()
      .from(funilOportunidades)
      .orderBy(desc(funilOportunidades.updatedAt))
      .limit(500);

    const colunas: Record<string, FunilCard[]> = {};
    for (const etapa of ETAPAS_FUNIL) colunas[etapa] = [];

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    for (const row of rows) {
      let diasPrazo: number | null = null;
      if (row.prazoEnvio) {
        const alvo = new Date(row.prazoEnvio);
        alvo.setHours(0, 0, 0, 0);
        diasPrazo = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
      }
      colunas[row.etapa]?.push({
        id: row.id,
        titulo: row.titulo,
        orgao: row.orgao,
        modalidade: row.modalidade,
        numeroProcesso: row.numeroProcesso,
        valorEstimado: row.valorEstimado ? Number(row.valorEstimado) : null,
        prazoEnvio: row.prazoEnvio ? new Date(row.prazoEnvio).toISOString() : null,
        diasPrazo,
        risco: row.risco,
        origemTipo: row.origemTipo,
      });
    }
    return { etapas: ETAPAS_FUNIL, colunas };
  }),

  detalhe: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [opportunity] = await db
        .select()
        .from(funilOportunidades)
        .where(eq(funilOportunidades.id, input.id))
        .limit(1);
      if (!opportunity) return null;

      const events = await db
        .select()
        .from(funilEventos)
        .where(eq(funilEventos.oportunidadeId, input.id))
        .orderBy(desc(funilEventos.createdAt));

      return {
        ...opportunity,
        eventos: events,
        decisao: parseOpportunityDecision(events),
        proximasEtapas: getAllowedTransitions(opportunity.etapa),
      };
    }),

  criar: editorProcedure
    .input(
      z.object({
        titulo: z.string().min(3).max(512),
        orgao: z.string().max(256).optional(),
        modalidade: z.string().max(128).optional(),
        numeroProcesso: z.string().max(128).optional(),
        objeto: z.string().max(8000).optional(),
        valorEstimado: z.number().nonnegative().optional(),
        prazoEnvio: z.string().optional(),
        risco: z.enum(["baixo", "medio", "alto"]).optional(),
        responsavel: z.string().max(128).optional(),
        observacoes: z.string().max(8000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");

      // Oportunidade e o evento de abertura numa transação: o histórico do
      // funil é reconstruído a partir de funil_eventos, então uma oportunidade
      // sem o evento inicial nasce com a linha do tempo furada.
      const id = await db.transaction(async (tx) => {
        const [result] = await tx.insert(funilOportunidades).values({
          titulo: input.titulo,
          orgao: input.orgao,
          modalidade: input.modalidade,
          numeroProcesso: input.numeroProcesso,
          objeto: input.objeto,
          origemTipo: "manual",
          valorEstimado: input.valorEstimado != null ? String(input.valorEstimado) : undefined,
          prazoEnvio: input.prazoEnvio ? new Date(`${input.prazoEnvio}T12:00:00`) : undefined,
          risco: input.risco ?? "medio",
          responsavel: input.responsavel ?? ctx.user.name ?? undefined,
          observacoes: input.observacoes,
        });
        const novoId = Number((result as { insertId?: number }).insertId);
        await tx.insert(funilEventos).values({
          oportunidadeId: novoId,
          deEtapa: null,
          paraEtapa: "nova",
          justificativa: "Criada manualmente",
          usuario: ctx.user.name ?? ctx.user.email ?? "sistema",
        });
        return novoId;
      });
      return { id };
    }),

  criarDeCotacao: editorProcedure
    .input(z.object({ quotationId: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      ensureOpportunityFromQuotation(input.quotationId, ctx.user),
    ),

  criarDeLicitacao: editorProcedure
    .input(z.object({ licitacaoId: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      ensureOpportunityFromLicitacao(input.licitacaoId, ctx.user),
    ),

  criarDeRadar: editorProcedure
    .input(radarOpportunitySchema)
    .mutation(({ input, ctx }) => ensureOpportunityFromRadar(input, ctx.user)),

  decidir: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        decisao: z.enum(["go", "no_go"]),
        justificativa: z.string().trim().min(5).max(2000),
      }),
    )
    .mutation(({ input, ctx }) =>
      decideOpportunity(input.id, input.decisao, input.justificativa, ctx.user),
    ),

  mover: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        paraEtapa: etapaSchema,
        justificativa: z.string().max(2000).optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      moveOpportunity(input.id, input.paraEtapa, input.justificativa, ctx.user),
    ),

  atualizar: editorProcedure
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

      const { id, valorEstimado, prazoEnvio, ...rest } = input;
      await db
        .update(funilOportunidades)
        .set({
          ...rest,
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

  resumo: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { porEtapa: {} as Record<string, number>, abertas: 0, prazoCritico: 0 };

    const rows = await db.select().from(funilOportunidades);
    const porEtapa: Record<string, number> = {};
    let abertas = 0;
    let prazoCritico = 0;
    const hoje = new Date();

    for (const row of rows) {
      porEtapa[row.etapa] = (porEtapa[row.etapa] ?? 0) + 1;
      if (!ETAPAS_FINAIS.includes(row.etapa)) {
        abertas += 1;
        if (row.prazoEnvio) {
          const dias = (new Date(row.prazoEnvio).getTime() - hoje.getTime()) / 86_400_000;
          if (dias <= 3) prazoCritico += 1;
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

