import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  ETAPAS_FUNIL,
  funilEventos,
  funilOportunidades,
  type EtapaFunil,
} from "../../drizzle/schema";
import { getDb } from "../db";

export const MACRO_ETAPAS = ["entrada", "analise", "proposta", "execucao", "concluida"] as const;
export type MacroEtapa = (typeof MACRO_ETAPAS)[number];

export const FINAL_STAGES = new Set<EtapaFunil>(["perdida", "cancelada", "encerrada"]);
export const ENTRY_STAGES = new Set<EtapaFunil>(["nova", "triagem"]);

export const STAGE_RANK: Readonly<Record<EtapaFunil, number>> = Object.freeze({
  nova: 0,
  triagem: 1,
  analise: 2,
  cotacao: 3,
  precificacao: 4,
  proposta: 5,
  enviada: 6,
  disputa: 7,
  habilitacao: 8,
  vencida: 9,
  contrato: 10,
  entrega: 11,
  faturamento: 12,
  recebimento: 13,
  encerrada: 14,
  perdida: 14,
  cancelada: 14,
});

export const OPPORTUNITY_TRANSITIONS: Readonly<Record<EtapaFunil, readonly EtapaFunil[]>> = Object.freeze({
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
});

const EVIDENCE_MIN_SOURCE: Partial<Record<EtapaFunil, EtapaFunil>> = Object.freeze({
  enviada: "proposta",
  contrato: "enviada",
  entrega: "contrato",
  faturamento: "contrato",
  recebimento: "faturamento",
  encerrada: "recebimento",
});

export function macroEtapa(etapa: EtapaFunil): MacroEtapa {
  switch (etapa) {
    case "nova":
    case "triagem":
      return "entrada";
    case "analise":
    case "cotacao":
    case "precificacao":
      return "analise";
    case "proposta":
    case "enviada":
    case "disputa":
    case "habilitacao":
      return "proposta";
    case "vencida":
    case "contrato":
    case "entrega":
    case "faturamento":
    case "recebimento":
      return "execucao";
    case "encerrada":
    case "perdida":
    case "cancelada":
      return "concluida";
  }
}

export function nextActionForStage(etapa: EtapaFunil): { code: string; label: string } | null {
  switch (etapa) {
    case "nova":
    case "triagem":
      return { code: "decidir", label: "Decidir GO / NO-GO" };
    case "analise":
      return { code: "analisar", label: "Analisar documentos e exigências" };
    case "cotacao":
      return { code: "cotacao", label: "Conferir custos e equivalências" };
    case "precificacao":
      return { code: "precificar", label: "Validar preço e margem" };
    case "proposta":
      return { code: "proposta", label: "Concluir proposta" };
    case "enviada":
      return { code: "sessao", label: "Acompanhar sessão / resultado" };
    case "disputa":
      return { code: "resultado", label: "Registrar resultado" };
    case "habilitacao":
      return { code: "habilitacao", label: "Concluir habilitação" };
    case "vencida":
      return { code: "contrato", label: "Registrar contrato / empenho" };
    case "contrato":
      return { code: "pedido", label: "Preparar compra e execução" };
    case "entrega":
      return { code: "entrega", label: "Acompanhar entrega" };
    case "faturamento":
      return { code: "faturamento", label: "Emitir ou acompanhar faturamento" };
    case "recebimento":
      return { code: "recebimento", label: "Confirmar recebimento e encerrar" };
    case "encerrada":
    case "perdida":
    case "cancelada":
      return null;
  }
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

/**
 * Regra única para evidências downstream inferidas de proposta/pedido/entrega/NF.
 * Pode condensar etapas quando existe um fato operacional forte, mas exige que
 * a oportunidade já tenha alcançado a fase mínima que torna aquela evidência
 * coerente. Assim um pedido manual nunca salta "análise" → "entrega".
 */
export function canEvidenceAdvance(from: EtapaFunil, to: EtapaFunil): boolean {
  if (FINAL_STAGES.has(from) || from === to) return false;
  if (to !== "perdida" && to !== "cancelada" && STAGE_RANK[to] <= STAGE_RANK[from]) return false;

  const minimumSource = EVIDENCE_MIN_SOURCE[to];
  if (minimumSource && STAGE_RANK[from] < STAGE_RANK[minimumSource]) return false;

  // Entrada nunca é ultrapassada por inferência; GO/NO-GO precisa existir.
  if (
    ENTRY_STAGES.has(from) &&
    to !== "perdida" &&
    to !== "cancelada" &&
    STAGE_RANK[to] > STAGE_RANK.analise
  ) {
    return false;
  }
  return true;
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function affectedRows(result: unknown): number {
  if (Array.isArray(result)) {
    const first = result[0];
    if (first && typeof first === "object" && "affectedRows" in first) {
      return Number((first as { affectedRows?: number }).affectedRows ?? 0);
    }
  }
  if (result && typeof result === "object" && "affectedRows" in result) {
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  }
  return 0;
}

export type AtomicTransitionInput = {
  opportunityId: number;
  from: EtapaFunil;
  to: EtapaFunil;
  reason?: string | null;
  actor: string;
};

export async function transitionOpportunityInTransaction(
  tx: Transaction,
  input: AtomicTransitionInput,
): Promise<boolean> {
  if (input.from === input.to) return false;

  const result = await tx
    .update(funilOportunidades)
    .set({ etapa: input.to })
    .where(
      and(
        eq(funilOportunidades.id, input.opportunityId),
        eq(funilOportunidades.etapa, input.from),
      ),
    );

  if (affectedRows(result) !== 1) return false;

  await tx.insert(funilEventos).values({
    oportunidadeId: input.opportunityId,
    deEtapa: input.from,
    paraEtapa: input.to,
    justificativa: input.reason ?? null,
    usuario: input.actor,
  });
  return true;
}

export async function transitionOpportunityAtomic(input: AtomicTransitionInput): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
  }
  return db.transaction((tx) => transitionOpportunityInTransaction(tx, input));
}
