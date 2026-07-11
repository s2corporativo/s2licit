import { getDb } from "../db";
import {
  supplierSessions,
  supplierCredentials,
  SupplierSession,
  InsertSupplierSession,
} from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { credentialEncryptionService } from "./credentialEncryptionService";

export interface SessionData {
  cookies?: Record<string, string>;
  sessionToken?: string;
  authHeader?: string;
  expiresAt?: Date;
}

export class SupplierSessionService {
  private async getDatabase() {
    const db = await getDb();
    if (!db) throw new Error("Database connection failed");
    return db;
  }

  /**
   * Create or update a supplier session
   */
  async upsertSession(
    supplierId: number,
    sessionData: SessionData,
    status: "active" | "expired" | "invalid" | "pending" = "active"
  ): Promise<SupplierSession> {
    const db = await this.getDatabase();

    // Check if session exists
    const existing = await db
      .select()
      .from(supplierSessions)
      .where(eq(supplierSessions.supplierId, supplierId))
      .limit(1);

    const cookiesJson = sessionData.cookies ? JSON.stringify(sessionData.cookies) : null;

    if (existing.length > 0) {
      // Update existing session
      await db
        .update(supplierSessions)
        .set({
          cookies: cookiesJson,
          sessionToken: sessionData.sessionToken,
          authHeader: sessionData.authHeader,
          status,
          lastAuthAt: new Date(),
          expiresAt: sessionData.expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(supplierSessions.supplierId, supplierId));

      const updated = await db
        .select()
        .from(supplierSessions)
        .where(eq(supplierSessions.supplierId, supplierId))
        .limit(1);

      return updated[0];
    } else {
      // Create new session
      const result = await db.insert(supplierSessions).values({
        supplierId,
        cookies: cookiesJson,
        sessionToken: sessionData.sessionToken,
        authHeader: sessionData.authHeader,
        status,
        lastAuthAt: new Date(),
        expiresAt: sessionData.expiresAt,
      });

      const newSession = await db
        .select()
        .from(supplierSessions)
        .where(eq(supplierSessions.supplierId, supplierId))
        .limit(1);

      return newSession[0];
    }
  }

  /**
   * Get active session for a supplier
   */
  async getActiveSession(supplierId: number): Promise<SupplierSession | null> {
    const db = await this.getDatabase();

    const sessions = await db
      .select()
      .from(supplierSessions)
      .where(
        and(
          eq(supplierSessions.supplierId, supplierId),
          eq(supplierSessions.status, "active")
        )
      )
      .limit(1);

    if (sessions.length === 0) return null;

    const session = sessions[0];

    // Check if session has expired
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      // Mark as expired
      await db
        .update(supplierSessions)
        .set({ status: "expired" })
        .where(eq(supplierSessions.id, session.id));

      return null;
    }

    return session;
  }

  /**
   * Parse cookies from session
   */
  parseCookies(session: SupplierSession): Record<string, string> {
    if (!session.cookies) return {};
    try {
      return JSON.parse(session.cookies);
    } catch {
      return {};
    }
  }

  /**
   * Format cookies for HTTP headers
   */
  formatCookieHeader(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  /**
   * Invalidate session
   */
  async invalidateSession(supplierId: number): Promise<void> {
    const db = await this.getDatabase();
    await db
      .update(supplierSessions)
      .set({ status: "invalid" })
      .where(eq(supplierSessions.supplierId, supplierId));
  }

  /**
   * Mark session as expired
   */
  async expireSession(supplierId: number): Promise<void> {
    const db = await this.getDatabase();
    await db
      .update(supplierSessions)
      .set({ status: "expired" })
      .where(eq(supplierSessions.supplierId, supplierId));
  }

  /**
   * Get all sessions for a supplier (including expired)
   */
  async getAllSessions(supplierId: number): Promise<SupplierSession[]> {
    const db = await this.getDatabase();
    return db
      .select()
      .from(supplierSessions)
      .where(eq(supplierSessions.supplierId, supplierId));
  }

  /**
   * Clean up expired sessions
   */
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
