import { z } from "zod";
import { editorProcedure, router } from "../_core/trpc";
import {
  composeDeclarationsDocument,
  composeProposalDocument,
  composeQuotationDocument,
} from "../services/documentComposerService";

export const documentComposerRouter = router({
  generate: editorProcedure
    .input(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("proposal"), id: z.number().int().positive() }),
        z.object({
          type: z.literal("quotation"),
          id: z.number().int().positive(),
          marginPercent: z.number().min(0).max(99.99).optional(),
          validDays: z.number().int().min(1).max(365).optional(),
        }),
        z.object({ type: z.literal("declarations"), id: z.number().int().positive() }),
      ]),
    )
    .mutation(({ input }) => {
      if (input.type === "proposal") return composeProposalDocument(input.id);
      if (input.type === "declarations") return composeDeclarationsDocument(input.id);
      return composeQuotationDocument(input.id, {
        marginPercent: input.marginPercent,
        validDays: input.validDays,
      });
    }),
});
