export function readinessErrorPayload() {
  return {
    status: "not_ready" as const,
    database: "error" as const,
    error: "Falha de prontidão",
  };
}
