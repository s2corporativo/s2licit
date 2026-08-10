import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  priceHistory,
  productSupplierOffers,
  productSupplierPrices,
  products,
  suppliers,
} from "../../drizzle/schema";
import { logger } from "../_core/logger";
import { getDb } from "./_client";

export type SupplierPriceWrite = {
  productId: number;
  supplierId: number;
  price: string | null;
  codigoFornecedor?: string;
  linkProduto?: string;
  origem?: string;
};

type CanonicalOfferRow = {
  id: number;
  productId: number;
  supplierId: number;
  price: string | null;
  codigoFornecedor: string | null;
  linkProduto: string | null;
  updatedAt: Date | null;
  supplierName: string | null;
  promoPrice: string | null;
  stock: number | null;
  availability: string | null;
};

const WRITE_CHUNK_SIZE = 500;

function pairKey(productId: number, supplierId: number): string {
  return `${productId}:${supplierId}`;
}

function normalizePrice(price: string | null): string | null {
  if (price == null) return null;
  const normalized = price.trim().replace(",", ".");
  if (!/^\d{1,10}(?:\.\d{1,4})?$/.test(normalized)) {
    throw new Error(`Preço inválido: ${price}`);
  }
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Preço deve ser maior que zero: ${price}`);
  }
  return numeric.toFixed(2);
}

function normalizeWrite(entry: SupplierPriceWrite): SupplierPriceWrite {
  if (!Number.isInteger(entry.productId) || entry.productId <= 0) {
    throw new Error(`productId inválido: ${entry.productId}`);
  }
  if (!Number.isInteger(entry.supplierId) || entry.supplierId <= 0) {
    throw new Error(`supplierId inválido: ${entry.supplierId}`);
  }
  return {
    productId: entry.productId,
    supplierId: entry.supplierId,
    price: normalizePrice(entry.price),
    codigoFornecedor: entry.codigoFornecedor?.trim() || undefined,
    linkProduto: entry.linkProduto?.trim() || undefined,
    origem: entry.origem?.trim() || "canonical_offer",
  };
}

function dedupeWrites(entries: SupplierPriceWrite[]): SupplierPriceWrite[] {
  const byPair = new Map<string, SupplierPriceWrite>();
  for (const raw of entries) {
    const entry = normalizeWrite(raw);
    // Em um lote, a última ocorrência do par representa o estado final desejado.
    byPair.set(pairKey(entry.productId, entry.supplierId), entry);
  }
  return [...byPair.values()];
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function getProductSupplierPrices(productId: number): Promise<CanonicalOfferRow[]> {
  const grouped = await getProductSupplierPricesForProducts([productId]);
  return grouped.get(productId) ?? [];
}

/**
 * Leitura vetorizada para telas/listas e motores de equivalência.
 * Complexidade: 1 round-trip e O(M) para agrupar M ofertas em memória.
 */
export async function getProductSupplierPricesForProducts(
  productIds: number[],
): Promise<Map<number, CanonicalOfferRow[]>> {
  const uniqueIds = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
  const grouped = new Map<number, CanonicalOfferRow[]>();
  if (uniqueIds.length === 0) return grouped;

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível ao consultar ofertas");

  const rows = await db
    .select({
      id: productSupplierOffers.id,
      productId: productSupplierOffers.productId,
      supplierId: productSupplierOffers.supplierId,
      price: productSupplierOffers.price,
      codigoFornecedor: productSupplierOffers.supplierCode,
      linkProduto: productSupplierOffers.link,
      updatedAt: productSupplierOffers.updatedAt,
      supplierName: suppliers.name,
      promoPrice: productSupplierOffers.promoPrice,
      stock: productSupplierOffers.stock,
      availability: productSupplierOffers.availability,
    })
    .from(productSupplierOffers)
    .leftJoin(suppliers, eq(productSupplierOffers.supplierId, suppliers.id))
    .where(inArray(productSupplierOffers.productId, uniqueIds))
    .orderBy(asc(productSupplierOffers.productId), asc(productSupplierOffers.supplierId));

  for (const row of rows) {
    const bucket = grouped.get(row.productId);
    if (bucket) bucket.push(row);
    else grouped.set(row.productId, [row]);
  }
  return grouped;
}

async function syncLegacyBestPrices(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  productIds: number[],
): Promise<void> {
  const uniqueIds = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (uniqueIds.length === 0) return;

  const idList = sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `);
  await db.execute(sql`
    UPDATE products p
    LEFT JOIN (
      SELECT
        productId,
        MIN(
          CASE
            WHEN promoPrice IS NOT NULL
              AND promoPrice > 0
              AND (price IS NULL OR promoPrice < price)
              THEN promoPrice
            WHEN price IS NOT NULL AND price > 0
              THEN price
            ELSE NULL
          END
        ) AS bestPrice
      FROM product_supplier_offers
      WHERE productId IN (${idList})
      GROUP BY productId
    ) best ON best.productId = p.id
    SET p.price = best.bestPrice
    WHERE p.id IN (${idList})
      AND NOT (p.price <=> best.bestPrice)
  `);
}

/**
 * Upsert vetorizado da fonte canônica e do espelho legado.
 *
 * O custo de round-trips deixa de crescer por item: há uma leitura dos pares
 * existentes, writes em chunks bounded e um recálculo set-based dos produtos
 * afetados. Memória O(N), limitada ao lote recebido.
 */
export async function batchUpsertSupplierPrices(entries: SupplierPriceWrite[]): Promise<{
  received: number;
  written: number;
  historyRecorded: number;
}> {
  if (entries.length === 0) return { received: 0, written: 0, historyRecorded: 0 };

  const writes = dedupeWrites(entries);
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível ao salvar ofertas");

  const productIds = [...new Set(writes.map((entry) => entry.productId))];
  const supplierIds = [...new Set(writes.map((entry) => entry.supplierId))];

  const existingRows = await db
    .select({
      productId: productSupplierOffers.productId,
      supplierId: productSupplierOffers.supplierId,
      price: productSupplierOffers.price,
    })
    .from(productSupplierOffers)
    .where(
      and(
        inArray(productSupplierOffers.productId, productIds),
        inArray(productSupplierOffers.supplierId, supplierIds),
      ),
    );

  const previousPriceByPair = new Map(
    existingRows.map((row) => [pairKey(row.productId, row.supplierId), row.price] as const),
  );

  const historyRows = writes
    .filter((entry) => {
      const previous = previousPriceByPair.get(pairKey(entry.productId, entry.supplierId)) ?? null;
      return entry.price != null && entry.price !== previous;
    })
    .map((entry) => ({
      productId: entry.productId,
      supplierId: entry.supplierId,
      price: entry.price,
      precoAnterior: previousPriceByPair.get(pairKey(entry.productId, entry.supplierId)) ?? null,
      precoNovo: entry.price,
      origem: entry.origem ?? "canonical_offer",
    }));

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const group of chunks(writes, WRITE_CHUNK_SIZE)) {
      const canonicalRows = group.map((entry) => sql`(
        ${entry.productId},
        ${entry.supplierId},
        ${entry.price},
        ${entry.codigoFornecedor ?? null},
        ${entry.linkProduto ?? null},
        ${now},
        ${now}
      )`);
      await tx.execute(sql`
        INSERT INTO product_supplier_offers
          (productId, supplierId, price, supplierCode, link, createdAt, updatedAt)
        VALUES ${sql.join(canonicalRows, sql`, `)}
        ON DUPLICATE KEY UPDATE
          price = VALUES(price),
          supplierCode = COALESCE(VALUES(supplierCode), supplierCode),
          link = COALESCE(VALUES(link), link),
          updatedAt = VALUES(updatedAt)
      `);

      const legacyRows = group.map((entry) => sql`(
        ${entry.productId},
        ${entry.supplierId},
        ${entry.price},
        ${entry.codigoFornecedor ?? null},
        ${entry.linkProduto ?? null},
        ${now},
        ${now}
      )`);
      await tx.execute(sql`
        INSERT INTO product_supplier_prices
          (productId, supplierId, price, codigoFornecedor, linkProduto, dataAtualizacao, updatedAt)
        VALUES ${sql.join(legacyRows, sql`, `)}
        ON DUPLICATE KEY UPDATE
          price = VALUES(price),
          codigoFornecedor = COALESCE(VALUES(codigoFornecedor), codigoFornecedor),
          linkProduto = COALESCE(VALUES(linkProduto), linkProduto),
          dataAtualizacao = VALUES(dataAtualizacao),
          updatedAt = VALUES(updatedAt)
      `);
    }

    for (const historyChunk of chunks(historyRows, WRITE_CHUNK_SIZE)) {
      if (historyChunk.length > 0) {
        await tx.insert(priceHistory).values(historyChunk);
      }
    }
  });

  await syncLegacyBestPrices(db, productIds);

  return {
    received: entries.length,
    written: writes.length,
    historyRecorded: historyRows.length,
  };
}

export async function upsertProductSupplierPrice(
  productId: number,
  supplierId: number,
  price: string | null,
  extra?: { codigoFornecedor?: string; linkProduto?: string; origem?: string },
) {
  return batchUpsertSupplierPrices([
    {
      productId,
      supplierId,
      price,
      codigoFornecedor: extra?.codigoFornecedor,
      linkProduto: extra?.linkProduto,
      origem: extra?.origem,
    },
  ]);
}

export async function getPriceHistory(productId: number, supplierId?: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const conditions = supplierId
    ? and(eq(priceHistory.productId, productId), eq(priceHistory.supplierId, supplierId))
    : eq(priceHistory.productId, productId);
  return db
    .select()
    .from(priceHistory)
    .where(conditions)
    .orderBy(desc(priceHistory.recordedAt))
    .limit(safeLimit);
}

export async function findProductByEan(ean: string) {
  const db = await getDb();
  if (!db) return null;
  const normalized = ean.trim();
  if (!normalized) return null;
  const rows = await db
    .select()
    .from(products)
    .where(
      or(
        eq(products.ean, normalized),
        eq(products.gtin, normalized),
        eq(products.barcode, normalized),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteProductSupplierPrice(productId: number, supplierId: number) {
  if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(supplierId) || supplierId <= 0) {
    throw new Error("Identificadores de produto/fornecedor inválidos");
  }
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível ao excluir oferta");

  await db.transaction(async (tx) => {
    await tx
      .delete(productSupplierOffers)
      .where(
        and(
          eq(productSupplierOffers.productId, productId),
          eq(productSupplierOffers.supplierId, supplierId),
        ),
      );
    await tx
      .delete(productSupplierPrices)
      .where(
        and(
          eq(productSupplierPrices.productId, productId),
          eq(productSupplierPrices.supplierId, supplierId),
        ),
      );
  });
  await syncLegacyBestPrices(db, [productId]);
}

/**
 * Melhor esforço explícito para chamadas de compatibilidade que não devem
 * interromper fluxo de leitura. Escritas canônicas, por outro lado, propagam
 * erro ao chamador e são auditadas nos routers.
 */
export async function safeGetProductSupplierPrices(productId: number): Promise<CanonicalOfferRow[]> {
  try {
    return await getProductSupplierPrices(productId);
  } catch (error) {
    logger.warn("[supplierPrices] Falha ao consultar ofertas:", (error as Error).message);
    return [];
  }
}
