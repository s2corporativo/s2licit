import { and, eq, like } from "drizzle-orm";
import { MasterProduct, categories, masterProducts, products } from "../../drizzle/schema";
import { getDb } from "./_client";

import { isSameProduct } from "../fuzzy";

/**
 * Reconhecimento inteligente com fuzzy matching (Jaro-Winkler ≥ 85%).
 * Busca candidatos na base mestre pelo nome e aplica matching combinado.
 */
export async function fuzzyMatchProductInMaster(input: {
  name: string;
  ean?: string | null;
  codigoMapa?: string | null;
  concentration?: string | null;
  presentation?: string | null;
}): Promise<{
  matched: boolean;
  masterProduct: MasterProduct | null;
  matchedBy: string | null;
  similarity: number;
}> {
  const db = await getDb();
  if (!db || !input.name?.trim()) {
    return { matched: false, masterProduct: null, matchedBy: null, similarity: 0 };
  }

  // Busca candidatos com LIKE no início do nome (primeiras 4 letras)
  const prefix = input.name.trim().slice(0, 4);
  const candidates = await db
    .select()
    .from(masterProducts)
    .where(like(masterProducts.name, `${prefix}%`))
    .limit(100);

  // Também busca por EAN se disponível
  if (input.ean?.trim()) {
    const byEan = await db
      .select()
      .from(masterProducts)
      .where(like(masterProducts.ean, input.ean.trim()))
      .limit(5);
    for (const p of byEan) {
      if (!candidates.find((c) => c.id === p.id)) candidates.push(p);
    }
  }

  let bestMatch: MasterProduct | null = null;
  let bestSimilarity = 0;
  let bestMatchedBy: string | null = null;

  for (const candidate of candidates) {
    const result = isSameProduct(
      {
        name: input.name,
        ean: input.ean,
        codigoMapa: input.codigoMapa,
        concentration: input.concentration,
        presentation: input.presentation,
      },
      {
        name: candidate.name,
        ean: candidate.ean,
        codigoMapa: candidate.codigoMapa,
        concentration: candidate.concentration,
        presentation: candidate.presentation,
      }
    );

    if (result.matched && result.similarity > bestSimilarity) {
      bestSimilarity = result.similarity;
      bestMatch = candidate;
      bestMatchedBy = result.matchedBy;
    }
  }

  return {
    matched: bestMatch !== null,
    masterProduct: bestMatch,
    matchedBy: bestMatchedBy,
    similarity: bestSimilarity,
  };
}

/**
 * Enriquece uma linha de importação com dados da base mestre.
 * Preenche campos vazios automaticamente (composição, categoria, marca).
 */
export async function enrichImportRow(row: Record<string, string>): Promise<{
  status: "match" | "new";
  matchedBy: string | null;
  similarity: number;
  enriched: Record<string, string | null>;
  masterProduct: MasterProduct | null;
}> {
  const name = (row["name"] || row["nome"] || row["nome_produto"] || "").trim();
  if (!name) {
    return { status: "new", matchedBy: null, similarity: 0, enriched: {}, masterProduct: null };
  }

  const inputEan = (row["ean"] || row["barcode"] || row["codigo_barras"] || "").trim() || null;
  const inputMapa = (row["codigoMapa"] || row["registro_mapa"] || row["mapa"] || "").trim() || null;
  const inputConc = (row["concentration"] || row["concentracao"] || row["forma_concentracao"] || "").trim() || null;
  const inputPres = (row["presentation"] || row["apresentacao"] || "").trim() || null;
  const inputIngredient = (row["activeIngredient"] || row["composicao"] || row["principio_ativo"] || "").trim() || null;
  const inputManufacturer = (row["manufacturer"] || row["marca"] || row["fabricante"] || "").trim() || null;
  const inputCategory = (row["categoryName"] || row["categoria"] || "").trim() || null;

  const { matched, masterProduct, matchedBy, similarity } = await fuzzyMatchProductInMaster({
    name,
    ean: inputEan,
    codigoMapa: inputMapa,
    concentration: inputConc,
    presentation: inputPres,
  });

  // Mescla: campos técnicos da base mestre preenchem lacunas da planilha
  const enriched: Record<string, string | null> = {
    name: masterProduct?.name ?? name,
    activeIngredient: inputIngredient || masterProduct?.activeIngredient || null,
    manufacturer: inputManufacturer || masterProduct?.manufacturer || null,
    concentration: inputConc || masterProduct?.concentration || null,
    presentation: inputPres || masterProduct?.presentation || null,
    categoryName: inputCategory || masterProduct?.categoryName || null,
    ean: inputEan || masterProduct?.ean || null,
    codigoMapa: inputMapa || masterProduct?.codigoMapa || null,
  };

  return {
    status: matched ? "match" : "new",
    matchedBy,
    similarity,
    enriched,
    masterProduct: masterProduct ?? null,
  };
}

/**
 * Pré-visualização de importação em lote com fuzzy matching.
 * Busca na base mestre E no catálogo de produtos do fornecedor (se supplierId fornecido).
 */
export async function previewImportRowsFuzzy(
  rows: Array<Record<string, string>>,
  supplierId?: number
): Promise<Array<{
  rowIndex: number;
  inputName: string;
  status: "match" | "new";
  matchedBy: string | null;
  similarity: number;
  masterProduct: MasterProduct | null;
  enriched: Record<string, string | null>;
  suggestedCategory?: string | null;
}>> {
  // Pré-carrega produtos do catálogo para matching em memória (evita N+1 queries)
  const db = await getDb();
  let catalogProducts: Array<{
    id: number; name: string; activeIngredient: string | null;
    concentration: string | null; presentation: string | null;
    manufacturer: string | null; barcode: string | null;
    categoryName: string | null;
  }> = [];
  if (db) {
    const whereClause = supplierId
      ? and(eq(products.isActive, "yes"), eq(products.supplierId, supplierId))
      : eq(products.isActive, "yes");
    catalogProducts = await db
      .select({
        id: products.id,
        name: products.name,
        activeIngredient: products.activeIngredient,
        concentration: products.concentration,
        presentation: products.presentation,
        manufacturer: products.manufacturer,
        barcode: products.barcode,
        categoryName: categories.name,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(whereClause)
      .limit(5000) as any;
  }
  const { jaroWinkler, normalizeStr } = await import("../fuzzy");
  const results = [];
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i];
    const name = (row["name"] || row["nome"] || row["nome_produto"] || "").trim();
    if (!name) continue;
    // 1. Tenta base mestre primeiro
    const masterResult = await enrichImportRow(row);
    if (masterResult.status === "match") {
      results.push({ rowIndex: i, inputName: name, ...masterResult });
      continue;
    }
    // 2. Tenta catálogo de produtos com Jaro-Winkler
    const normInput = normalizeStr(name);
    let bestCatalogMatch: typeof catalogProducts[0] | null = null;
    let bestSim = 0;
    for (const p of catalogProducts) {
      const sim = jaroWinkler(normInput, normalizeStr(p.name));
      if (sim > bestSim) { bestSim = sim; bestCatalogMatch = p; }
    }
    if (bestSim >= 0.82 && bestCatalogMatch) {
      const inputConc = (row["concentration"] || row["concentracao"] || "").trim() || null;
      const inputPres = (row["presentation"] || row["apresentacao"] || "").trim() || null;
      // Verifica se concentração/apresentação são compatíveis (produtos distintos = manter)
      const concMatch = !inputConc || !bestCatalogMatch.concentration ||
        normalizeStr(inputConc) === normalizeStr(bestCatalogMatch.concentration);
      const presMatch = !inputPres || !bestCatalogMatch.presentation ||
        normalizeStr(inputPres) === normalizeStr(bestCatalogMatch.presentation);
      if (concMatch && presMatch) {
        results.push({
          rowIndex: i,
          inputName: name,
          status: "match" as const,
          matchedBy: "catalog_fuzzy",
          similarity: bestSim,
          masterProduct: null,
          enriched: {
            name: bestCatalogMatch.name,
            activeIngredient: (row["activeIngredient"] || row["composicao"] || "") || bestCatalogMatch.activeIngredient,
            manufacturer: (row["manufacturer"] || row["fabricante"] || "") || bestCatalogMatch.manufacturer,
            concentration: inputConc || bestCatalogMatch.concentration,
            presentation: inputPres || bestCatalogMatch.presentation,
            categoryName: bestCatalogMatch.categoryName,
            ean: (row["ean"] || row["barcode"] || "") || bestCatalogMatch.barcode,
          },
          suggestedCategory: bestCatalogMatch.categoryName,
        });
        continue;
      }
    }
    // 3. Produto novo — retorna dados brutos sem enriquecimento
    results.push({
      rowIndex: i,
      inputName: name,
      status: "new" as const,
      matchedBy: null,
      similarity: bestSim,
      masterProduct: null,
      enriched: masterResult.enriched,
      suggestedCategory: null,
    });
  }
  return results;
}
