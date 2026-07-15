import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import {
  ETAPAS_FUNIL,
  emailQuotations,
  funilEventos,
  funilOportunidades,
  licitacoes,
  type EtapaFunil,
} from "../../drizzle/schema";
import { getDb } from "../db";

export type OpportunityActor = {
  name?: string | null;
  email?: string | null;
};

export type RadarOpportunityInput = {
  source: "pncp" | "comprasgov" | "fiemg";
  sourceId: string;
  orgao: string;
  modalidade: string;
  numeroProcesso: string;
  objeto: string;
  descricaoDetalhada?: string;
  uf?: string;
  municipio?: string;
  dataPublicacao?: string | null;
  dataAbertura?: string | null;
  dataEncerramento?: string | null;
  valorEstimado?: number;
  status?: string;
  links?: string[];
  dedupeKey?: string;
};

export type OpportunityDecision = {
  value: "go" | "no_go";
  reason: string;
  actor: string | null;
  createdAt: Date | string | null;
};

export type ReviewedEditalInput = {
  title: string;
  orgao?: string | null;
  modalidade?: string | null;
  numeroProcesso?: string | null;
  objeto?: string | null;
};

type DecisionEvent = {
  justificativa: string | null;
  usuario?: string | null;
  createdAt?: Date | string | null;
};

const DECISION_PATTERN = /^\[DECISAO:(GO|NO_GO)\]\s*([\s\S]*)$/;

export const OPPORTUNITY_TRANSITIONS: Record<EtapaFunil, readonly EtapaFunil[]> = {
  nova: ["triagem", "cancelada"],
  triagem: ["cancelada"],
  analise: ["cotacao", "precificacao", "perdida", "cancelada"],
  cotacao: ["precificacao", "perdida", "cancelada"],
  precificacao: ["proposta", "perdida", "cancelada"],
  proposta: ["enviada", "cancelada"],
  enviada: ["disputa", "perdida", "cancelada"],
  disputa: ["habilitacao", "vencida", "perdida", "cancelada"],
  habilitacao: ["vencida", "perdida", "cancelada"],
  vencida: ["contrato"],
  perdida: [],
  cancelada: [],
  contrato: ["entrega", "cancelada"],
  entrega: ["faturamento", "cancelada"],
  faturamento: ["recebimento"],
  recebimento: ["encerrada"],
  encerrada: [],
};

function actorLabel(actor: OpportunityActor): string {
  return actor.name?.trim() || actor.email?.trim() || "sistema";
}

function parseDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseOpportunityDecision(events: DecisionEvent[]): OpportunityDecision | null {
  for (const event of events) {
    const match = event.justificativa?.match(DECISION_PATTERN);
    if (!match) continue;
    return {
      value: match[1] === "GO" ? "go" : "no_go",
      reason: match[2].trim(),
      actor: event.usuario ?? null,
      createdAt: event.createdAt ?? null,
    };
  }
  return null;
}

export function getAllowedTransitions(etapa: EtapaFunil): readonly EtapaFunil[] {
  return OPPORTUNITY_TRANSITIONS[etapa] ?? [];
}

export function assertTransitionAllowed(from: EtapaFunil, to: EtapaFunil): void {
  if (from === to) return;
  if (!ETAPAS_FUNIL.includes(to) || !getAllowedTransitions(from).includes(to)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Movimentação inválida: ${from} → ${to}. Use a próxima etapa do fluxo.`,
    });
  }
}

async function createOpportunityFromStoredBid(
  licitacaoId: number,
  actor: OpportunityActor,
): Promise<{ id: number; jaExistia: boolean }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

  const [existingOpportunity] = await db
    .select()
    .from(funilOportunidades)
    .where(
      and(
        eq(funilOportunidades.origemTipo, "pncp"),
        eq(funilOportunidades.origemId, licitacaoId),
      ),
    )
    .limit(1);
  if (existingOpportunity) return { id: existingOpportunity.id, jaExistia: true };

  const [bid] = await db
    .select()
    .from(licitacoes)
    .where(eq(licitacoes.id, licitacaoId))
    .limit(1);
  if (!bid) throw new TRPCError({ code: "NOT_FOUND", message: "Licitação não encontrada" });

  const [result] = await db.insert(funilOportunidades).values({
    titulo: `${bid.orgao ?? "Órgão"} — ${(bid.objeto ?? bid.numero ?? bid.externalId).slice(0, 400)}`,
    orgao: bid.orgao?.slice(0, 256),
    modalidade: bid.modalidade?.slice(0, 128),
    numeroProcesso: bid.numero ?? bid.externalId,
    objeto: bid.objeto,
    origemTipo: "pncp",
    origemId: bid.id,
    valorEstimado: bid.valorEstimado ?? undefined,
    dataAbertura: parseDate(bid.dataAbertura),
    prazoEnvio: parseDate(bid.dataEncerramento),
    etapa: "triagem",
    responsavel: actor.name ?? undefined,
    observacoes: bid.link ? `Fonte: ${bid.fonte}. Portal: ${bid.link}` : `Fonte: ${bid.fonte}`,
  });
  const id = Number((result as { insertId?: number }).insertId);
  await db.insert(funilEventos).values({
    oportunidadeId: id,
    deEtapa: null,
    paraEtapa: "triagem",
    justificativa: `Criada a partir do Radar (${bid.fonte}:${bid.externalId})`,
    usuario: actorLabel(actor),
  });
  return { id, jaExistia: false };
}

export async function ensureOpportunityFromRadar(
  input: RadarOpportunityInput,
  actor: OpportunityActor,
): Promise<{ id: number; jaExistia: boolean; licitacaoId: number }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

  const [stored] = await db
    .select()
    .from(licitacoes)
    .where(and(eq(licitacoes.fonte, input.source), eq(licitacoes.externalId, input.sourceId)))
    .limit(1);

  const values = {
    fonte: input.source,
    externalId: input.sourceId,
    numero: input.numeroProcesso || input.sourceId,
    orgao: input.orgao,
    uf: input.uf || null,
    municipio: input.municipio || null,
    modalidade: input.modalidade,
    objeto: input.objeto,
    dataPublicacao: input.dataPublicacao || null,
    dataAbertura: input.dataAbertura || null,
    dataEncerramento: input.dataEncerramento || null,
    valorEstimado: input.valorEstimado && input.valorEstimado > 0
      ? String(input.valorEstimado)
      : null,
    status: input.status || "ativa",
    link: input.links?.[0] || null,
    rawData: input,
  };

  let licitacaoId: number;
  if (stored) {
    licitacaoId = stored.id;
    await db.update(licitacoes).set(values).where(eq(licitacoes.id, stored.id));
  } else {
    const [result] = await db.insert(licitacoes).values(values);
    licitacaoId = Number((result as { insertId?: number }).insertId);
  }

  const opportunity = await createOpportunityFromStoredBid(licitacaoId, actor);
  return { ...opportunity, licitacaoId };
}

export async function ensureOpportunityFromQuotation(
  quotationId: number,
  actor: OpportunityActor,
): Promise<{ id: number; jaExistia: boolean }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

  const [existing] = await db
    .select()
    .from(funilOportunidades)
    .where(
      and(
        eq(funilOportunidades.origemTipo, "email"),
        eq(funilOportunidades.origemId, quotationId),
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, jaExistia: true };

  const [quotation] = await db
    .select()
    .from(emailQuotations)
    .where(eq(emailQuotations.id, quotationId))
    .limit(1);
  if (!quotation) throw new TRPCError({ code: "NOT_FOUND", message: "Cotação não encontrada" });

  const [result] = await db.insert(funilOportunidades).values({
    titulo: quotation.orgao ?? quotation.subject ?? `Cotação #${quotation.id}`,
    orgao: quotation.orgao,
    objeto: quotation.subject,
    origemTipo: "email",
    origemId: quotation.id,
    prazoEnvio: quotation.prazoResposta ? new Date(quotation.prazoResposta) : undefined,
    etapa: "triagem",
    responsavel: actor.name ?? undefined,
  });
  const id = Number((result as { insertId?: number }).insertId);
  await db.insert(funilEventos).values({
    oportunidadeId: id,
    deEtapa: null,
    paraEtapa: "triagem",
    justificativa: `Criada a partir da cotação por e-mail #${quotation.id}`,
    usuario: actorLabel(actor),
  });
  return { id, jaExistia: false };
}

export async function ensureOpportunityFromLicitacao(
  licitacaoId: number,
  actor: OpportunityActor,
): Promise<{ id: number; jaExistia: boolean }> {
  return createOpportunityFromStoredBid(licitacaoId, actor);
}

export async function decideOpportunity(
  id: number,
  decision: "go" | "no_go",
  reason: string,
  actor: OpportunityActor,
): Promise<{ id: number; etapa: EtapaFunil; decision: OpportunityDecision }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

  const [opportunity] = await db
    .select()
    .from(funilOportunidades)
    .where(eq(funilOportunidades.id, id))
    .limit(1);
  if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada" });
  if (!["nova", "triagem"].includes(opportunity.etapa)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A decisão GO/NO-GO deve ocorrer durante a triagem.",
    });
  }

  const nextStage: EtapaFunil = decision === "go" ? "analise" : "cancelada";
  const marker = decision === "go" ? "GO" : "NO_GO";
  const user = actorLabel(actor);
  await db.update(funilOportunidades).set({ etapa: nextStage }).where(eq(funilOportunidades.id, id));
  await db.insert(funilEventos).values({
    oportunidadeId: id,
    deEtapa: opportunity.etapa,
    paraEtapa: nextStage,
    justificativa: `[DECISAO:${marker}] ${reason.trim()}`,
    usuario: user,
  });

  return {
    id,
    etapa: nextStage,
    decision: { value: decision, reason: reason.trim(), actor: user, createdAt: new Date() },
  };
}

export async function moveOpportunity(
  id: number,
  to: EtapaFunil,
  reason: string | undefined,
  actor: OpportunityActor,
): Promise<{ ok: true; semMudanca: boolean }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

  const [opportunity] = await db
    .select()
    .from(funilOportunidades)
    .where(eq(funilOportunidades.id, id))
    .limit(1);
  if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada" });
  if (opportunity.etapa === to) return { ok: true, semMudanca: true };

  assertTransitionAllowed(opportunity.etapa, to);
  await db.update(funilOportunidades).set({ etapa: to }).where(eq(funilOportunidades.id, id));
  await db.insert(funilEventos).values({
    oportunidadeId: id,
    deEtapa: opportunity.etapa,
    paraEtapa: to,
    justificativa: reason,
    usuario: actorLabel(actor),
  });
  return { ok: true, semMudanca: false };
}

/**
 * Confere o GO e posiciona a oportunidade na precificação antes da criação da
 * proposta. Se qualquer etapa posterior falhar, o card continua visível para
 * retomada, em vez de gerar uma proposta sem origem operacional.
 */
export async function prepareOpportunityForProposal(
  id: number,
  actor: OpportunityActor,
): Promise<{ id: number; etapa: "precificacao" }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

  const [opportunity] = await db
    .select()
    .from(funilOportunidades)
    .where(eq(funilOportunidades.id, id))
    .limit(1);
  if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada" });

  const decision = await getOpportunityDecision(id);
  if (decision?.value !== "go") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Registre a decisão GO no Funil antes de criar a proposta.",
    });
  }
  if (!["analise", "cotacao", "precificacao"].includes(opportunity.etapa)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `A oportunidade está em ${opportunity.etapa}; a proposta só pode nascer após análise e precificação.`,
    });
  }

  if (opportunity.etapa !== "precificacao") {
    await moveOpportunity(id, "precificacao", "Análise e custos revisados para montar a proposta", actor);
  }
  return { id, etapa: "precificacao" };
}

/** Cria rastreabilidade para o uso direto do analisador de edital. */
export async function createOpportunityFromReviewedEdital(
  input: ReviewedEditalInput,
  actor: OpportunityActor,
): Promise<{ id: number; etapa: "precificacao" }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
  const user = actorLabel(actor);

  const [result] = await db.insert(funilOportunidades).values({
    titulo: input.title.slice(0, 512),
    orgao: input.orgao?.slice(0, 256),
    modalidade: input.modalidade?.slice(0, 128),
    numeroProcesso: input.numeroProcesso?.slice(0, 128),
    objeto: input.objeto,
    origemTipo: "edital",
    etapa: "precificacao",
    responsavel: actor.name ?? undefined,
  });
  const id = Number((result as { insertId?: number }).insertId);
  await db.insert(funilEventos).values([
    {
      oportunidadeId: id,
      deEtapa: null,
      paraEtapa: "triagem",
      justificativa: "Criada a partir da revisão direta de edital",
      usuario: user,
    },
    {
      oportunidadeId: id,
      deEtapa: "triagem",
      paraEtapa: "analise",
      justificativa: "[DECISAO:GO] Edital, matches, quantidades e custos revisados pelo operador",
      usuario: user,
    },
    {
      oportunidadeId: id,
      deEtapa: "analise",
      paraEtapa: "precificacao",
      justificativa: "Itens e custos prontos para proposta",
      usuario: user,
    },
  ]);
  return { id, etapa: "precificacao" };
}

export async function finalizeOpportunityProposal(
  id: number,
  proposalId: number,
  actor: OpportunityActor,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
  const [opportunity] = await db
    .select()
    .from(funilOportunidades)
    .where(eq(funilOportunidades.id, id))
    .limit(1);
  if (!opportunity) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada" });

  if (opportunity.origemTipo === "edital" && opportunity.origemId == null) {
    await db
      .update(funilOportunidades)
      .set({ origemId: proposalId })
      .where(eq(funilOportunidades.id, id));
  }
  await moveOpportunity(id, "proposta", `Proposta #${proposalId} criada`, actor);
}

export async function getOpportunityDecision(id: number): Promise<OpportunityDecision | null> {
  const db = await getDb();
  if (!db) return null;
  const events = await db
    .select({
      justificativa: funilEventos.justificativa,
      usuario: funilEventos.usuario,
      createdAt: funilEventos.createdAt,
    })
    .from(funilEventos)
    .where(eq(funilEventos.oportunidadeId, id))
    .orderBy(desc(funilEventos.createdAt));
  return parseOpportunityDecision(events);
}
