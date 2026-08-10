import { calculateStringSimilarity } from "./productMatchingService";
import { findProductByCatmas, findProductByCatmat, listProductsForMatching } from "../db";
import type { ExtractedItem } from "./emailQuotationExtractor";

export type MatchMethod = "catmas" | "catmat" | "nome" | "nenhum";

export interface ItemMatch {
  produtoMatchId: number | null;
  matchScore: number | null;
  matchMethod: MatchMethod;
  precoSugerido: string | null;
}

const NAME_MATCH_THRESHOLD = 0.68;
const MATCH_CONCURRENCY = 8;

export interface CatalogProduct {
  id: number;
  name: string;
  price: string | null;
}

interface IndexedCatalogProduct extends CatalogProduct {
  normalizedName: string;
  nameLength: number;
}

export interface NameMatchIndex {
  productsByLength: IndexedCatalogProduct[];
}

function normalizeComparableName(value: string): string {
  return value.toLowerCase().trim();
}

function lowerBoundByLength(products: IndexedCatalogProduct[], target: number): number {
  let low = 0;
  let high = products.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (products[mid].nameLength < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBoundByLength(products: IndexedCatalogProduct[], target: number): number {
  let low = 0;
  let high = products.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (products[mid].nameLength <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Índice exato para pruning por limite superior da similaridade Levenshtein.
 * Construção O(P log P), memória O(P). O mesmo índice é reutilizado por todos
 * os itens de um lote.
 */
export function buildNameMatchIndex(catalog: CatalogProduct[]): NameMatchIndex {
  return {
    productsByLength: catalog
      .map((product) => {
        const normalizedName = normalizeComparableName(product.name);
        return { ...product, normalizedName, nameLength: normalizedName.length };
      })
      .filter((product) => product.nameLength > 0)
      .sort((a, b) => a.nameLength - b.nameLength || a.id - b.id),
  };
}

/**
 * Busca exata dentro do índice. Se threshold=t, Levenshtein normalizado jamais
 * alcança t quando min(lenA,lenB)/max(lenA,lenB) < t; candidatos fora desse
 * intervalo são removidos sem risco de falso negativo.
 */
export function bestNameMatchFromIndex(
  descricao: string,
  index: NameMatchIndex,
  threshold = NAME_MATCH_THRESHOLD,
): { product: CatalogProduct; score: number } | null {
  const query = normalizeComparableName(descricao);
  if (!query || !index.productsByLength.length) return null;
  const safeThreshold = Math.min(1, Math.max(0.01, threshold));
  const minLength = Math.ceil(query.length * safeThreshold);
  const maxLength = Math.floor(query.length / safeThreshold);
  const start = lowerBoundByLength(index.productsByLength, minLength);
  const end = upperBoundByLength(index.productsByLength, maxLength);

  let best: { product: CatalogProduct; score: number } | null = null;
  for (let i = start; i < end; i += 1) {
    const product = index.productsByLength[i];
    const score = calculateStringSimilarity(query, product.normalizedName);
    if (score >= safeThreshold && (!best || score > best.score)) {
      best = { product, score };
      if (score === 1) break;
    }
  }
  return best;
}

/** Compatibilidade para consumidores que ainda passam apenas o array. */
export function bestNameMatch(
  descricao: string,
  catalog: CatalogProduct[],
  threshold = NAME_MATCH_THRESHOLD,
): { product: CatalogProduct; score: number } | null {
  return bestNameMatchFromIndex(descricao, buildNameMatchIndex(catalog), threshold);
}

function isCatmasCode(code: string): boolean {
  return /^\d{8,}$/.test(code.trim());
}

export async function matchQuotationItem(
  item: ExtractedItem,
  catalog: CatalogProduct[],
): Promise<ItemMatch> {
  return matchQuotationItemWithIndex(item, buildNameMatchIndex(catalog));
}

export async function matchQuotationItemWithIndex(
  item: ExtractedItem,
  index: NameMatchIndex,
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

  const nameHit = bestNameMatchFromIndex(item.descricao, index);
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

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Catálogo é carregado/indexado uma vez. Consultas determinísticas CATMAS/CATMAT
 * têm concorrência limitada a 8 para não saturar o pool MySQL.
 */
export async function matchQuotationItems(items: ExtractedItem[]): Promise<ItemMatch[]> {
  if (!items.length) return [];
  const catalog = await listProductsForMatching();
  const index = buildNameMatchIndex(catalog);
  return mapWithConcurrency(items, MATCH_CONCURRENCY, (item) => matchQuotationItemWithIndex(item, index));
}
