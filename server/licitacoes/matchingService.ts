/**
 * matchingService.ts
 * Serviço de matching entre itens de licitações e o catálogo de produtos.
 *
 * Estratégia:
 *  1. Normalização de texto (lowercase, remove pontuação, stopwords)
 *  2. Token overlap (Jaccard similarity) entre descrição do item e nome/princípio ativo
 *  3. Boost por correspondência de concentração e apresentação
 *  4. Threshold configurável (padrão: 0.35 para sugestão, 0.65 para confirmação automática)
 */

import { getDb } from "../db";
import { products } from "../../drizzle/schema";
import { eq, and, isNotNull } from "drizzle-orm";

// ─── Normalização ────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "de", "do", "da", "dos", "das", "para", "com", "sem", "em", "por",
  "a", "o", "e", "um", "uma", "mg", "ml", "g", "kg", "l", "lt",
  "cx", "fr", "amp", "cp", "comp", "tab", "cap", "sol", "susp",
  "inj", "oral", "iv", "im", "sc", "topico", "topica",
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach((t) => { if (b.has(t)) intersection++; });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface CatalogProduct {
  id: number;
  name: string;
  activeIngredient: string | null;
  concentration: string | null;
  presentation: string | null;
  manufacturer: string | null;
  price: string | null;
  isActive: string | null;
}

export interface MatchResult {
  productId: number;
  productName: string;
  score: number;
  scoreDetail: {
    nameJaccard: number;
    activeIngredientJaccard: number;
    concentrationBoost: number;
    presentationBoost: number;
  };
}

// ─── Cache do catálogo ────────────────────────────────────────────────────────

let catalogCache: CatalogProduct[] | null = null;
let catalogCacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export async function getCatalog(): Promise<CatalogProduct[]> {
  const now = Date.now();
  if (catalogCache && now - catalogCacheAt < CACHE_TTL_MS) return catalogCache;

  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      activeIngredient: products.activeIngredient,
      concentration: products.concentration,
      presentation: products.presentation,
      manufacturer: products.manufacturer,
      price: products.price,
      isActive: products.isActive,
    })
    .from(products)
    .where(eq(products.isActive, "yes"));

  catalogCache = rows as CatalogProduct[];
  catalogCacheAt = now;
  return catalogCache;
}

export function invalidateCatalogCache(): void {
  catalogCache = null;
  catalogCacheAt = 0;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

/**
 * Calcula o score de match entre uma descrição de item de licitação e um produto do catálogo.
 */
export function calcMatchScore(descricao: string, product: CatalogProduct): MatchResult["scoreDetail"] & { total: number } {
  const descTokens = tokenize(descricao);

  // Score pelo nome do produto
  const nameTokens = tokenize(product.name ?? "");
  const nameJaccard = jaccardSimilarity(descTokens, nameTokens);

  // Score pelo princípio ativo
  const aiTokens = tokenize(product.activeIngredient ?? "");
  const activeIngredientJaccard = aiTokens.size > 0 ? jaccardSimilarity(descTokens, aiTokens) : 0;

  // Boost por concentração (ex: "500mg" presente na descrição)
  const concNorm = normalizeText(product.concentration ?? "");
  const concentrationBoost = concNorm && normalizeText(descricao).includes(concNorm) ? 0.15 : 0;

  // Boost por apresentação (ex: "comprimido", "frasco")
  const presNorm = normalizeText(product.presentation ?? "");
  const presentationBoost = presNorm && normalizeText(descricao).includes(presNorm.split(" ")[0]) ? 0.10 : 0;

  // Score total: nome tem peso maior, princípio ativo complementa
  const total = Math.min(
    1.0,
    nameJaccard * 0.55 +
    activeIngredientJaccard * 0.30 +
    concentrationBoost +
    presentationBoost
  );

  return { nameJaccard, activeIngredientJaccard, concentrationBoost, presentationBoost, total };
}

/**
 * Encontra os melhores matches para uma descrição de item de licitação.
 * @param descricao  Descrição do item da licitação
 * @param topN       Quantos candidatos retornar (padrão: 5)
 * @param threshold  Score mínimo para incluir no resultado (padrão: 0.20)
 */
export async function findMatches(
  descricao: string,
  topN = 5,
  threshold = 0.20
): Promise<MatchResult[]> {
  const catalog = await getCatalog();
  if (!catalog.length) return [];

  const results: MatchResult[] = [];

  for (const product of catalog) {
    const detail = calcMatchScore(descricao, product);
    if (detail.total >= threshold) {
      results.push({
        productId: product.id,
        productName: product.name,
        score: detail.total,
        scoreDetail: {
          nameJaccard: detail.nameJaccard,
          activeIngredientJaccard: detail.activeIngredientJaccard,
          concentrationBoost: detail.concentrationBoost,
          presentationBoost: detail.presentationBoost,
        },
      });
    }
  }

  // Ordenar por score decrescente e retornar top N
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topN);
}

/**
 * Verifica se uma licitação é relevante para o catálogo (tem pelo menos um item com match >= threshold).
 * Usado para filtrar licitações antes de salvar no banco.
 */
export async function isLicitacaoRelevante(
  itens: { descricao: string }[],
  threshold = 0.30
): Promise<boolean> {
  for (const item of itens) {
    const matches = await findMatches(item.descricao, 1, threshold);
    if (matches.length > 0) return true;
  }
  return false;
}

/**
 * Filtra palavras-chave veterinárias/agropecuárias em um texto.
 * Retorna true se o texto contém termos relevantes.
 */
export function contemTermosVeterinarios(texto: string): boolean {
  const TERMOS = [
    "veterinari", "animal", "bovino", "equino", "canino", "felino", "suino",
    "aviari", "peixe", "piscicultura", "agropecuari", "pecuari",
    "medicamento", "vacina", "antiparasit", "antibiot", "antibiotic",
    "vermifug", "carrapaticid", "inseticid", "antiinflamatori",
    "ivermectin", "doramectin", "abamectin", "albendazol", "levamisol",
    "oxitetraciclina", "enrofloxacin", "florfenicol",
    "mapa", "anvisa", "registro", "principio ativo",
  ];
  const norm = normalizeText(texto);
  return TERMOS.some((t) => norm.includes(t));
}
