import { getDb } from "../db";
import { suppliers, products } from "../../drizzle/schema";
import { eq, and, like } from "drizzle-orm";

export interface PriceRow {
  productName: string;
  productCode?: string;
  ean?: string;
  price: number;
  unit?: string;
  notes?: string;
}

export interface PriceImportPreview {
  totalRows: number;
  matchedProducts: number;
  newProducts: number;
  priceUpdates: number;
  conflicts: number;
  rows: Array<{
    index: number;
    productName: string;
    productCode?: string;
    ean?: string;
    price: number;
    status: "matched" | "new" | "conflict";
    matchedProductId?: number;
    matchedProductName?: string;
    currentPrice?: number;
    priceChange?: number;
    priceChangePercent?: number;
    notes?: string;
  }>;
}

export interface SupplierDetectionResult {
  supplierId: number;
  supplierName: string;
  confidence: "high" | "medium" | "low";
  detectionMethod: "name" | "pattern" | "manual";
}

/**
 * Detecta o fornecedor a partir do nome do arquivo ou conteúdo da planilha
 */
export async function detectSupplierFromFile(
  fileName: string,
  firstRows?: PriceRow[]
): Promise<SupplierDetectionResult | null> {
  const db = await getDb();
  if (!db) return null;

  // Extrair nome do fornecedor do nome do arquivo
  // Exemplo: "Fornecedor_ABC_Precos_2024.xlsx" -> "ABC"
  const fileNameLower = fileName.toLowerCase();
  const suppliersList = await db.select().from(suppliers);

  // Tentar encontrar fornecedor pelo nome do arquivo
  for (const supplier of suppliersList) {
    const supplierNameLower = supplier.name.toLowerCase();
    if (fileNameLower.includes(supplierNameLower)) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        confidence: "high",
        detectionMethod: "name",
      };
    }

    // Tentar encontrar por padrão (primeiras letras)
    const initials = supplier.name
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .toLowerCase();
    if (fileNameLower.includes(initials)) {
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        confidence: "medium",
        detectionMethod: "pattern",
      };
    }
  }

  return null;
}

/**
 * Faz matching de produtos por nome, EAN ou código do fornecedor
 */
export async function matchProductByIdentifier(
  productName: string,
  ean?: string,
  productCode?: string
): Promise<{ id: number; name: string } | null> {
  const db = await getDb();
  if (!db) return null;

  // Primeiro, tentar match por EAN
  if (ean) {
    const byEan = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.ean, ean))
      .limit(1);

    if (byEan.length > 0) {
      return { id: byEan[0].id, name: byEan[0].name };
    }
  }

  // Depois, tentar match por código do fornecedor
  if (productCode) {
    const byCode = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.codigoFornecedor, productCode))
      .limit(1);

    if (byCode.length > 0) {
      return { id: byCode[0].id, name: byCode[0].name };
    }
  }

  // Finalmente, tentar match por nome (fuzzy)
  const byName = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(like(products.name, `%${productName}%`))
    .limit(1);

  if (byName.length > 0) {
    return { id: byName[0].id, name: byName[0].name };
  }

  return null;
}

/**
 * Cria preview de importação de preços
 */
export async function previewPriceImport(
  rows: PriceRow[],
  supplierId: number
): Promise<PriceImportPreview> {
  const db = await getDb();
  if (!db) {
    return {
      totalRows: rows.length,
      matchedProducts: 0,
      newProducts: 0,
      priceUpdates: 0,
      conflicts: 0,
      rows: [],
    };
  }

  const previewRows = [];
  let matchedCount = 0;
  let newCount = 0;
  let updateCount = 0;
  let conflictCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Tentar fazer matching do produto
    const matchedProduct = await matchProductByIdentifier(
      row.productName,
      row.ean,
      row.productCode
    );

    if (!matchedProduct) {
      // Produto novo
      newCount++;
      previewRows.push({
        index: i,
        productName: row.productName,
        productCode: row.productCode,
        ean: row.ean,
        price: row.price,
        status: "new" as const,
        notes: "Novo produto será criado",
      });
    } else {
      // Produto encontrado - verificar preço atual
      const currentProduct = await db
        .select({ price: products.price })
        .from(products)
        .where(eq(products.id, matchedProduct.id))
        .limit(1);

      if (currentProduct.length > 0 && currentProduct[0].price) {
        // Preço existente - será atualizado
        const oldPrice = parseFloat(currentProduct[0].price as any);
        const priceChange = row.price - oldPrice;
        const priceChangePercent = (priceChange / oldPrice) * 100;

        updateCount++;
        previewRows.push({
          index: i,
          productName: row.productName,
          productCode: row.productCode,
          ean: row.ean,
          price: row.price,
          status: "matched" as const,
          matchedProductId: matchedProduct.id,
          matchedProductName: matchedProduct.name,
          currentPrice: oldPrice,
          priceChange,
          priceChangePercent,
          notes: `Preço será atualizado de R$ ${oldPrice.toFixed(2)} para R$ ${row.price.toFixed(2)} (${priceChangePercent > 0 ? "+" : ""}${priceChangePercent.toFixed(1)}%)`,
        });
      } else {
        // Produto existe mas sem preço
        matchedCount++;
        previewRows.push({
          index: i,
          productName: row.productName,
          productCode: row.productCode,
          ean: row.ean,
          price: row.price,
          status: "matched" as const,
          matchedProductId: matchedProduct.id,
          matchedProductName: matchedProduct.name,
          notes: `Novo preço será adicionado para este produto`,
        });
      }
    }
  }

  return {
    totalRows: rows.length,
    matchedProducts: matchedCount,
    newProducts: newCount,
    priceUpdates: updateCount,
    conflicts: conflictCount,
    rows: previewRows,
  };
}

/**
 * Importa preços selecionados para o banco de dados
 */
export async function importPricesWithSupplier(
  rows: PriceRow[],
  supplierId: number,
  selectedIndexes: number[]
): Promise<{
  success: boolean;
  imported: number;
  failed: number;
  errors: Array<{ index: number; error: string }>;
}> {
  const db = await getDb();
  if (!db) {
    return {
      success: false,
      imported: 0,
      failed: selectedIndexes.length,
      errors: selectedIndexes.map((idx) => ({
        index: idx,
        error: "Database connection failed",
      })),
    };
  }

  const errors: Array<{ index: number; error: string }> = [];
  let imported = 0;

  for (const index of selectedIndexes) {
    if (index < 0 || index >= rows.length) {
      errors.push({ index, error: "Invalid row index" });
      continue;
    }

    const row = rows[index];

    try {
      // Fazer matching do produto
      const matchedProduct = await matchProductByIdentifier(
        row.productName,
        row.ean,
        row.productCode
      );

      if (!matchedProduct) {
        // Criar novo produto
        const result = await db
          .insert(products)
          .values({
            name: row.productName,
            ean: row.ean,
            codigoFornecedor: row.productCode,
            price: row.price.toString(),
            supplierId,
          });
        
        // Obter o ID do produto inserido
        const newProduct = await db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.name, row.productName))
          .limit(1);

        if (newProduct.length === 0) {
          throw new Error("Failed to create product");
        }

        imported++;
      } else {
        // Atualizar preço do produto existente
        await db
          .update(products)
          .set({ price: row.price.toString() })
          .where(eq(products.id, matchedProduct.id));

        imported++;
      }
    } catch (error) {
      errors.push({
        index,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    success: errors.length === 0,
    imported,
    failed: errors.length,
    errors,
  };
}

/**
 * Extrai dados de preço de uma planilha (CSV/XLSX)
 */
export function extractPriceRowsFromSpreadsheet(data: any[][]): PriceRow[] {
  if (data.length < 2) return [];

  const headers = (data[0] as any[]).map((h) => h?.toString().toLowerCase().trim() || "");

  // Encontrar índices das colunas
  const productNameIdx = headers.findIndex(
    (h) => h.includes("produto") || h.includes("nome") || h.includes("product")
  );
  const priceIdx = headers.findIndex(
    (h) =>
      h.includes("preço") ||
      h.includes("preco") ||
      h.includes("price") ||
      h.includes("valor")
  );
  const eanIdx = headers.findIndex((h) => h.includes("ean") || h.includes("sku"));
  const codeIdx = headers.findIndex(
    (h) => h.includes("código") || h.includes("codigo") || h.includes("code")
  );
  const unitIdx = headers.findIndex(
    (h) => h.includes("unidade") || h.includes("unit")
  );

  if (productNameIdx === -1 || priceIdx === -1) {
    return [];
  }

  const rows: PriceRow[] = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i] as any[];

    const productName = (row[productNameIdx] as any)?.toString().trim();
    const priceStr = (row[priceIdx] as any)?.toString().trim();

    if (!productName || !priceStr) continue;

    const price = parseFloat(priceStr.replace(",", "."));
    if (isNaN(price)) continue;

    rows.push({
      productName,
      ean: eanIdx !== -1 ? (row[eanIdx] as any)?.toString().trim() : undefined,
      productCode: codeIdx !== -1 ? (row[codeIdx] as any)?.toString().trim() : undefined,
      unit: unitIdx !== -1 ? (row[unitIdx] as any)?.toString().trim() : undefined,
      price,
    });
  }

  return rows;
}
