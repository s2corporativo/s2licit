import { and, asc, eq, gt, like } from "drizzle-orm";
import { products } from "../../drizzle/schema";
import { getDb } from "./_client";

/** Search products by partial name (case-insensitive), returning id, name, manufacturer, imageUrl */
export async function searchProductsByName(nameTerm: string, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      manufacturer: products.manufacturer,
      supplierId: products.supplierId,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .where(like(products.name, `%${nameTerm}%`))
    .orderBy(asc(products.name))
    .limit(limit);
  return rows;
}

/** Busca um produto ativo pelo código CATMAS (Compras MG). */
export async function findProductByCatmas(code: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: products.id, name: products.name, price: products.price })
    .from(products)
    .where(eq(products.catmasCode, code))
    .limit(1);
  return rows[0] ?? null;
}

/** Busca um produto ativo pelo código CATMAT (federal). */
export async function findProductByCatmat(code: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: products.id, name: products.name, price: products.price })
    .from(products)
    .where(eq(products.catmatCode, code))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Retorna id/nome/preço de TODOS os produtos ativos (para matching por nome).
 *
 * Paginação em vez de limit arbitrário: o corte fixo de 20.000 registros
 * excluía silenciosamente milhares de produtos ativos do cruzamento de
 * cotações (catálogo real: 32.318 ativos em ago/2026). A paginação em
 * blocos de 5.000 evita sobrecarregar a memória e garante cobertura total,
 * com ordenação por id para não depender de ordem implícita.
 */
export async function listProductsForMatching(): Promise<
  Array<{ id: number; name: string; price: string | null }>
> {
  const db = await getDb();
  if (!db) return [];
  const PAGE = 5000;
  const all: Array<{ id: number; name: string; price: string | null }> = [];
  let lastId = 0;
  for (;;) {
    const rows = await db
      .select({ id: products.id, name: products.name, price: products.price })
      .from(products)
      .where(and(eq(products.isActive, "yes"), gt(products.id, lastId)))
      .orderBy(asc(products.id))
      .limit(PAGE);
    all.push(...rows);
    if (rows.length < PAGE) break; // última página
    lastId = rows[rows.length - 1].id;
  }
  return all;
}

/** Apply an imageUrl to all products whose name contains nameTerm */
export async function applyImageByName(nameTerm: string, imageUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db
    .update(products)
    .set({ imageUrl })
    .where(like(products.name, `%${nameTerm}%`));
  return { updated: (result as any)[0]?.affectedRows ?? 0 };
}

// ─── Image URL Auto-Linking ────────────────────────────────────────────────────

/**
 * Extrai tokens de nome de uma URL de imagem.
 * Ex: "https://cdn.site.com/produtos/ivermectina-1-pour-on-5l.jpg"
 *   → ["ivermectina", "1", "pour", "on", "5l"]
 */
export function extractTokensFromUrl(url: string): string[] {
  try {
    const parsed = new URL(url);
    // Pega o último segmento do pathname (nome do arquivo)
    const segments = parsed.pathname.split("/").filter(Boolean);
    const filename = segments[segments.length - 1] ?? "";
    // Remove extensão
    const base = filename.replace(/\.[a-z0-9]+$/i, "");
    // Divide por separadores comuns: -, _, ., +, %20, espaço
    const tokens = base
      .replace(/%20/g, " ")
      .replace(/[_\-+.]/g, " ")
      .split(/\s+/)
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length >= 2);
    return tokens;
  } catch {
    return [];
  }
}

/**
 * Dado um array de URLs de imagem (sem nome de produto associado),
 * tenta vincular cada URL a um produto pelo fuzzy match entre os tokens
 * extraídos da URL e os nomes dos produtos no banco.
 *
 * Retorna: { imageUrl, matchedProductId, matchedProductName, similarity, tokens }[]
 */
export async function autoLinkImageUrls(imageUrls: string[]): Promise<
  {
    imageUrl: string;
    tokens: string[];
    matchedProductId: number | null;
    matchedProductName: string | null;
    similarity: number;
  }[]
> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // Busca todos os produtos ativos (id, name)
  const allProducts = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.isActive, "yes"))
    .limit(10000);

  const { stringSimilarity } = await import("../fuzzy.js");

  const results = imageUrls.map((url) => {
    const tokens = extractTokensFromUrl(url);
    if (tokens.length === 0) {
      return { imageUrl: url, tokens, matchedProductId: null, matchedProductName: null, similarity: 0 };
    }

    // Monta uma string de busca com os tokens
    const searchStr = tokens.join(" ");

    let bestMatch: { id: number; name: string; similarity: number } | null = null;

    for (const p of allProducts) {
      const sim = stringSimilarity(searchStr, p.name);
      if (!bestMatch || sim > bestMatch.similarity) {
        bestMatch = { id: p.id, name: p.name, similarity: sim };
      }
    }

    if (bestMatch && bestMatch.similarity >= 0.7) {
      return {
        imageUrl: url,
        tokens,
        matchedProductId: bestMatch.id,
        matchedProductName: bestMatch.name,
        similarity: bestMatch.similarity,
      };
    }
    return { imageUrl: url, tokens, matchedProductId: null, matchedProductName: null, similarity: bestMatch?.similarity ?? 0 };
  });

  return results;
}

/**
 * Aplica as URLs de imagem nos produtos correspondentes (em lote).
 * Recebe array de { productId, imageUrl }.
 */
export async function bulkApplyImageUrls(
  items: { productId: number; imageUrl: string }[]
): Promise<{ updated: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  let updated = 0;
  for (const item of items) {
    await db.update(products).set({ imageUrl: item.imageUrl }).where(eq(products.id, item.productId));
    updated++;
  }
  return { updated };
}
