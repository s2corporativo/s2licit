import { calculateStringSimilarity } from "./productMatchingService";
import { findProductByCatmas, findProductByCatmat, listProductsForMatching } from "../db";
import type { ExtractedItem } from "./emailQuotationExtractor";

/**
 * Cruzamento de itens de cotação com o catálogo de produtos.
 *
 * Estratégia, em ordem de prioridade:
 *   1. Código CATMAS exato (determinístico).
 *   2. Código CATMAT exato (determinístico).
 *   3. Similaridade de nome (Levenshtein normalizado), acima de um limiar.
 */

export type MatchMethod = "catmas" | "catmat" | "nome" | "nenhum";

export interface ItemMatch {
  produtoMatchId: number | null;
  matchScore: number | null;
  matchMethod: MatchMethod;
  precoSugerido: string | null;
}

const NAME_MATCH_THRESHOLD = 0.68;

interface CatalogProduct {
  id: number;
  name: string;
  price: string | null;
}

/**
 * Encontra o melhor produto do catálogo (já carregado) por similaridade de nome.
 * Exportada e pura para facilitar testes.
 */
export function bestNameMatch(
  descricao: string,
  catalog: CatalogProduct[],
  threshold = NAME_MATCH_THRESHOLD,
): { product: CatalogProduct; score: number } | null {
  let best: { product: CatalogProduct; score: number } | null = null;
  for (const product of catalog) {
    const score = calculateStringSimilarity(descricao, product.name);
    if (score >= threshold && (!best || score > best.score)) {
      best = { product, score };
    }
  }
  return best;
}

function isCatmasCode(code: string): boolean {
  // CATMAS costuma ter 9 dígitos; CATMAT costuma ter 6. Heurística de fallback:
  // tentamos ambos os catálogos de qualquer forma.
  return /^\d{7,}$/.test(code.trim());
}

/**
 * Cruza um único item com o catálogo. `catalog` é o conjunto de produtos ativos
 * já carregado (evita N queries). Códigos de catálogo são consultados no banco.
 */
export async function matchQuotationItem(
  item: ExtractedItem,
  catalog: CatalogProduct[],
): Promise<ItemMatch> {
  const code = item.codigoCatalogo?.trim();

  if (code) {
    // Tenta CATMAS e CATMAT (não sabemos a origem com certeza).
    const preferCatmasFirst = isCatmasCode(code);
    const lookups = preferCatmasFirst
      ? ([["catmas", findProductByCatmas], ["catmat", findProductByCatmat]] as const)
      : ([["catmat", findProductByCatmat], ["catmas", findProductByCatmas]] as const);

    for (const [method, lookup] of lookups) {
      const found = await lookup(code);
      if (found) {
        return {
          produtoMatchId: found.id,
          matchScore: 1,
          matchMethod: method as MatchMethod,
          precoSugerido: found.price ?? null,
        };
      }
    }
  }

  const nameHit = bestNameMatch(item.descricao, catalog);
  if (nameHit) {
    return {
      produtoMatchId: nameHit.product.id,
      matchScore: Number(nameHit.score.toFixed(4)),
      matchMethod: "nome",
      precoSugerido: nameHit.product.price ?? null,
    };
  }

  return { produtoMatchId: null, matchScore: null, matchMethod: "nenhum", precoSugerido: null };
}

/**
 * Cruza todos os itens de uma cotação, carregando o catálogo uma única vez.
 */
export async function matchQuotationItems(items: ExtractedItem[]): Promise<ItemMatch[]> {
  const catalog = await listProductsForMatching();
  return Promise.all(items.map((item) => matchQuotationItem(item, catalog)));
}
