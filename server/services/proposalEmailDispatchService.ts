import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { proposals, requestingOrgs } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  proposalEmailDispatches,
  type ProposalEmailDispatchState,
} from "../db/proposalEmailDispatches";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ProposalEmailReservation =
  | {
      mode: "send";
      proposalId: number;
      token: string;
      recipient: string;
      subject: string;
      messageId: string;
    }
  | {
      mode: "resume";
      proposalId: number;
      token: string;
      recipient: string;
      subject: string;
      messageId: string;
    }
  | {
      mode: "already_sent";
      proposalId: number;
      recipient: string | null;
      messageId: string | null;
    };

function deterministicMessageId(proposalId: number, token: string): string {
  return `<s2-proposal-${proposalId}-${token}@s2licit.local>`;
}

function affectedRows(result: unknown): number {
  if (Array.isArray(result)) {
    const first = result[0];
    if (first && typeof first === "object" && "affectedRows" in first) {
      return Number((first as { affectedRows?: number }).affectedRows ?? 0);
    }
  }
  return 0;
}

async function lockProposal(tx: Transaction, proposalId: number) {
  await tx.execute(
    sql`SELECT ${proposals.id} FROM ${proposals} WHERE ${proposals.id} = ${proposalId} FOR UPDATE`,
  );
  const [proposal] = await tx
    .select({
      id: proposals.id,
      status: proposals.status,
      title: proposals.title,
      orgId: proposals.orgId,
    })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!proposal) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada." });
  }
  return proposal;
}

async function resolveRecipient(
  tx: Transaction,
  orgId: number | null,
  explicitRecipient?: string,
): Promise<string> {
  const explicit = explicitRecipient?.trim();
  if (explicit) return explicit;
  if (!orgId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o e-mail do destinatário." });
  }
  const [org] = await tx
    .select({ email: requestingOrgs.email })
    .from(requestingOrgs)
    .where(eq(requestingOrgs.id, orgId))
    .limit(1);
  const email = org?.email?.trim();
  if (!email) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Informe o e-mail do destinatário; o órgão vinculado não possui e-mail cadastrado.",
    });
  }
  return email;
}

function assertKnownState(state: string): asserts state is ProposalEmailDispatchState {
  if (!["sending", "sent_pending_state", "sent", "ambiguous"].includes(state)) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Estado de despacho de e-mail desconhecido: ${state}.`,
    });
  }
}

export async function reserveProposalEmailDispatch(input: {
  proposalId: number;
  recipient?: string;
  subject?: string;
  actor: string;
}): Promise<ProposalEmailReservation> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  }

  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);
    const [existing] = await tx
      .select()
      .from(proposalEmailDispatches)
      .where(eq(proposalEmailDispatches.proposalId, input.proposalId))
      .limit(1);

    if (existing) {
      assertKnownState(existing.state);
      if (existing.state === "sent") {
        return {
          mode: "already_sent",
          proposalId: input.proposalId,
          recipient: existing.recipient,
          messageId: existing.messageId,
        };
      }
      if (existing.state === "sent_pending_state") {
        if (!existing.messageId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "O envio foi confirmado, mas o Message-ID não está disponível. Revisão manual necessária.",
          });
        }
        return {
          mode: "resume",
          proposalId: input.proposalId,
          token: existing.dispatchToken,
          recipient: existing.recipient,
          subject: existing.subject,
          messageId: existing.messageId,
        };
      }
      throw new TRPCError({
        code: "CONFLICT",
        message:
          existing.state === "ambiguous"
            ? "O resultado do envio anterior é ambíguo. Verifique a caixa de enviados antes de qualquer nova tentativa."
            : "Já existe um envio desta proposta em andamento. Aguarde ou verifique o estado do despacho.",
      });
    }

    if (proposal.status !== "draft") {
      if (proposal.status === "sent") {
        return {
          mode: "already_sent",
          proposalId: input.proposalId,
          recipient: null,
          messageId: null,
        };
      }
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `A proposta está em ${proposal.status} e não pode iniciar um novo envio.`,
      });
    }

    const recipient = await resolveRecipient(tx, proposal.orgId, input.recipient);
    const subject = input.subject?.trim() || `Proposta comercial - ${proposal.title}`;
    const token = randomUUID().replace(/-/g, "");
    const messageId = deterministicMessageId(input.proposalId, token);

    await tx.insert(proposalEmailDispatches).values({
      proposalId: input.proposalId,
      dispatchToken: token,
      recipient,
      subject,
      state: "sending",
      messageId,
      requestedBy: input.actor.slice(0, 128),
    });

    return {
      mode: "send",
      proposalId: input.proposalId,
      token,
      recipient,
      subject,
      messageId,
    };
  });
}

/** Libera apenas falha anterior à chamada SMTP; nenhum efeito externo ocorreu. */
export async function releaseProposalEmailDispatchReservation(input: {
  proposalId: number;
  token: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(proposalEmailDispatches)
    .where(
      and(
        eq(proposalEmailDispatches.proposalId, input.proposalId),
        eq(proposalEmailDispatches.dispatchToken, input.token),
        eq(proposalEmailDispatches.state, "sending"),
      ),
    );
}

export async function markProposalSmtpAccepted(input: {
  proposalId: number;
  token: string;
  messageId: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  }
  const result = await db
    .update(proposalEmailDispatches)
    .set({
      state: "sent_pending_state",
      messageId: input.messageId,
      smtpAcceptedAt: new Date(),
      lastError: null,
    })
    .where(
      and(
        eq(proposalEmailDispatches.proposalId, input.proposalId),
        eq(proposalEmailDispatches.dispatchToken, input.token),
        eq(proposalEmailDispatches.state, "sending"),
      ),
    );
  if (affectedRows(result) !== 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "O estado do despacho mudou antes de registrar a confirmação SMTP.",
    });
  }
}

export async function markProposalEmailDispatchCompleted(input: {
  proposalId: number;
  token: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  }
  const result = await db
    .update(proposalEmailDispatches)
    .set({ state: "sent", completedAt: new Date(), lastError: null })
    .where(
      and(
        eq(proposalEmailDispatches.proposalId, input.proposalId),
        eq(proposalEmailDispatches.dispatchToken, input.token),
        eq(proposalEmailDispatches.state, "sent_pending_state"),
      ),
    );
  if (affectedRows(result) !== 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "O despacho SMTP foi aceito, mas o ledger não pôde ser concluído.",
    });
  }
}

export async function markProposalEmailDispatchAmbiguous(input: {
  proposalId: number;
  token: string;
  error: unknown;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  await db
    .update(proposalEmailDispatches)
    .set({ state: "ambiguous", lastError: message.slice(0, 4000) })
    .where(
      and(
        eq(proposalEmailDispatches.proposalId, input.proposalId),
        eq(proposalEmailDispatches.dispatchToken, input.token),
        eq(proposalEmailDispatches.state, "sending"),
      ),
    );
}

/**
 * Única válvula manual para estado externo ambíguo. Exige decisão explícita do
 * administrador após conferir a caixa de enviados/provedor SMTP.
 */
export async function resolveAmbiguousProposalEmailDispatch(input: {
  proposalId: number;
  resolution: "confirmed_sent" | "confirmed_not_sent";
  actor: string;
}): Promise<{ resolution: typeof input.resolution; messageId: string | null }> {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  }

  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);
    const [dispatch] = await tx
      .select()
      .from(proposalEmailDispatches)
      .where(eq(proposalEmailDispatches.proposalId, input.proposalId))
      .limit(1);
    if (!dispatch) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Despacho de e-mail não encontrado." });
    }
    assertKnownState(dispatch.state);
    if (dispatch.state !== "ambiguous" && dispatch.state !== "sending") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Despacho em estado ${dispatch.state} não requer resolução manual.`,
      });
    }

    if (input.resolution === "confirmed_not_sent") {
      if (proposal.status !== "draft") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A proposta já avançou de status; não é seguro liberar um novo envio.",
        });
      }
      await tx
        .delete(proposalEmailDispatches)
        .where(eq(proposalEmailDispatches.proposalId, input.proposalId));
      return { resolution: input.resolution, messageId: dispatch.messageId };
    }

    const messageId = dispatch.messageId || deterministicMessageId(input.proposalId, dispatch.dispatchToken);
    await tx
      .update(proposalEmailDispatches)
      .set({
        state: "sent_pending_state",
        messageId,
        lastError: `Envio confirmado manualmente por ${input.actor.slice(0, 128)}.`,
      })
      .where(eq(proposalEmailDispatches.proposalId, input.proposalId));
    return { resolution: input.resolution, messageId };
  });
}

export async function getProposalEmailDispatch(proposalId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      proposalId: proposalEmailDispatches.proposalId,
      recipient: proposalEmailDispatches.recipient,
      state: proposalEmailDispatches.state,
      messageId: proposalEmailDispatches.messageId,
      smtpAcceptedAt: proposalEmailDispatches.smtpAcceptedAt,
      completedAt: proposalEmailDispatches.completedAt,
      lastError: proposalEmailDispatches.lastError,
      updatedAt: proposalEmailDispatches.updatedAt,
    })
    .from(proposalEmailDispatches)
    .where(eq(proposalEmailDispatches.proposalId, proposalId))
    .limit(1);
  return row ?? null;
}
