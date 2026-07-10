import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  supplierCredentials,
  supplierSessions,
  SupplierCredential,
  SupplierSession,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { credentialEncryptionService } from "../services/credentialEncryptionService";
import { supplierSessionService } from "../services/supplierSessionService";

export const supplierAuthRouter = router({
  /**
   * Store supplier credentials securely
   */
  storeCredentials: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        authType: z.enum(["username_password", "api_key", "oauth", "session_token"]),
        username: z.string().optional(),
        password: z.string().optional(),
        apiKey: z.string().optional(),
        sessionToken: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        let passwordEncrypted: string | null = null;
        let apiKeyEncrypted: string | null = null;
        let sessionTokenEncrypted: string | null = null;

        // Encrypt sensitive fields
        if (input.password) {
          passwordEncrypted = credentialEncryptionService.encrypt(input.password);
        }
        if (input.apiKey) {
          apiKeyEncrypted = credentialEncryptionService.encrypt(input.apiKey);
        }
        if (input.sessionToken) {
          sessionTokenEncrypted = credentialEncryptionService.encrypt(input.sessionToken);
        }

        // Check if credentials exist
        const existing = await db
          .select()
          .from(supplierCredentials)
          .where(eq(supplierCredentials.supplierId, input.supplierId))
          .limit(1);

        if (existing.length > 0) {
          // Update
          await db
            .update(supplierCredentials)
            .set({
              authType: input.authType,
              username: input.username,
              passwordEncrypted,
              apiKey: apiKeyEncrypted,
              sessionToken: sessionTokenEncrypted,
              notes: input.notes,
              updatedAt: new Date(),
            })
            .where(eq(supplierCredentials.supplierId, input.supplierId));
        } else {
          // Create
          await db.insert(supplierCredentials).values({
            supplierId: input.supplierId,
            authType: input.authType,
            username: input.username,
            passwordEncrypted,
            apiKey: apiKeyEncrypted,
            sessionToken: sessionTokenEncrypted,
            notes: input.notes,
          });
        }

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to store credentials: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Get decrypted credentials for a supplier
   */
  getCredentials: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        const creds = await db
          .select()
          .from(supplierCredentials)
          .where(eq(supplierCredentials.supplierId, input.supplierId))
          .limit(1);

        if (creds.length === 0) {
          return null;
        }

        const cred = creds[0];

        // Decrypt sensitive fields
        const decrypted: any = {
          id: cred.id,
          supplierId: cred.supplierId,
          authType: cred.authType,
          username: cred.username,
          notes: cred.notes,
          lastUsedAt: cred.lastUsedAt,
          createdAt: cred.createdAt,
          updatedAt: cred.updatedAt,
        };

        if (cred.passwordEncrypted) {
          try {
            decrypted.password = credentialEncryptionService.decrypt(cred.passwordEncrypted);
          } catch {
            decrypted.password = null;
          }
        }

        if (cred.apiKey) {
          try {
            decrypted.apiKey = credentialEncryptionService.decrypt(cred.apiKey);
          } catch {
            decrypted.apiKey = null;
          }
        }

        if (cred.sessionToken) {
          try {
            decrypted.sessionToken = credentialEncryptionService.decrypt(cred.sessionToken);
          } catch {
            decrypted.sessionToken = null;
          }
        }

        return decrypted;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get credentials: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Delete credentials for a supplier
   */
  deleteCredentials: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        await db
          .delete(supplierCredentials)
          .where(eq(supplierCredentials.supplierId, input.supplierId));

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete credentials: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Create or update a session
   */
  upsertSession: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
        cookies: z.record(z.string(), z.string()).optional(),
        sessionToken: z.string().optional(),
        authHeader: z.string().optional(),
        expiresAt: z.date().optional(),
        status: z.enum(["active", "expired", "invalid", "pending"]).default("active"),
      })
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
          input.status
        );

        return { success: true, sessionId: session.id };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to upsert session: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Get active session for a supplier
   */
  getActiveSession: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
      })
    )
    .query(async ({ input }) => {
      try {
        const session = await supplierSessionService.getActiveSession(input.supplierId);

        if (!session) {
          return null;
        }

        // Parse cookies
        const cookies = supplierSessionService.parseCookies(session) as Record<string, string>;

        return {
          id: session.id,
          supplierId: session.supplierId,
          cookies,
          sessionToken: session.sessionToken,
          authHeader: session.authHeader,
          status: session.status,
          expiresAt: session.expiresAt,
          lastAuthAt: session.lastAuthAt,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get session: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Invalidate session
   */
  invalidateSession: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await supplierSessionService.invalidateSession(input.supplierId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to invalidate session: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  /**
   * Generate new API key
   */
  generateApiKey: protectedProcedure.query(async () => {
    try {
      const apiKey = credentialEncryptionService.generateApiKey();
      return { apiKey };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to generate API key: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  /**
   * Generate new session token
   */
  generateSessionToken: protectedProcedure.query(async () => {
    try {
      const token = credentialEncryptionService.generateSessionToken();
      return { token };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to generate session token: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),
});
