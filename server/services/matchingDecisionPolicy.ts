export type CatalogMatchMethod = "catmas" | "catmat" | "mapa" | "ean" | "nome" | "rag" | "manual" | "nenhum";

/**
 * Política conservadora para decisão automática: códigos oficiais/exatos podem
 * auto-confirmar; similaridade nominal ou vetorial produz apenas candidato.
 * A elevação futura de nome/RAG para auto-match exige passagem explícita pelo
 * technicalMatchGuard.
 */
export function methodIsDeterministic(method: string | null | undefined): boolean {
  return method === "catmas" || method === "catmat" || method === "mapa" || method === "ean";
}

export function mayAutoConfirmWithoutTechnicalGuard(method: string | null | undefined): boolean {
  return methodIsDeterministic(method);
}
