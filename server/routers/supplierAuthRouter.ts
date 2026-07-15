import { adminProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { supplierCredentials } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { credentialEncryptionService } from "../services/credentialEncryptionService";
import { supplierSessionService } from "../services/supplierSessionService";

function internalError(operation: string, error: unknown): TRPCError {
  console.error(`[SupplierAuth] ${operation}:`, error);
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Não foi possível ${operation}.`,
  });
}

export const supplierAuthRouter = router({
  /**
   * Store supplier credentials securely. Campos sensíveis omitidos em uma
   * atualização preservam o valor atual em vez de apagá-lo.
   */
  storeCredentials: adminProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        authType: z.enum(["username_password", "api_key", "oauth", "session_token"]),
        username: z.string().optional(),
        password: z.string().optional(),
        apiKey: z.string().optional(),
        sessionToken: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        const existing = await db
          .select()
          .from(supplierCredentials)
          .where(eq(supplierCredentials.supplierId, input.supplierId))
          .limit(1);

        if (existing.length > 0) {
          const updateData: Record<string, unknown> = {
            authType: input.authType,
            updatedAt: new Date(),
          };

          if (input.username !== undefined) updateData.username = input.username;
          if (input.notes !== undefined) updateData.notes = input.notes;
          if (input.password !== undefined) {
            updateData.passwordEncrypted = input.password
              ? credentialEncryptionService.encrypt(input.password)
              : null;
          }
          if (input.apiKey !== undefined) {
            updateData.apiKey = input.apiKey
              ? credentialEncryptionService.encrypt(input.apiKey)
              : null;
          }
          if (input.sessionToken !== undefined) {
            updateData.sessionToken = input.sessionToken
              ? credentialEncryptionService.encrypt(input.sessionToken)
              : null;
          }

          await db
            .update(supplierCredentials)
            .set(updateData)
            .where(eq(supplierCredentials.supplierId, input.supplierId));
        } else {
          await db.insert(supplierCredentials).values({
            supplierId: input.supplierId,
            authType: input.authType,
            username: input.username,
            passwordEncrypted: input.password
              ? credentialEncryptionService.encrypt(input.password)
              : null,
            apiKey: input.apiKey ? credentialEncryptionService.encrypt(input.apiKey) : null,
            sessionToken: input.sessionToken
              ? credentialEncryptionService.encrypt(input.sessionToken)
              : null,
            notes: input.notes,
          });
        }

        return { success: true };
      } catch (error) {
        throw internalError("salvar as credenciais do fornecedor", error);
      }
    }),

  /**
   * Retorna somente metadados e indicadores. Senha, API key e token nunca são
   * descriptografados por uma rota HTTP/tRPC.
   */
  getCredentials: adminProcedure
    .input(z.object({ supplierId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        const rows = await db
          .select()
          .from(supplierCredentials)
          .where(eq(supplierCredentials.supplierId, input.supplierId))
          .limit(1);

        const cred = rows[0];
        if (!cred) return null;

        return {
          id: cred.id,
          supplierId: cred.supplierId,
          authType: cred.authType,
          username: cred.username,
          notes: cred.notes,
          hasPassword: Boolean(cred.passwordEncrypted),
          hasApiKey: Boolean(cred.apiKey),
          hasSessionToken: Boolean(cred.sessionToken),
          lastUsedAt: cred.lastUsedAt,
          createdAt: cred.createdAt,
          updatedAt: cred.updatedAt,
        };
      } catch (error) {
        throw internalError("consultar as credenciais do fornecedor", error);
      }
    }),

  deleteCredentials: adminProcedure
    .input(z.object({ supplierId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        await db
          .delete(supplierCredentials)
          .where(eq(supplierCredentials.supplierId, input.supplierId));
        return { success: true };
      } catch (error) {
        throw internalError("excluir as credenciais do fornecedor", error);
      }
    }),

  /** Sessões de fornecedor são dados administrativos e nunca são devolvidas. */
  upsertSession: adminProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        cookies: z.record(z.string(), z.string()).optional(),
        sessionToken: z.string().optional(),
        authHeader: z.string().optional(),
        expiresAt: z.date().optional(),
        status: z.enum(["active", "expired", "invalid", "pending"]).default("active"),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const session = await supplierSessionService.upsertSession(
          input.supplierId,
          {
            cookies: input.cookies,
            sessionToken: input.sessionToken,
            authHeader: input.authHeader,
            expiresAt: input.expiresAt,
          },
          input.status,
        );
        return { success: true, sessionId: session.id };
      } catch (error) {
        throw internalError("salvar a sessão do fornecedor", error);
      }
    }),

  /** Retorna apenas estado e validade, sem cookies, token ou Authorization. */
  getActiveSession: adminProcedure
    .input(z.object({ supplierId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        const session = await supplierSessionService.getActiveSession(input.supplierId);
        if (!session) return null;

        return {
          id: session.id,
          supplierId: session.supplierId,
          status: session.status,
          expiresAt: session.expiresAt,
          lastAuthAt: session.lastAuthAt,
          hasCookies: Boolean(session.cookies),
          hasSessionToken: Boolean(session.sessionToken),
          hasAuthHeader: Boolean(session.authHeader),
        };
      } catch (error) {
        throw internalError("consultar a sessão do fornecedor", error);
      }
    }),

  invalidateSession: adminProcedure
    .input(z.object({ supplierId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        await supplierSessionService.invalidateSession(input.supplierId);
        return { success: true };
      } catch (error) {
        throw internalError("invalidar a sessão do fornecedor", error);
      }
    }),

  /** Geração de segredo é alteração administrativa, não consulta de leitura. */
  generateApiKey: adminProcedure.mutation(() => ({
    apiKey: credentialEncryptionService.generateApiKey(),
  })),

  generateSessionToken: adminProcedure.mutation(() => ({
    token: credentialEncryptionService.generateSessionToken(),
  })),
});
