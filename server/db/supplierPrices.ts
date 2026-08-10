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

/**
 * Mantém somente o cache de compatibilidade para consumidores antigos:
 * - products.price = menor custo efetivo vigente;
 * - products.supplierId = fornecedor dessa mesma oferta.
 *
 * Nenhum dos dois campos é fonte de verdade; a origem é sempre
 * product_supplier_offers. Se não houver oferta com preço válido, ambos ficam
 * NULL para não expor um par comercial incoerente.
 */
function mirrorSyncQuery(productIds: number[]) {
  const uniqueIds = [...new Set(productIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (uniqueIds.length === 0) return null;
  const idList = sql.join(uniqueIds.map((id) => sql`${id}`), sql`, `);
  return sql`
    UPDATE products p
    LEFT JOIN (
      SELECT ranked.productId, ranked.supplierId, ranked.bestPrice
      FROM (
        SELECT
          o.id,
          o.productId,
          o.supplierId,
          CASE
            WHEN o.promoPrice IS NOT NULL
              AND o.promoPrice > 0
              AND (o.price IS NULL OR o.promoPrice < o.price)
              THEN o.promoPrice
            WHEN o.price IS NOT NULL AND o.price > 0
              THEN o.price
            ELSE NULL
          END AS bestPrice,
          ROW_NUMBER() OVER (
            PARTITION BY o.productId
            ORDER BY
              CASE
                WHEN o.promoPrice IS NOT NULL
                  AND o.promoPrice > 0
                  AND (o.price IS NULL OR o.promoPrice < o.price)
                  THEN o.promoPrice
                WHEN o.price IS NOT NULL AND o.price > 0
                  THEN o.price
                ELSE NULL
              END ASC,
              o.updatedAt DESC,
              o.id ASC
          ) AS rn
        FROM product_supplier_offers o
        WHERE o.productId IN (${idList})
          AND (
            (o.promoPrice IS NOT NULL AND o.promoPrice > 0)
            OR (o.price IS NOT NULL AND o.price > 0)
          )
      ) ranked
      WHERE ranked.rn = 1 AND ranked.bestPrice IS NOT NULL
    ) best ON best.productId = p.id
    SET
      p.price = best.bestPrice,
      p.supplierId = best.supplierId
    WHERE p.id IN (${idList})
      AND (
        NOT (p.price <=> best.bestPrice)
        OR NOT (p.supplierId <=> best.supplierId)
      )
  `;
}

export async function getProductSupplierPrices(productId: number): Promise<CanonicalOfferRow[]> {
  const grouped = await getProductSupplierPricesForProducts([productId]);
  return grouped.get(productId) ?? [];
}

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

/**
 * Upsert vetorizado da fonte canônica e da ponte histórica.
 * Oferta, histórico e atualização dos caches de compatibilidade acontecem na
 * mesma transação para evitar sucesso parcial.
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

  const historyRows = writes.flatMap((entry) => {
    const previous = previousPriceByPair.get(pairKey(entry.productId, entry.supplierId)) ?? null;
    if (entry.price == null || entry.price === previous) return [];
    return [{
      productId: entry.productId,
      supplierId: entry.supplierId,
      price: entry.price,
      precoAnterior: previous,
      precoNovo: entry.price,
      origem: entry.origem ?? "canonical_offer",
    }];
  });

  const mirrorQuery = mirrorSyncQuery(productIds);
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
      if (historyChunk.length > 0) await tx.insert(priceHistory).values(historyChunk);
    }

    if (mirrorQuery) await tx.execute(mirrorQuery);
  });

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
  return batchUpsertSupplierPrices([{
    productId,
    supplierId,
    price,
    codigoFornecedor: extra?.codigoFornecedor,
    linkProduto: extra?.linkProduto,
    origem: extra?.origem,
  }]);
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
    .where(or(
      eq(products.ean, normalized),
      eq(products.gtin, normalized),
      eq(products.barcode, normalized),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteProductSupplierPrice(productId: number, supplierId: number) {
  if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(supplierId) || supplierId <= 0) {
    throw new Error("Identificadores de produto/fornecedor inválidos");
  }
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível ao excluir oferta");
  const mirrorQuery = mirrorSyncQuery([productId]);

  await db.transaction(async (tx) => {
    await tx
      .delete(productSupplierOffers)
      .where(and(
        eq(productSupplierOffers.productId, productId),
        eq(productSupplierOffers.supplierId, supplierId),
      ));
    await tx
      .delete(productSupplierPrices)
      .where(and(
        eq(productSupplierPrices.productId, productId),
        eq(productSupplierPrices.supplierId, supplierId),
      ));
    if (mirrorQuery) await tx.execute(mirrorQuery);
  });
}

export async function safeGetProductSupplierPrices(productId: number): Promise<CanonicalOfferRow[]> {
  try {
    return await getProductSupplierPrices(productId);
  } catch (error) {
    logger.warn("[supplierPrices] Falha ao consultar ofertas:", (error as Error).message);
    return [];
  }
}
