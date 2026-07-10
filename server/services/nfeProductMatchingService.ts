import { getDb } from "../db";
import { products, suppliers } from "../../drizzle/schema";
import { eq, like, and } from "drizzle-orm";
import type { NfeProduct } from "./nfeParserService";

export interface MatchResult {
  nfeProduct: NfeProduct;
  matchStatus: "new" | "update" | "duplicate" | "unknown";
  matchedProductId?: number;
  matchedProductName?: string;
  confidence: number; // 0-100
  reason: string;
}

/**
 * Faz matching automático de produtos da NF-e com produtos existentes
 * Estratégia: EAN → Código → Nome normalizado → Fuzzy
 */
export async function matchNfeProducts(
  nfeProducts: NfeProduct[],
  supplierId: number
): Promise<MatchResult[]> {
  const db = await getDb();
  if (!db) return nfeProducts.map(p => ({ nfeProduct: p, matchStatus: "unknown", confidence: 0, reason: "DB unavailable" }));

  const results: MatchResult[] = [];

  for (const nfeProd of nfeProducts) {
    let match: MatchResult | null = null;

    // Estratégia 1: Match por EAN
    if (nfeProd.ean) {
      match = await matchByEan(db, nfeProd);
      if (match) {
        results.push(match);
        continue;
      }
    }

    // Estratégia 2: Match por código do produto
    if (nfeProd.id) {
      match = await matchByCode(db, nfeProd, supplierId);
      if (match) {
        results.push(match);
        continue;
      }
    }

    // Estratégia 3: Match por nome normalizado
    match = await matchByNormalizedName(db, nfeProd);
    if (match) {
      results.push(match);
      continue;
    }

    // Estratégia 4: Sem match - produto novo
    results.push({
      nfeProduct: nfeProd,
      matchStatus: "new",
      confidence: 0,
      reason: "Nenhum match encontrado - produto novo",
    });
  }

  return results;
}

/**
 * Match por EAN (código de barras)
 */
async function matchByEan(db: any, nfeProd: NfeProduct): Promise<MatchResult | null> {
  if (!nfeProd.ean) return null;

  try {
    const existing = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.barcode, nfeProd.ean))
      .limit(1);

    if (existing.length > 0) {
      return {
        nfeProduct: nfeProd,
        matchStatus: "update",
        matchedProductId: existing[0].id,
        matchedProductName: existing[0].name,
        confidence: 100,
        reason: `Match por EAN: ${nfeProd.ean}`,
      };
    }
  } catch (error) {
    console.error("[NFeMatching] Erro ao fazer match por EAN:", error);
  }

  return null;
}

/**
 * Match por código do produto
 */
async function matchByCode(db: any, nfeProd: NfeProduct, supplierId: number): Promise<MatchResult | null> {
  if (!nfeProd.id) return null;

  try {
    const existing = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(and(eq(products.code, nfeProd.id), eq(products.supplierId, supplierId)))
      .limit(1);

    if (existing.length > 0) {
      return {
        nfeProduct: nfeProd,
        matchStatus: "update",
        matchedProductId: existing[0].id,
        matchedProductName: existing[0].name,
        confidence: 95,
        reason: `Match por código: ${nfeProd.id}`,
      };
    }
  } catch (error) {
    console.error("[NFeMatching] Erro ao fazer match por código:", error);
  }

  return null;
}

/**
 * Match por nome normalizado (remove acentos, espaços, caracteres especiais)
 */
async function matchByNormalizedName(db: any, nfeProd: NfeProduct): Promise<MatchResult | null> {
      const normalizedName = normalizeString(nfeProd.productName);
  if (!normalizedName || normalizedName.length < 3) return null;

  try {
    // Busca por LIKE com nome normalizado
    const existing = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(like(products.name, `%${normalizedName}%`))
      .limit(5);

    if (existing.length > 0) {
      // Calcula score de similaridade
      const existingProducts = existing;
      const scores = existingProducts.map((p: any) => ({
        ...p,
        score: calculateSimilarity(normalizedName, normalizeString(p.name)),
      }));

      const best = scores.sort((a: any, b: any) => b.score - a.score)[0];

      if (best.score >= 70) {
        return {
          nfeProduct: nfeProd,
          matchStatus: "update",
          matchedProductId: best.id,
          matchedProductName: best.name,
          confidence: best.score,
          reason: `Match por nome similar (${best.score}% confiança)`,
        };
      }
    }
  } catch (error) {
    console.error("[NFeMatching] Erro ao fazer match por nome:", error);
  }

  return null;
}

/**
 * Normaliza string removendo acentos, espaços extras e caracteres especiais
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9\s]/g, "") // Remove caracteres especiais
    .replace(/\s+/g, " ") // Normaliza espaços
    .trim();
}

/**
 * Calcula similaridade entre duas strings (Levenshtein distance)
 * Retorna percentual 0-100
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 100;

  const editDistance = getEditDistance(longer, shorter);
  return ((longer.length - editDistance) / longer.length) * 100;
}

/**
 * Calcula distância de edição (Levenshtein distance)
 */
function getEditDistance(s1: string, s2: string): number {
  const costs: number[] = [];

  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }

  return costs[s2.length];
}

/**
 * Agrupa resultados por status
 */
export function groupMatchResults(results: MatchResult[]): {
  new: MatchResult[];
  update: MatchResult[];
  duplicate: MatchResult[];
  unknown: MatchResult[];
} {
  return {
    new: results.filter(r => r.matchStatus === "new"),
    update: results.filter(r => r.matchStatus === "update"),
    duplicate: results.filter(r => r.matchStatus === "duplicate"),
    unknown: results.filter(r => r.matchStatus === "unknown"),
  };
}
