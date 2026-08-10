import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { proposals } from "../../drizzle/schema";
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

async function lockProposal(tx: Transaction, proposalId: number) {
  await tx.execute(
    sql`SELECT ${proposals.id} FROM ${proposals} WHERE ${proposals.id} = ${proposalId} FOR UPDATE`,
  );
  const [proposal] = await tx
    .select({ id: proposals.id, status: proposals.status })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposta não encontrada." });
  return proposal;
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
  recipient: string;
  subject: string;
  actor: string;
}): Promise<ProposalEmailReservation> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });

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
            message: "O SMTP confirmou o envio, mas o Message-ID não foi persistido. Revisão manual necessária.",
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

    const token = randomUUID().replace(/-/g, "");
    const messageId = deterministicMessageId(input.proposalId, token);
    await tx.insert(proposalEmailDispatches).values({
      proposalId: input.proposalId,
      dispatchToken: token,
      recipient: input.recipient,
      subject: input.subject,
      state: "sending",
      requestedBy: input.actor.slice(0, 128),
    });

    return {
      mode: "send",
      proposalId: input.proposalId,
      token,
      recipient: input.recipient,
      subject: input.subject,
      messageId,
    };
  });
}

export async function markProposalSmtpAccepted(input: {
  proposalId: number;
  token: string;
  messageId: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
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
  const affected = Array.isArray(result) && result[0] && typeof result[0] === "object" && "affectedRows" in result[0]
    ? Number((result[0] as { affectedRows?: number }).affectedRows ?? 0)
    : 0;
  if (affected !== 1) {
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
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  await db
    .update(proposalEmailDispatches)
    .set({ state: "sent", completedAt: new Date(), lastError: null })
    .where(
      and(
        eq(proposalEmailDispatches.proposalId, input.proposalId),
        eq(proposalEmailDispatches.dispatchToken, input.token),
        eq(proposalEmailDispatches.state, "sent_pending_state"),
      ),
    );
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

export async function hasActiveProposalEmailDispatch(proposalId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ state: proposalEmailDispatches.state })
    .from(proposalEmailDispatches)
    .where(eq(proposalEmailDispatches.proposalId, proposalId))
    .limit(1);
  return Boolean(row);
}
