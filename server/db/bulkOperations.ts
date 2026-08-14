import { inArray, sql } from "drizzle-orm";
import { products } from "../../drizzle/schema";
import { getDb } from "./_client";

/**
 * Campos permitidos na edição em lote (alinhados ao schema Zod de bulkUpdate).
 * freightValue e taxValue são decimais; o helper converte string→number quando aplicável.
 */
export type BulkUpdateData = Partial<{
  supplierId: number;
  categoryId: number;
  name: string;
  code: string;
  activeIngredient: string;
  manufacturer: string;
  concentration: string;
  presentation: string;
  pharmaceuticalForm: string;
  unit: string;
  price: string;
  priceUnit: string;
  mapa: string;
  barcode: string;
  description: string;
  imageUrl: string;
  productUrl: string;
  stock: string;
  isActive: "yes" | "no";
  priceAdjustPercent: number; // positive = increase, negative = decrease
  fichaTecnica: string | null;
  codigoFornecedor: string | null;
  ean: string | null;
  gtin: string | null;
  subcategoria: string | null;
  registroRegulatorio: "MAPA" | "ANVISA" | "FORN" | null;
  laboratorio: string | null;
  nomeProduto: string | null;
  informacaoTecnica: string | null;
  freightValue: string | number | null;
  taxValue: string | number | null;
}>;

/**
 * Campos cujos valores podem ser limpos (SET NULL / valor vazio) de forma
 * explícita, sem confundir "vazio" com "não alterar". Recebidos como
 * `clearFields: string[]` no router.
 */
const CLEARABLE_FIELDS = [
  "name",
  "code",
  "barcode",
  "activeIngredient",
  "manufacturer",
  "concentration",
  "presentation",
  "pharmaceuticalForm",
  "unit",
  "description",
  "mapa",
  "imageUrl",
  "productUrl",
  "stock",
  "codigoFornecedor",
  "informacaoTecnica",
  "ean",
  "gtin",
  "subcategoria",
  "laboratorio",
  "nomeProduto",
  "fichaTecnica",
  "price",
  "priceUnit",
] as const;

/**
 * Edição em lote ATUAL + LIMPEZA EXPLÍCITA de campos, totalmente set-based
 * (sem loop produto a produto). priceAdjustPercent também é set-based.
 * Retorna o número de produtos atualizados.
 */
export async function bulkUpdateProducts(
  ids: number[],
  data: BulkUpdateData,
  opts?: { clearFields?: string[] }
): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;

  const setRows: Record<string, unknown> = {};

  // Campos com valor informado (alteração)
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (key === "priceAdjustPercent") continue; // tratado separadamente (set-based)
    if (key === "freightValue" || key === "taxValue") {
      const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
      setRows[key] = isNaN(n) ? null : n;
    } else {
      setRows[key] = value;
    }
  }

  // Limpeza explícita de campos (NULL), apenas campos permitidos
  const clearFields = (opts?.clearFields ?? []).filter((f) =>
    (CLEARABLE_FIELDS as readonly string[]).includes(f)
  );
  for (const f of clearFields) {
    setRows[f] = null;
  }

  if (Object.keys(setRows).length > 0) {
    await db.update(products).set(setRows as any).where(inArray(products.id, ids));
  }

  // Ajuste percentual de preço set-based (uma única instrução SQL)
  if (data.priceAdjustPercent !== undefined && data.priceAdjustPercent !== 0) {
    const factor = 1 + data.priceAdjustPercent / 100;
    await db
      .update(products)
      .set({ price: sql`ROUND(${products.price} * ${factor}, 2)` })
      .where(inArray(products.id, ids));
  }

  return ids.length;
}

/**
 * Arquivamento em massa (soft-delete): preserva preços, histórico e referências.
 */
export async function bulkArchiveProducts(ids: number[]): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;
  await db.update(products).set({ isActive: "no" }).where(inArray(products.id, ids));
  return ids.length;
}

/**
 * Reativação em lote de produtos arquivados.
 */
export async function bulkReactivateProducts(ids: number[]): Promise<number> {
  const db = await getDb();
  if (!db || ids.length === 0) return 0;
  await db.update(products).set({ isActive: "yes" }).where(inArray(products.id, ids));
  return ids.length;
}

// Qualidade server-side (critério de "incompleto") é implementada em
// server/db/products.ts (listProducts.incomplete) para preservar total/paginação
// corretos no list, e o mesmo critério QUALITY_FIELDS do frontend Produtos.tsx.
