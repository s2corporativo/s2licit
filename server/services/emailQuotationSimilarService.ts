import { and, asc, eq, gt } from "drizzle-orm";
import { categories, emailQuotationItems, products, suppliers } from "../../drizzle/schema";
import { getDb } from "../db/_client";
import { calculateStringSimilarity } from "./productMatchingService";

/**
 * Sugestão de produtos similares para itens de cotação sem match.
 *
 * Estratégia, em ordem de prioridade por item:
 *   1. Principio ativo identificado na descricao (match LIKE por principio ativo).
 *   2. Similaridade de nome fuzzy contra o catalogo (threshold 0.55, mais
 *      permissivo que o match automatico de cotação, por ser apenas sugestão).
 *
 * A sugestão é assistiva: nada é confirmado automaticamente — o operador
 * vincula o candidato via setItemMatch, preservando a auditoria existente.
 */

export type SimilarCandidate = {
  id: number;
  name: string;
  activeIngredient: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  price: string | null;
  priceUnit: string | null;
  supplierName: string | null;
  categoryName: string | null;
  score: number;
  method: "principioAtivo" | "nome";
};

export type ItemSimilarSuggestion = {
  itemId: number;
  numeroItem: number | null;
  descricao: string;
  candidates: SimilarCandidate[];
};

/** Threshold mais permissivo que o match automatico (0.68): sugestões assistivas. */
export const SIMILAR_SUGGEST_THRESHOLD = 0.55;
export const MAX_CANDIDATES_PER_ITEM = 5;

/**
 * Palavras de suporte que não caracterizam principio ativo por si só.
 */
const SUPPORT_WORDS = new Set([
  "solução", "solução", "comprimido", "comprimidos", "cápsula", "cápsulas",
  "frasco", "frascos", "sachê", "sachês", "gotas", "spray", "pomada",
  "creme", "gel", "suspensão", "xarope", "oral", "injetável", "tópico",
  "para", "uso", "humano", "veterinário", "veterinarias", "veterinárias",
  "mg", "ml", "g", "unidade", "und", "kit", "caixa", "embalagem",
]);

/**
 * Tenta extrair um termo candidato a princípio ativo da descrição do item.
 * Usa heurística conservadora: o termo deve ter 5+ caracteres e não ser uma
 * palavra de suporte. Retornamos até 2 termos candidatos.
 */
export function extractIngredientCandidates(descricao: string): string[] {
  if (!descricao) return [];
  const tokens = descricao
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-zà-ü0-9]+/)
    .filter((t) => t.length >= 5 && !/^\d+$/.test(t) && !SUPPORT_WORDS.has(t));
  // Prioriza tokens mais longos e raros (pouco provável de ser nome comum)
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const key = t;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(t);
      if (unique.length >= 3) break;
    }
  }
  return unique.slice(0, 2);
}

/**
 * Carrega o catálogo com os campos necessários para sugestão (paginação em
 * blocos, espelhando a abordagem de listProductsForMatching para o catálogo
 * de 32 mil+ produtos ativos).
 */
async function loadSimilarityCatalog(): Promise<
  Array<{
    id: number;
    name: string;
    activeIngredient: string | null;
    manufacturer: string | null;
    concentration: string | null;
    presentation: string | null;
    price: string | null;
    priceUnit: string | null;
    supplierName: string | null;
    categoryName: string | null;
  }>
> {
  const db = await getDb();
  if (!db) return [];
  const PAGE = 5000;
  const all: any[] = [];
  let lastId = 0;
  for (;;) {
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        activeIngredient: products.activeIngredient,
        manufacturer: products.manufacturer,
        concentration: products.concentration,
        presentation: products.presentation,
        price: products.price,
        priceUnit: products.priceUnit,
        supplierName: suppliers.name,
        categoryName: categories.name,
      })
      .from(products)
      .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(products.isActive, "yes"), gt(products.id, lastId)))
      .orderBy(asc(products.id))
      .limit(PAGE);
    all.push(...rows);
    if (rows.length < PAGE) break;
    lastId = rows[rows.length - 1].id;
  }
  return all;
}

/**
 * Gera candidatos similares para um único item.
 */
function suggestForItem(
  item: { id: number; numeroItem: number | null; descricao: string },
  catalog: Awaited<ReturnType<typeof loadSimilarityCatalog>>,
): ItemSimilarSuggestion {
  const descricao = item.descricao;
  const candidates: SimilarCandidate[] = [];
  const taken = new Set<number>();

  const push = (p: (typeof catalog)[number], score: number, method: "principioAtivo" | "nome") => {
    if (taken.has(p.id)) return;
    taken.add(p.id);
    candidates.push({ ...p, score, method });
  };

  // 1. Candidatos por principio ativo (substrings da descricao no campo
  //    activeIngredient ou vice-versa)
  const candidatesByIngredient = extractIngredientCandidates(descricao);
  for (const candidate of candidatesByIngredient) {
    const hits = catalog.filter(
      (p) =>
        p.activeIngredient &&
        (p.activeIngredient.toLowerCase().includes(candidate) ||
          candidate.includes(p.activeIngredient.toLowerCase())),
    );
    // Score por cobertura do candidato na descricao (quão raro/específico)
    const score = Math.min(0.95, 0.7 + candidate.length / 200);
    for (const p of hits) push(p, Math.round(score * 1000) / 1000, "principioAtivo");
  }

  // 2. Candidatos por similaridade de nome fuzzy
  if (candidates.length < MAX_CANDIDATES_PER_ITEM) {
    const scored: Array<{ p: (typeof catalog)[number]; score: number }> = [];
    for (const p of catalog) {
      const score = calculateStringSimilarity(descricao, p.name);
      if (score >= SIMILAR_SUGGEST_THRESHOLD) scored.push({ p, score });
    }
    scored.sort((a, b) => b.score - a.score);
    for (const { p, score } of scored) {
      if (candidates.length >= MAX_CANDIDATES_PER_ITEM) break;
      push(p, Math.round(score * 1000) / 1000, "nome");
    }
  }

  return {
    itemId: item.id,
    numeroItem: item.numeroItem,
    descricao,
    candidates: candidates.slice(0, MAX_CANDIDATES_PER_ITEM),
  };
}

/**
 * Sugere produtos similares para todos os itens SEM match de uma cotação.
 */
export async function suggestSimilarItems(quotationId: number): Promise<ItemSimilarSuggestion[]> {
  const db = await getDb();
  if (!db) return [];
  const items = await db
    .select({
      id: emailQuotationItems.id,
      numeroItem: emailQuotationItems.numeroItem,
      descricao: emailQuotationItems.descricao,
      produtoMatchId: emailQuotationItems.produtoMatchId,
      matchMethod: emailQuotationItems.matchMethod,
    })
    .from(emailQuotationItems)
    .where(eq(emailQuotationItems.quotationId, quotationId));

  const unmatched = items.filter((i) => !i.produtoMatchId);
  if (unmatched.length === 0) return [];

  const catalog = await loadSimilarityCatalog();
  return unmatched.map((item) =>
    suggestForItem({ id: item.id, numeroItem: item.numeroItem, descricao: item.descricao }, catalog),
  );
}
