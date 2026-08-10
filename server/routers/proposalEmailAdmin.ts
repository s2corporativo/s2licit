import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { recordAudit } from "../services/auditService";
import {
  markProposalEmailDispatchCompleted,
  reserveProposalEmailDispatch,
  resolveAmbiguousProposalEmailDispatch,
} from "../services/proposalEmailDispatchService";
import { advanceProposalLifecycle } from "../services/proposalLifecycleService";

function actorLabel(user: { name?: string | null; email?: string | null }): string {
  return user.name?.trim() || user.email?.trim() || "admin";
}

export const proposalEmailAdminRouter = router({
  resolveAmbiguous: adminProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        resolution: z.enum(["confirmed_sent", "confirmed_not_sent"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const actor = actorLabel(ctx.user);
      const resolution = await resolveAmbiguousProposalEmailDispatch({
        proposalId: input.proposalId,
        resolution: input.resolution,
        actor,
      });

      if (input.resolution === "confirmed_sent") {
        // A resolução muda apenas o ledger para sent_pending_state. O mesmo
        // lifecycle normal finaliza o status sem tocar novamente no SMTP.
        const reservation = await reserveProposalEmailDispatch({
          proposalId: input.proposalId,
          actor,
        });
        if (reservation.mode === "resume") {
          await advanceProposalLifecycle({
            id: input.proposalId,
            newStatus: "sent",
            notes: "Envio confirmado manualmente após verificação do despacho SMTP",
            actor,
          });
          await markProposalEmailDispatchCompleted({
            proposalId: input.proposalId,
            token: reservation.token,
          });
        }
      }

      await recordAudit({
        userId: ctx.user.id,
        action: "proposal_email_dispatch_resolution",
        entity: "proposals",
        entityId: input.proposalId,
        origin: "admin",
        summary:
          input.resolution === "confirmed_sent"
            ? "Despacho SMTP ambíguo confirmado como enviado"
            : "Despacho SMTP ambíguo confirmado como não enviado; proposta liberada para nova tentativa",
        changes: {
          resolution: input.resolution,
          messageId: resolution.messageId,
        },
      });

      return { ok: true as const, ...resolution };
    }),
});
