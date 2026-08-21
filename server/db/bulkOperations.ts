import { and, inArray, isNull, sql } from "drizzle-orm";
import { products } from "../../drizzle/schema";
import { getDb } from "./_client";

const BULK_CHUNK_SIZE = 500;

function uniqueIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
}

function chunks<T>(items: T[], size = BULK_CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function affectedRows(result: unknown): number {
  return Number((result as any)?.[0]?.affectedRows ?? 0);
}

/** Campos permitidos na edição em lote (alinhados ao schema Zod de bulkUpdate). */
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
  priceAdjustPercent: number;
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
  "freightValue",
  "taxValue",
] as const;

/**
 * Edição em lote set-based. Para catálogos grandes usa chunks de 500 dentro
 * de UMA transação: evita listas IN gigantes sem perder atomicidade.
 */
export async function bulkUpdateProducts(
  ids: number[],
  data: BulkUpdateData,
  opts?: { clearFields?: string[] },
): Promise<number> {
  const db = await getDb();
  const targetIds = uniqueIds(ids);
  if (!db || targetIds.length === 0) return 0;

  const setRows: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || key === "priceAdjustPercent") continue;
    if (key === "freightValue" || key === "taxValue") {
      const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
      if (!Number.isFinite(n)) throw new Error(`Valor inválido para ${key}`);
      setRows[key] = n;
    } else {
      setRows[key] = value;
    }
  }

  const clearFields = (opts?.clearFields ?? []).filter((field) =>
    (CLEARABLE_FIELDS as readonly string[]).includes(field),
  );
  for (const field of clearFields) setRows[field] = null;

  const factor = data.priceAdjustPercent !== undefined && data.priceAdjustPercent !== 0
    ? 1 + data.priceAdjustPercent / 100
    : null;
  if (factor !== null && factor <= 0) throw new Error("Ajuste percentual resultaria em preço zero ou negativo.");

  await db.transaction(async (tx) => {
    for (const group of chunks(targetIds)) {
      if (Object.keys(setRows).length > 0) {
        await tx.update(products).set(setRows as any).where(inArray(products.id, group));
      }
      if (factor !== null) {
        await tx
          .update(products)
          .set({ price: sql`ROUND(${products.price} * ${factor}, 2)` })
          .where(inArray(products.id, group));
      }
    }
  });

  return targetIds.length;
}

/** Arquivamento reversível: preserva histórico e referências. */
export async function bulkArchiveProducts(ids: number[]): Promise<number> {
  const db = await getDb();
  const targetIds = uniqueIds(ids);
  if (!db || targetIds.length === 0) return 0;

  let affected = 0;
  await db.transaction(async (tx) => {
    for (const group of chunks(targetIds)) {
      const result = await tx
        .update(products)
        .set({ isActive: "no", deletedAt: new Date() })
        .where(inArray(products.id, group));
      affected += affectedRows(result);
    }
  });
  return affected;
}

/**
 * Reativação em lote. Produtos desativados por merge canônico NÃO podem ser
 * reativados por esta ação, pois mantêm mergedIntoId apontando para o mestre.
 */
export async function bulkReactivateProducts(ids: number[]): Promise<number> {
  const db = await getDb();
  const targetIds = uniqueIds(ids);
  if (!db || targetIds.length === 0) return 0;

  let affected = 0;
  await db.transaction(async (tx) => {
    for (const group of chunks(targetIds)) {
      const result = await tx
        .update(products)
        .set({ isActive: "yes", deletedAt: null })
        .where(and(inArray(products.id, group), isNull(products.mergedIntoId)));
      affected += affectedRows(result);
    }
  });
  return affected;
}

export const __bulkTest = { uniqueIds, chunks, CLEARABLE_FIELDS, BULK_CHUNK_SIZE };
