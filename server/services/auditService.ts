import type { Request } from "express";
import { getDb } from "../db";
import { auditLogs } from "../../drizzle/schema";
import { logger } from "../_core/logger";

/**
 * Registro server-side da trilha de auditoria (§18).
 *
 * Diferente de `auditRouter.logAction` (exposto via tRPC para o front), este
 * helper é chamado internamente pelo servidor — por exemplo no login e nas
 * operações sobre credenciais — capturando também IP e user-agent.
 *
 * É best-effort: falha de auditoria nunca deve derrubar a operação auditada.
 */
export interface AuditEntry {
  userId?: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  origin?: string;
  summary?: string | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Extrai IP e user-agent de uma requisição Express, com truncamento seguro. */
export function requestOrigin(req?: Pick<Request, "ip" | "get">): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  if (!req) return { ipAddress: null, userAgent: null };
  const ua = typeof req.get === "function" ? req.get("user-agent") ?? null : null;
  return {
    ipAddress: req.ip ? String(req.ip).slice(0, 64) : null,
    userAgent: ua ? ua.slice(0, 512) : null,
  };
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      origin: entry.origin ?? "system",
      summary: entry.summary ?? null,
      changes: (entry.changes ?? null) as any,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    });
  } catch (err) {
    // Nunca propagar: auditoria não pode quebrar o fluxo auditado.
    logger.error("[Audit] Falha ao registrar evento de auditoria:", (err as Error).message);
  }
}
