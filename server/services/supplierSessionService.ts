import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { supplierSessions, type SupplierSession } from "../../drizzle/schema";
import { credentialEncryptionService } from "./credentialEncryptionService";

export interface SessionData {
  cookies?: Record<string, string>;
  /** Pares chave→valor do localStorage (SPAs guardam o token aqui, não em cookie). */
  localStorage?: Record<string, string>;
  sessionToken?: string;
  authHeader?: string;
  expiresAt?: Date;
}

const ENCRYPTED_PREFIX = "enc:v1:";

/** Formato versionado para distinguir ciphertext novo de registros legados. */
export function protectSupplierSessionValue(value?: string | null): string | null {
  if (!value) return null;
  return `${ENCRYPTED_PREFIX}${credentialEncryptionService.encrypt(value)}`;
}

/** Registros antigos em texto puro continuam legíveis e são migrados na próxima gravação. */
export function revealSupplierSessionValue(value?: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
  return credentialEncryptionService.decrypt(value.slice(ENCRYPTED_PREFIX.length));
}

function revealSession(session: SupplierSession): SupplierSession {
  return {
    ...session,
    cookies: revealSupplierSessionValue(session.cookies),
    localStorage: revealSupplierSessionValue(session.localStorage),
    sessionToken: revealSupplierSessionValue(session.sessionToken),
    authHeader: revealSupplierSessionValue(session.authHeader),
  };
}

export class SupplierSessionService {
  private async getDatabase() {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    return db;
  }

  /** Create or update an encrypted supplier session. */
  async upsertSession(
    supplierId: number,
    sessionData: SessionData,
    status: "active" | "expired" | "invalid" | "pending" = "active",
  ): Promise<SupplierSession> {
    const db = await this.getDatabase();
    const existing = await db
      .select()
      .from(supplierSessions)
      .where(eq(supplierSessions.supplierId, supplierId))
      .limit(1);

    const protectedCookies = protectSupplierSessionValue(
      sessionData.cookies ? JSON.stringify(sessionData.cookies) : null,
    );
    const protectedLocalStorage = protectSupplierSessionValue(
      sessionData.localStorage ? JSON.stringify(sessionData.localStorage) : null,
    );
    const protectedToken = protectSupplierSessionValue(sessionData.sessionToken);
    const protectedAuth = protectSupplierSessionValue(sessionData.authHeader);

    if (existing.length > 0) {
      const updateData: Record<string, unknown> = {
        status,
        lastAuthAt: new Date(),
        updatedAt: new Date(),
      };

      // Omissão significa preservar o valor atual; objeto vazio permite limpar cookies.
      if (sessionData.cookies !== undefined) updateData.cookies = protectedCookies;
      if (sessionData.localStorage !== undefined) updateData.localStorage = protectedLocalStorage;
      if (sessionData.sessionToken !== undefined) updateData.sessionToken = protectedToken;
      if (sessionData.authHeader !== undefined) updateData.authHeader = protectedAuth;
      if (sessionData.expiresAt !== undefined) updateData.expiresAt = sessionData.expiresAt;

      await db
        .update(supplierSessions)
        .set(updateData)
        .where(eq(supplierSessions.supplierId, supplierId));

      const updated = await db
        .select()
        .from(supplierSessions)
        .where(eq(supplierSessions.supplierId, supplierId))
        .limit(1);

      return revealSession(updated[0]);
    }

    await db.insert(supplierSessions).values({
      supplierId,
      cookies: protectedCookies,
      localStorage: protectedLocalStorage,
      sessionToken: protectedToken,
      authHeader: protectedAuth,
      status,
      lastAuthAt: new Date(),
      expiresAt: sessionData.expiresAt,
    });

    const created = await db
      .select()
      .from(supplierSessions)
      .where(eq(supplierSessions.supplierId, supplierId))
      .limit(1);

    return revealSession(created[0]);
  }

  /** Get active session for internal server-side use only. */
  async getActiveSession(supplierId: number): Promise<SupplierSession | null> {
    const db = await this.getDatabase();
    const sessions = await db
      .select()
      .from(supplierSessions)
      .where(
        and(
          eq(supplierSessions.supplierId, supplierId),
          eq(supplierSessions.status, "active"),
        ),
      )
      .limit(1);

    if (sessions.length === 0) return null;
    const session = sessions[0];

    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      await db
        .update(supplierSessions)
        .set({ status: "expired" })
        .where(eq(supplierSessions.id, session.id));
      return null;
    }

    return revealSession(session);
  }

  parseCookies(session: SupplierSession): Record<string, string> {
    if (!session.cookies) return {};
    try {
      return JSON.parse(session.cookies);
    } catch {
      return {};
    }
  }

  parseLocalStorage(session: SupplierSession): Record<string, string> {
    if (!session.localStorage) return {};
    try {
      return JSON.parse(session.localStorage);
    } catch {
      return {};
    }
  }

  formatCookieHeader(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  async invalidateSession(supplierId: number): Promise<void> {
    const db = await this.getDatabase();
    await db
      .update(supplierSessions)
      .set({ status: "invalid" })
      .where(eq(supplierSessions.supplierId, supplierId));
  }

  async expireSession(supplierId: number): Promise<void> {
    const db = await this.getDatabase();
    await db
      .update(supplierSessions)
      .set({ status: "expired" })
      .where(eq(supplierSessions.supplierId, supplierId));
  }

  async getAllSessions(supplierId: number): Promise<SupplierSession[]> {
    const db = await this.getDatabase();
    const rows = await db
      .select()
      .from(supplierSessions)
      .where(eq(supplierSessions.supplierId, supplierId));
    return rows.map(revealSession);
  }

  async cleanupExpiredSessions(): Promise<number> {
    const db = await this.getDatabase();
    const expired = await db
      .select()
      .from(supplierSessions)
      .where(eq(supplierSessions.status, "expired"));

    if (expired.length > 0) {
      await db
        .delete(supplierSessions)
        .where(eq(supplierSessions.status, "expired"));
    }

    return expired.length;
  }
}

export const supplierSessionService = new SupplierSessionService();
