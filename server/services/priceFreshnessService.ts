import { inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { priceHistory, companySettings } from "../../drizzle/schema";
import { ttlDeConfiguracao, avaliarValidadeLote } from "./priceValidityService";
import { undatedCostBlocksAutomation } from "./costAutomationPolicy";

/**
 * Frescor de preço por produto. `consultadoEm=0` representa explicitamente
 * custo sem histórico datado quando a política exige confirmação humana. Isso
 * faz os consumidores legados que testam `consultadoEm != null && vencido`
 * bloquearem a automação sem confundir ausência de histórico com preço fresco.
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
  const avaliados = avaliarValidadeLote(itens, ttl, agora);
  const blockUndated = undatedCostBlocksAutomation();

  return avaliados.map((a) => {
    const consulta = ultimaPorProduto.get(a.id);
    if (!consulta && blockUndated) {
      return {
        productId: a.id,
        consultadoEm: 0,
        vencido: true,
        restanteMs: 0,
      };
    }
    return {
      productId: a.id,
      consultadoEm: consulta ? new Date(consulta).getTime() : null,
      vencido: a.vencido,
      restanteMs: a.restanteMs,
    };
  });
}
