import { z } from "zod";
import { editorProcedure, router } from "../_core/trpc";
import { recordAudit } from "../services/auditService";
import { createProposalFromReviewedEdital } from "../services/editalProposalService";
import { editalRouter as legacyEditalRouter } from "./edital";

const createProposalInput = z.object({
  processo: z.object({
    numero: z.string().trim().min(1).max(128),
    modalidade: z.string().trim().min(1).max(128),
    orgao: z.string().trim().min(1).max(256),
    objeto: z.string().max(20_000),
  }),
  marginPercent: z.number().min(0).max(99.99).default(30),
  reviewConfirmed: z.literal(true),
  templateId: z.number().int().positive().optional(),
  itens: z
    .array(
      z.object({
        itemNumero: z.number().int().positive(),
        itemDescricao: z.string().trim().min(1).max(4000),
        itemUnidade: z.string().trim().min(1).max(64),
        itemQuantidade: z.number().positive(),
        productId: z.number().int().positive().nullable(),
        productName: z.string().max(512).nullable(),
        productPrice: z.string().max(32).nullable(),
        productSupplier: z.string().max(256).nullable(),
        productConcentration: z.string().max(128).nullable(),
        productPresentation: z.string().max(256).nullable(),
        itemPrecoUnitario: z.number().nonnegative().nullable().optional(),
        itemPrecoTotal: z.number().nonnegative().nullable().optional(),
      }),
    )
    .min(1)
    .max(1000),
});

function actorLabel(user: { name?: string | null; email?: string | null }): string {
  return user.name?.trim() || user.email?.trim() || "sistema";
}

/**
 * Strangler facade: reaproveita o leitor/matcher legado, mas substitui a etapa
 * de escrita crítica por um serviço transacional e em lote. Quando o leitor V2
 * estiver concluído, este facade poderá substituir o router legado integralmente.
 */
export const editalCanonicalRouter = router({
  extract: legacyEditalRouter.extract,
  matchCatalog: legacyEditalRouter.matchCatalog,
  validateItems: legacyEditalRouter.validateItems,

  createProposal: editorProcedure
    .input(createProposalInput)
    .mutation(async ({ input, ctx }) => {
      const result = await createProposalFromReviewedEdital({
        processo: input.processo,
        marginPercent: input.marginPercent,
        templateId: input.templateId,
        itens: input.itens,
        actor: actorLabel(ctx.user),
      });

      await recordAudit({
        userId: ctx.user.id,
        action: result.reusedProposal ? "edital_proposal_reused" : "edital_proposal_create",
        entity: "proposals",
        entityId: result.proposalId,
        origin: "edital",
        summary: result.reusedProposal
          ? `Proposta existente reutilizada para ${input.processo.numero}`
          : `Proposta criada em lote a partir do edital ${input.processo.numero}`,
        changes: {
          opportunityId: result.opportunityId,
          addedCount: result.addedCount,
          reusedOpportunity: result.reusedOpportunity,
          reusedProposal: result.reusedProposal,
        },
      });
      return result;
    }),
});
