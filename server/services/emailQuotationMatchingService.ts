import { calculateStringSimilarity } from "./productMatchingService";
import { findProductByCatmas, findProductByCatmat, listProductsForMatching } from "../db";
import type { ExtractedItem } from "./emailQuotationExtractor";
import { nameMatchThreshold } from "./quotationAutoPipelineService";

/**
 * Cruzamento de itens de cotação com o catálogo.
 *
 * 1. CATMAS exato — determinístico.
 * 2. CATMAT exato — determinístico.
 * 3. Nome — APENAS candidato para revisão. Score nominal nunca é promovido a
 *    1.000, evitando que identidade textual contorne a política técnica.
 */

export type MatchMethod = "catmas" | "catmat" | "nome" | "nenhum";

export interface ItemMatch {
  produtoMatchId: number | null;
  matchScore: number | null;
  matchMethod: MatchMethod;
  precoSugerido: string | null;
}

interface CatalogProduct {
  id: number;
  name: string;
  price: string | null;
}

export function bestNameMatch(
  descricao: string,
  catalog: CatalogProduct[],
  threshold = 0.68,
): { product: CatalogProduct; score: number } | null {
  let best: { product: CatalogProduct; score: number } | null = null;
  for (const product of catalog) {
    const score = calculateStringSimilarity(descricao, product.name);
    if (score >= threshold && (!best || score > best.score)) best = { product, score };
  }
  return best;
}

export function effectiveNameMatchThreshold(): number {
  return nameMatchThreshold();
}

function isCatmasCode(code: string): boolean {
  return /^\d{8,}$/.test(code.trim());
}

/**
 * Similaridade textual é recuperação, não decisão de equivalência. Mesmo que o
 * texto seja idêntico, o score persistido fica no máximo em 0,999. Com o
 * limiar de auto-confirmação de produção em 1,00, somente os códigos oficiais
 * determinísticos podem ser confirmados sem revisão/guarda técnica.
 */
export async function matchQuotationItem(
  item: ExtractedItem,
  catalog: CatalogProduct[],
): Promise<ItemMatch> {
  const code = item.codigoCatalogo?.trim();

  if (code) {
    const [method, lookup] = isCatmasCode(code)
      ? (["catmas", findProductByCatmas] as const)
      : (["catmat", findProductByCatmat] as const);
    const found = await lookup(code);
    if (found) {
      return {
        produtoMatchId: found.id,
        matchScore: 1,
        matchMethod: method,
        precoSugerido: found.price ?? null,
      };
    }
  }

  const nameHit = bestNameMatch(item.descricao, catalog, effectiveNameMatchThreshold());
  if (nameHit) {
    return {
      produtoMatchId: nameHit.product.id,
      matchScore: Number(Math.min(nameHit.score, 0.999).toFixed(4)),
      matchMethod: "nome",
      precoSugerido: nameHit.product.price ?? null,
    };
  }

  return { produtoMatchId: null, matchScore: null, matchMethod: "nenhum", precoSugerido: null };
}

export async function matchQuotationItems(items: ExtractedItem[]): Promise<ItemMatch[]> {
  const catalog = await listProductsForMatching();
  return Promise.all(items.map((item) => matchQuotationItem(item, catalog)));
}
