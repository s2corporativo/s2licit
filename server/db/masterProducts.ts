import { and, asc, eq, like, or } from "drizzle-orm";
import { MasterProduct, masterProducts, products, suppliers } from "../../drizzle/schema";
import { matches, normalize } from "./_helpers";
import { getDb } from "./_client";

/**
 * Normaliza uma string para comparação: maiúsculas, sem acentos, sem espaços extras.
 */


export type MatchResult = {
  matched: boolean;
  masterProduct: MasterProduct | null;
  matchedBy: "ean" | "codigoMapa" | "concentration" | "presentation" | null;
};

/**
 * Reconhecimento inteligente: dado um nome + pelo menos uma característica,
 * localiza o produto correspondente na base mestre.
 * Retorna o produto encontrado e o campo que gerou o match.
 */
export async function matchProductInMaster(input: {
  name: string;
  ean?: string | null;
  codigoMapa?: string | null;
  concentration?: string | null;
  presentation?: string | null;
}): Promise<MatchResult> {
  const db = await getDb();
  if (!db) return { matched: false, masterProduct: null, matchedBy: null };

  const normName = normalize(input.name);
  if (!normName) return { matched: false, masterProduct: null, matchedBy: null };

  // Busca candidatos pelo nome (LIKE case-insensitive)
  const candidates = await db
    .select()
    .from(masterProducts)
    .where(like(masterProducts.name, `%${input.name.trim()}%`))
    .limit(20);

  // Filtra por nome normalizado exato
  const nameMatches = candidates.filter((c) => normalize(c.name) === normName);

  if (nameMatches.length === 0) return { matched: false, masterProduct: null, matchedBy: null };

  // Tenta match por EAN
  if (input.ean) {
    const m = nameMatches.find((c) => matches(c.ean, input.ean));
    if (m) return { matched: true, masterProduct: m, matchedBy: "ean" };
  }
  // Tenta match por Código MAPA
  if (input.codigoMapa) {
    const m = nameMatches.find((c) => matches(c.codigoMapa, input.codigoMapa));
    if (m) return { matched: true, masterProduct: m, matchedBy: "codigoMapa" };
  }
  // Tenta match por Concentração
  if (input.concentration) {
    const m = nameMatches.find((c) => matches(c.concentration, input.concentration));
    if (m) return { matched: true, masterProduct: m, matchedBy: "concentration" };
  }
  // Tenta match por Apresentação
  if (input.presentation) {
    const m = nameMatches.find((c) => matches(c.presentation, input.presentation));
    if (m) return { matched: true, masterProduct: m, matchedBy: "presentation" };
  }

  // Se só há um candidato com nome exato e nenhuma característica foi fornecida, retorna ele
  if (nameMatches.length === 1 && !input.ean && !input.codigoMapa && !input.concentration && !input.presentation) {
    return { matched: true, masterProduct: nameMatches[0], matchedBy: null };
  }

  return { matched: false, masterProduct: null, matchedBy: null };
}

/**
 * Pré-visualização de importação: recebe as linhas brutas e retorna
 * para cada linha se é um produto existente (match) ou novo cadastro,
 * além dos dados enriquecidos da base mestre.
 */
export type ImportPreviewRow = {
  rowIndex: number;
  inputName: string;
  status: "match" | "new";
  matchedBy: string | null;
  masterProduct: MasterProduct | null;
  // Dados finais que serão usados (mesclados com base mestre)
  enriched: {
    name: string;
    activeIngredient: string | null;
    manufacturer: string | null;
    concentration: string | null;
    presentation: string | null;
    categoryName: string | null;
    ean: string | null;
    codigoMapa: string | null;
  };
};

export async function previewImportRows(
  rows: Array<Record<string, string>>
): Promise<ImportPreviewRow[]> {
  const results: ImportPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = (row["name"] || row["nome"] || row["nome_produto"] || "").trim();
    if (!name) continue;

    const inputEan = (row["ean"] || row["barcode"] || row["codigo_barras"] || "").trim() || null;
    const inputMapa = (row["codigoMapa"] || row["registro_mapa"] || row["mapa"] || "").trim() || null;
    const inputConc = (row["concentration"] || row["concentracao"] || row["forma_concentracao"] || "").trim() || null;
    const inputPres = (row["presentation"] || row["apresentacao"] || "").trim() || null;
    const inputIngredient = (row["activeIngredient"] || row["composicao"] || row["principio_ativo"] || "").trim() || null;
    const inputManufacturer = (row["manufacturer"] || row["marca"] || row["fabricante"] || "").trim() || null;
    const inputCategory = (row["categoryName"] || row["categoria"] || "").trim() || null;

    const { matched, masterProduct, matchedBy } = await matchProductInMaster({
      name,
      ean: inputEan,
      codigoMapa: inputMapa,
      concentration: inputConc,
      presentation: inputPres,
    });

    // Mescla: dados da base mestre têm prioridade para campos técnicos;
    // preço e fornecedor sempre vêm da planilha nova.
    const enriched = {
      name: masterProduct?.name ?? name,
      activeIngredient: inputIngredient || masterProduct?.activeIngredient || null,
      manufacturer: inputManufacturer || masterProduct?.manufacturer || null,
      concentration: inputConc || masterProduct?.concentration || null,
      presentation: inputPres || masterProduct?.presentation || null,
      categoryName: inputCategory || masterProduct?.categoryName || null,
      ean: inputEan || masterProduct?.ean || null,
      codigoMapa: inputMapa || masterProduct?.codigoMapa || null,
    };

    results.push({
      rowIndex: i,
      inputName: name,
      status: matched ? "match" : "new",
      matchedBy: matchedBy,
      masterProduct: masterProduct ?? null,
      enriched,
    });
  }

  return results;
}

/**
 * Lista produtos da base mestre com busca opcional.
 */
export async function listMasterProducts(search?: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(masterProducts);
  if (search) {
    return q
      .where(
        or(
          like(masterProducts.name, `%${search}%`),
          like(masterProducts.activeIngredient, `%${search}%`)
        )
      )
      .orderBy(asc(masterProducts.name))
      .limit(limit);
  }
  return q.orderBy(asc(masterProducts.name)).limit(limit);
}

/**
 * Busca produto por nome exato na base mestre.
 */
export async function getMasterProductByName(name: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(masterProducts)
    .where(like(masterProducts.name, name.trim()))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Busca produtos da base mestre por parte do nome — para autocomplete.
 */
export async function searchMasterProducts(query: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(masterProducts)
    .where(like(masterProducts.name, `%${query}%`))
    .orderBy(asc(masterProducts.name))
    .limit(limit);
}

/**
 * Busca todos os produtos cadastrados (de todos os fornecedores) que correspondem
 * a um produto da base mestre, retornando o menor preço primeiro.
 */
export async function getProductPricesByMasterName(masterName: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      priceUnit: products.priceUnit,
      supplierId: products.supplierId,
      supplierName: suppliers.name,
      concentration: products.concentration,
      presentation: products.presentation,
      manufacturer: products.manufacturer,
      barcode: products.barcode,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(
      and(
        eq(products.isActive, "yes"),
        like(products.name, `%${masterName.trim()}%`)
      )
    )
    .orderBy(asc(products.price))
    .limit(50);
}
