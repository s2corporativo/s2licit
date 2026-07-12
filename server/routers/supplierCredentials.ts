import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { SupplierCredentialsService } from "../services/supplierCredentialsService";
import { TRPCError } from "@trpc/server";

// ─── Schemas ──────────────────────────────────────────────────────────────

const createCredentialSchema = z.object({
  supplierId: z.number(),
  scraperType: z.string(),
  email: z.string().email(),
  password: z.string().min(1),
  scheduleTime: z.string().optional(),
});

const updateCredentialSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  scheduleTime: z.string().optional(),
  enabled: z.boolean().optional(),
});

const deleteCredentialSchema = z.object({ id: z.number() });

const testConnectionSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const getCredentialSchema = z.object({ id: z.number() });

const getCredentialBySupplierSchema = z.object({ supplierId: z.number() });

// ─── Router ───────────────────────────────────────────────────────────────

export const supplierCredentialsRouter = router({
  /**
   * List all supplier credentials (admin only)
   */
  listCredentials: adminProcedure.query(async () => {
    try {
      const credentials = await SupplierCredentialsService.listCredentials();
      return credentials;
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Falha ao listar credenciais: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }),

  /**
   * Get credential by ID (admin only)
   */
  getCredential: adminProcedure
    .input(getCredentialSchema)
    .query(async ({ input }: { input: z.infer<typeof getCredentialSchema> }) => {
      try {
        const credential = await SupplierCredentialsService.getCredentialById(input.id);
        if (!credential) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Credencial não encontrada",
          });
        }
        return credential;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao obter credencial: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Get credential by supplier ID (admin only)
   */
  getCredentialBySupplier: adminProcedure
    .input(getCredentialBySupplierSchema)
    .query(async ({ input }: { input: z.infer<typeof getCredentialBySupplierSchema> }) => {
      try {
        const credential = await SupplierCredentialsService.getCredentialBySupplier(input.supplierId);
        return credential;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao obter credencial: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Create new supplier credential (admin only)
   */
  createCredential: adminProcedure
    .input(createCredentialSchema)
    .mutation(async ({ input }: { input: z.infer<typeof createCredentialSchema> }) => {
      try {
        const credential = await SupplierCredentialsService.createCredential({
          supplierId: input.supplierId,
          scraperType: input.scraperType,
          email: input.email,
          password: input.password,
          scheduleTime: input.scheduleTime,
        });
        return credential;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao criar credencial: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Update supplier credential (admin only)
   */
  updateCredential: adminProcedure
    .input(updateCredentialSchema)
    .mutation(async ({ input }: { input: z.infer<typeof updateCredentialSchema> }) => {
      try {
        const credential = await SupplierCredentialsService.updateCredential({
          id: input.id,
          email: input.email,
          password: input.password,
          scheduleTime: input.scheduleTime,
          enabled: input.enabled,
        });
        return credential;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao atualizar credencial: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Delete supplier credential (admin only)
   */
  deleteCredential: adminProcedure
    .input(deleteCredentialSchema)
    .mutation(async ({ input }: { input: z.infer<typeof deleteCredentialSchema> }) => {
      try {
        await SupplierCredentialsService.deleteCredential(input.id);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao deletar credencial: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Test connection to supplier website
   */
  testConnection: adminProcedure
    .input(testConnectionSchema)
    .mutation(async ({ input }: { input: z.infer<typeof testConnectionSchema> }) => {
      try {
        const result = await SupplierCredentialsService.testConnection(input.email, input.password);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao testar conexão: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),
});
