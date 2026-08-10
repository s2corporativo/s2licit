import { sql } from "drizzle-orm";
import { products } from "../../drizzle/schema";

/**
 * Expressões correlacionadas para consumidores legados que precisam de um
 * resumo comercial do produto sem voltar a tratar `products.supplierId` e
 * `products.price` como fonte de verdade.
 *
 * A regra de preço efetivo é única: promoção positiva e menor que o preço
 * regular; caso contrário, preço regular positivo.
 */
const effectivePrice = (alias: string) => `CASE
  WHEN ${alias}.promoPrice IS NOT NULL
    AND ${alias}.promoPrice > 0
    AND (${alias}.price IS NULL OR ${alias}.promoPrice < ${alias}.price)
    THEN ${alias}.promoPrice
  WHEN ${alias}.price IS NOT NULL AND ${alias}.price > 0
    THEN ${alias}.price
  ELSE NULL
END`;

export const bestOfferPriceSql = sql<string | null>`(
  SELECT ${sql.raw(effectivePrice("pso"))}
  FROM product_supplier_offers pso
  WHERE pso.productId = ${products.id}
    AND ${sql.raw(effectivePrice("pso"))} IS NOT NULL
  ORDER BY ${sql.raw(effectivePrice("pso"))} ASC, pso.updatedAt DESC, pso.id ASC
  LIMIT 1
)`;

export const bestOfferSupplierIdSql = sql<number | null>`(
  SELECT pso.supplierId
  FROM product_supplier_offers pso
  WHERE pso.productId = ${products.id}
    AND ${sql.raw(effectivePrice("pso"))} IS NOT NULL
  ORDER BY ${sql.raw(effectivePrice("pso"))} ASC, pso.updatedAt DESC, pso.id ASC
  LIMIT 1
)`;

export const bestOfferSupplierNameSql = sql<string | null>`(
  SELECT s.name
  FROM product_supplier_offers pso
  JOIN suppliers s ON s.id = pso.supplierId
  WHERE pso.productId = ${products.id}
    AND ${sql.raw(effectivePrice("pso"))} IS NOT NULL
  ORDER BY ${sql.raw(effectivePrice("pso"))} ASC, pso.updatedAt DESC, pso.id ASC
  LIMIT 1
)`;
