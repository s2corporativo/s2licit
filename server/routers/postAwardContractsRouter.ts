import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createPostAwardContract,
  getContractsDashboard,
  getPostAwardContract,
  listPostAwardContracts,
  registerContractMovement,
  registerContractReajuste,
  updatePostAwardContract,
} from "../services/postAwardContractsService";

const contractStatusSchema = z.enum(["draft", "active", "suspended", "expired", "closed"]);
const movementTypeSchema = z.enum(["empenho", "faturamento", "consumo", "reforco", "glosa", "outro"]);

export const postAwardContractsRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: contractStatusSchema.optional(),
      orgId: z.number().optional(),
      proposalId: z.number().optional(),
    }).default({}))
    .query(async ({ input }) => listPostAwardContracts(input)),

  getById: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .query(async ({ input }) => getPostAwardContract(input.contractId)),

  dashboard: protectedProcedure
    .input(z.object({}).default({}))
    .query(async () => getContractsDashboard()),

  create: protectedProcedure
    .input(z.object({
      proposalId: z.number().nullable().optional(),
      orgId: z.number().nullable().optional(),
      contractNumber: z.string().min(1),
      processNumber: z.string().nullable().optional(),
      editalNumber: z.string().nullable().optional(),
      objectDescription: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
      baseDate: z.string().nullable().optional(),
      valueGlobal: z.union([z.string(), z.number()]).nullable().optional(),
      saldoInicial: z.union([z.string(), z.number()]).nullable().optional(),
      saldoAtual: z.union([z.string(), z.number()]).nullable().optional(),
      reajusteIndex: z.string().nullable().optional(),
      gestor: z.string().nullable().optional(),
      fiscal: z.string().nullable().optional(),
      status: contractStatusSchema.optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => createPostAwardContract(input)),

  update: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      data: z.object({
        proposalId: z.number().nullable().optional(),
        orgId: z.number().nullable().optional(),
        contractNumber: z.string().min(1).optional(),
        processNumber: z.string().nullable().optional(),
        editalNumber: z.string().nullable().optional(),
        objectDescription: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        baseDate: z.string().nullable().optional(),
        valueGlobal: z.union([z.string(), z.number()]).nullable().optional(),
        saldoInicial: z.union([z.string(), z.number()]).nullable().optional(),
        saldoAtual: z.union([z.string(), z.number()]).nullable().optional(),
        reajusteIndex: z.string().nullable().optional(),
        gestor: z.string().nullable().optional(),
        fiscal: z.string().nullable().optional(),
        status: contractStatusSchema.optional(),
        notes: z.string().nullable().optional(),
      }),
    }))
    .mutation(async ({ input }) => updatePostAwardContract(input.contractId, input.data)),

  addMovement: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      movementType: movementTypeSchema,
      amount: z.union([z.string(), z.number()]),
      movementDate: z.string(),
      description: z.string().nullable().optional(),
      referenceNumber: z.string().nullable().optional(),
      createdByUserId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => registerContractMovement(input)),

  addReajuste: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      reajusteDate: z.string(),
      indexName: z.string().nullable().optional(),
      indexPercent: z.union([z.string(), z.number()]).nullable().optional(),
      previousValue: z.union([z.string(), z.number()]).nullable().optional(),
      updatedValue: z.union([z.string(), z.number()]).nullable().optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ input }) => registerContractReajuste(input)),
});
