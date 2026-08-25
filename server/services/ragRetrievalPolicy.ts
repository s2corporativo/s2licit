export const RAG_SCAN_BATCH_SIZE = 1000;
export const RAG_SCAN_HARD_CAP = 100_000;

/**
 * O RAG não deve selecionar uma janela arbitrária sem ORDER BY. A política
 * exige paginação determinística por productId até cobrir o conjunto elegível
 * ou atingir um hard-cap explícito, caso em que a resposta precisa sinalizar
 * truncamento em vez de fingir busca integral.
 */
export function nextRagBatch(lastProductId: number | null, batchSize = RAG_SCAN_BATCH_SIZE) {
  return { afterProductId: lastProductId ?? 0, limit: Math.max(1, Math.min(batchSize, 5000)) };
}
