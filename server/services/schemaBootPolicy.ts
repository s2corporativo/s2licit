export function schemaBootDdlEnabled(): boolean {
  const explicit = process.env.SCHEMA_BOOT_DDL_ENABLED;
  if (explicit != null && explicit !== "") return explicit === "true" || explicit === "1";
  // Desenvolvimento preserva conveniência; produção usa migrations como fonte única.
  return process.env.NODE_ENV !== "production";
}

export function assertSchemaBootDdlAllowed(operation: string): void {
  if (!schemaBootDdlEnabled()) {
    throw new Error(
      `DDL de boot bloqueado (${operation}). Em produção, crie/aplique uma migration versionada.`,
    );
  }
}
