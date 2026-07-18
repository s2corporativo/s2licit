import { and, eq } from "drizzle-orm";
import { InsertProduct, products, suppliers } from "../../drizzle/schema";
import { jaroWinklerSimilarity } from "../matching/productMatcher";
import { getDb } from "./_client";

export type DuplicateCheckResult = {
  rowIndex: number;
  name: string;
  fichaTecnica: string | null;
  presentation: string | null;
  status: "duplicate" | "new";
  existingId: number | null;
  existingName: string | null;
  existingFichaTecnica: string | null;
  existingPresentation: string | null;
  existingPrice: string | null;
  existingSupplierName: string | null;
};

export type SupplierCatalogRow = {
  id: number;
  name: string;
  fichaTecnica: string | null;
  presentation: string | null;
  price: string | null;
  supplierName: string | null;
  ean: string | null;
  gtin: string | null;
  barcode: string | null;
};

/**
 * Carrega o catálogo ativo de um fornecedor UMA vez, para reutilização entre
 * lotes de uma mesma importação (evita repetir o SELECT a cada 100 linhas).
 */
export async function loadSupplierCatalog(supplierId: number): Promise<SupplierCatalogRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: products.id,
      name: products.name,
      fichaTecnica: products.fichaTecnica,
      presentation: products.presentation,
      price: products.price,
      supplierName: suppliers.name,
      ean: products.ean,
      gtin: products.gtin,
      barcode: products.barcode,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(and(eq(products.supplierId, supplierId), eq(products.isActive, "yes")));
}

/**
 * Verifica cada linha da planilha contra a base de produtos pelo tripé
 * Nome (normalizado) + FichaTécnica + Apresentação.
 * Produtos com FichaTécnica ou Apresentação diferentes são considerados DISTINTOS.
 * Aceita o catálogo pré-carregado (loadSupplierCatalog) para não repetir a
 * consulta a cada lote.
 */
export async function checkDuplicatesInRows(
  rows: Array<{ name?: string; fichaTecnica?: string; presentation?: string; ean?: string }>,
  supplierId: number,
  preloadedCatalog?: SupplierCatalogRow[]
): Promise<DuplicateCheckResult[]> {
  const db = await getDb();
  if (!db) return rows.map((r, i) => ({
    rowIndex: i,
    name: r.name ?? "",
    fichaTecnica: r.fichaTecnica ?? null,
    presentation: r.presentation ?? null,
    status: "new" as const,
    existingId: null,
    existingName: null,
    existingFichaTecnica: null,
    existingPresentation: null,
    existingPrice: null,
    existingSupplierName: null,
  }));

  // Catálogo do fornecedor: usa o pré-carregado quando fornecido
  const existingProducts = preloadedCatalog ?? (await loadSupplierCatalog(supplierId));

  // Normaliza string para comparação (lowercase, sem acentos, sem espaços extras)
  const normalize = (s: string | null | undefined): string => {
    if (!s) return "";
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Normaliza EAN (apenas dígitos)
  const normalizeEan = (s: string | null | undefined): string => {
    if (!s) return "";
    return s.replace(/\D/g, "");
  };

  // Índice 1: por EAN (mais preciso)
  const eanIndex = new Map<string, typeof existingProducts[0]>();
  for (const p of existingProducts) {
    const ean = normalizeEan(p.ean ?? p.gtin ?? p.barcode);
    if (ean.length >= 8) eanIndex.set(ean, p);
  }

  // Índice 2: por tripé Nome|FichaTécnica|Apresentação (exato)
  // REGRA: produtos com FichaTécnica OU Apresentação diferentes são DISTINTOS
  const tripleIndex = new Map<string, typeof existingProducts[0]>();
  for (const p of existingProducts) {
    const key = `${normalize(p.name)}|${normalize(p.fichaTecnica)}|${normalize(p.presentation)}`;
    tripleIndex.set(key, p);
  }

  // Índice 3: por Nome normalizado (para fuzzy), com bucket por primeira
  // palavra — evita comparar cada linha contra o catálogo inteiro.
  const nameIndex = existingProducts.map(p => ({ ...p, normName: normalize(p.name) }));
  const firstWordBuckets = new Map<string, typeof nameIndex>();
  for (const p of nameIndex) {
    const fw = p.normName.split(" ")[0] ?? "";
    if (!fw) continue;
    const bucket = firstWordBuckets.get(fw);
    if (bucket) bucket.push(p); else firstWordBuckets.set(fw, [p]);
  }

  return rows.map((r, i) => {
    const name = r.name?.trim() ?? "";
    const fichaTecnica = r.fichaTecnica?.trim() ?? null;
    const presentation = r.presentation?.trim() ?? null;
    const eanNorm = normalizeEan(r.ean);

    // Prioridade 1: EAN exato
    if (eanNorm.length >= 8) {
      const match = eanIndex.get(eanNorm);
      if (match) {
        return {
          rowIndex: i, name, fichaTecnica, presentation,
          status: "duplicate" as const,
          existingId: match.id, existingName: match.name,
          existingFichaTecnica: match.fichaTecnica, existingPresentation: match.presentation,
          existingPrice: match.price, existingSupplierName: match.supplierName,
        };
      }
    }

    // Prioridade 2: Tripé exato Nome|FichaTécnica|Apresentação
    // Produtos com FichaTécnica ou Apresentação diferentes são DISTINTOS
    const key = `${normalize(name)}|${normalize(fichaTecnica)}|${normalize(presentation)}`;
    const tripleMatch = tripleIndex.get(key);
    if (tripleMatch) {
      return {
        rowIndex: i, name, fichaTecnica, presentation,
        status: "duplicate" as const,
        existingId: tripleMatch.id, existingName: tripleMatch.name,
        existingFichaTecnica: tripleMatch.fichaTecnica, existingPresentation: tripleMatch.presentation,
        existingPrice: tripleMatch.price, existingSupplierName: tripleMatch.supplierName,
      };
    }

    // Prioridade 3: Fuzzy por nome (Jaro-Winkler >= 0.92) + mesma FichaTécnica + mesma Apresentação
    // REGRA: se FichaTécnica OU Apresentação forem diferentes (e ambas preenchidas), são DISTINTOS
    if (name.length >= 4) {
      const normName = normalize(name);
      const normFicha = normalize(fichaTecnica);
      const normPres = normalize(presentation);
      let bestMatch: typeof existingProducts[0] | null = null;
      let bestScore = 0;
      const firstWord = normName.split(" ")[0] ?? "";
      const candidates = firstWordBuckets.get(firstWord) ?? nameIndex;
      for (const p of candidates) {
        const score = jaroWinklerSimilarity(normName, p.normName);
        if (score > bestScore) { bestScore = score; bestMatch = p; }
      }
      if (bestScore >= 0.92 && bestMatch) {
        const existingFicha = normalize(bestMatch.fichaTecnica);
        const existingPres = normalize(bestMatch.presentation);
        // FichaTécnica: se ambas preenchidas, devem ser iguais; se uma vazia, não bloqueia
        const fichaMatch = !normFicha || !existingFicha || normFicha === existingFicha;
        // Apresentação: se ambas preenchidas, devem ser iguais; se uma vazia, não bloqueia
        const presMatch = !normPres || !existingPres || existingPres === normPres;
        // Só é duplicata se AMBOS os campos coincidirem (ou estiverem vazios)
        if (fichaMatch && presMatch) {
          return {
            rowIndex: i, name, fichaTecnica, presentation,
            status: "duplicate" as const,
            existingId: bestMatch.id, existingName: bestMatch.name,
            existingFichaTecnica: bestMatch.fichaTecnica, existingPresentation: bestMatch.presentation,
            existingPrice: bestMatch.price, existingSupplierName: bestMatch.supplierName,
          };
        }
      }
    }

    return {
      rowIndex: i, name, fichaTecnica, presentation,
      status: "new" as const,
      existingId: null, existingName: null,
      existingFichaTecnica: null, existingPresentation: null,
      existingPrice: null, existingSupplierName: null,
    };
  });
}

export async function mergeProductFromRow(
  existingId: number,
  data: Partial<InsertProduct>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Remove campos undefined/null para não sobrescrever com vazio
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined && value !== "") {
      updateData[key] = value;
    }
  }
  if (Object.keys(updateData).length === 0) return;
  await db.update(products).set(updateData as any).where(eq(products.id, existingId));
}
