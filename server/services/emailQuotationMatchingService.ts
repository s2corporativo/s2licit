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
  // CATMAS (MG) costuma ter 8+ dígitos; CATMAT (federal) ~6. Usamos o formato
  // para escolher UM catálogo — nunca cruzamos CATMAS↔CATMAT (numerações
  // independentes; um código pode existir por coincidência no outro catálogo e
  // ligar o item ao produto errado com "score 1").
  return /^\d{8,}$/.test(code.trim());
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
    // Escolhe UM catálogo pelo formato do código e consulta só ele.
    const [method, lookup] = isCatmasCode(code)
      ? (["catmas", findProductByCatmas] as const)
      : (["catmat", findProductByCatmat] as const);
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
