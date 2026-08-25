export type AuditTrustLevel = "server" | "client";

/**
 * Eventos que comprovam ação operacional sensível devem nascer no servidor.
 * O cliente pode registrar telemetria de UI, mas nunca forjar evento confiável.
 */
export function auditTrustLevel(origin?: string | null): AuditTrustLevel {
  return origin === "client" || origin === "manual" ? "client" : "server";
}

export const SENSITIVE_AUDIT_ACTION_PREFIXES = [
  "QUOTATION_",
  "AUTO_MATCH_",
  "CREDENTIAL_",
  "AI_CONFIG_",
  "USER_",
  "TAX_",
  "SCRAPER_",
  "PORTAL_",
];

export function isSensitiveAuditAction(action: string): boolean {
  const upper = action.trim().toUpperCase();
  return SENSITIVE_AUDIT_ACTION_PREFIXES.some((prefix) => upper.startsWith(prefix));
}
