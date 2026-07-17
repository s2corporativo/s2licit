import { z } from "zod";
import { protectedProcedure, editorProcedure, router } from "../_core/trpc";
import { createFinancialEntry, deleteFinancialEntry, getFinancialSummary, getFreightReport, getProposalFinancialStats, listFinancialEntries, updateFinancialEntry } from "../db";

export const financialRouter = router({
    list: protectedProcedure
      .input(z.object({
        type: z.enum(["income", "expense"]).optional(),
        isPaid: z.enum(["yes", "no"]).optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        proposalId: z.number().optional(),
      }).optional())
      .query(({ input }) => listFinancialEntries(input)),
    create: protectedProcedure
      .input(z.object({
        type: z.enum(["income", "expense"]),
        category: z.string().max(128).optional().nullable(),
        description: z.string().min(1).max(512),
        amount: z.string(),
        dueDate: z.date().optional().nullable(),
        paidAt: z.date().optional().nullable(),
        isPaid: z.enum(["yes", "no"]).default("no"),
        proposalId: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => createFinancialEntry(input as any)),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        type: z.enum(["income", "expense"]).optional(),
        category: z.string().max(128).optional().nullable(),
        description: z.string().max(512).optional(),
        amount: z.string().optional(),
        dueDate: z.date().optional().nullable(),
        paidAt: z.date().optional().nullable(),
        isPaid: z.enum(["yes", "no"]).optional(),
        proposalId: z.number().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return updateFinancialEntry(id, data as any);
      }),
    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteFinancialEntry(input.id)),
    summary: protectedProcedure
      .input(z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }).optional())
      .query(({ input }) => getFinancialSummary(input?.dateFrom, input?.dateTo)),
    proposalStats: protectedProcedure
      .query(() => getProposalFinancialStats()),
    freightReport: protectedProcedure
      .input(z.object({
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
      }).optional())
      .query(({ input }) => getFreightReport(input?.dateFrom, input?.dateTo)),
    createFromProposal: protectedProcedure
      .input(z.object({
        proposalId: z.number(),
        amount: z.string(),
        description: z.string(),
        isPaid: z.enum(["yes", "no"]).default("no"),
        notes: z.string().optional().nullable(),
      }))
      .mutation(({ input }) =>
        createFinancialEntry({
          type: "income",
          category: "Proposta Aprovada",
          description: input.description,
          amount: input.amount,
          isPaid: input.isPaid,
          proposalId: input.proposalId,
          notes: input.notes ?? null,
        } as any)
      ),
  });
