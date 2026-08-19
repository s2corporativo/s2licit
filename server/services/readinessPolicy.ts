export const PUBLIC_HEALTH_FIELDS = new Set(["status", "database", "uptime"]);

export function sanitizeReadinessError(_error: unknown) {
  return { status: "not_ready" as const, database: "error" as const, error: "Falha de prontidão" };
}
