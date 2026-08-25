export function safeHealthFailure() {
  return { status: "not_ready", database: "error", error: "Falha de prontidão" } as const;
}
