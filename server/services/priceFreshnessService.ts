import { inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { priceHistory, companySettings } from "../../drizzle/schema";
import { ttlDeConfiguracao, avaliarValidadeLote } from "./priceValidityService";

/**
 * Frescor de preço por produto (spec §13): compara a data da última consulta
 * (último registro em price_history) com a validade configurada e marca os
 * preços vencidos — insumo do badge "preço vencido" na tela de revisão.
 */
export interface FrescorPreco {
  productId: number;
  consultadoEm: number | null;
  vencido: boolean;
  restanteMs: number;
}

export async function avaliarFrescorPrecos(
  productIds: number[],
  agora = Date.now(),
): Promise<FrescorPreco[]> {
  const ids = [...new Set(productIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return [];
  const db = await getDb();
  if (!db) return [];

  const settingsRows = await db.select().from(companySettings).limit(1);
  const ttl = ttlDeConfiguracao(settingsRows[0] ?? null);

  const rows = await db
    .select({ productId: priceHistory.productId, ultima: sql<Date>`MAX(${priceHistory.recordedAt})` })
    .from(priceHistory)
    .where(inArray(priceHistory.productId, ids))
    .groupBy(priceHistory.productId);

  const ultimaPorProduto = new Map<number, Date>();
  for (const r of rows) if (r.ultima) ultimaPorProduto.set(r.productId, r.ultima as Date);

  const itens = ids.map((id) => ({ id, consultadoEm: ultimaPorProduto.get(id) ?? null }));
  return avaliarValidadeLote(itens, ttl, agora).map((a) => {
    const consulta = ultimaPorProduto.get(a.id);
    return {
      productId: a.id,
      consultadoEm: consulta ? new Date(consulta).getTime() : null,
      vencido: a.vencido,
      restanteMs: a.restanteMs,
    };
  });
}
