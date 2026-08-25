#!/usr/bin/env node
/**
 * Backfill da linha de base do histórico de preços — Módulo 06.
 *
 * Os gatilhos atuais registram mudanças de custo, mas produtos cujo preço nunca
 * mudou podem não possuir observação inicial. Este script grava apenas a
 * primeira observação de pares (produto, fornecedor) ainda sem histórico.
 *
 * Uso:
 *   node scripts/backfill-price-history.mjs           # dry-run (padrão)
 *   node scripts/backfill-price-history.mjs --aplicar # grava
 *
 * Segurança:
 * - dry-run por padrão;
 * - somente preço positivo;
 * - preserva a data real da oferta como `data` e `recordedAt`;
 * - revalida a ausência de histórico no mesmo INSERT que grava a linha;
 * - grava em transação e faz rollback em falha.
 */

import { createPool } from "mysql2/promise";

const APLICAR = process.argv.includes("--aplicar");
const URL = process.env.DATABASE_URL;

if (!URL) {
  console.error("DATABASE_URL não definida no ambiente. Abortando sem tocar no banco.");
  process.exit(1);
}

const pool = createPool(URL);

try {
  const [candidatos] = await pool.query(`
    SELECT
      o.productId,
      o.supplierId,
      o.price,
      COALESCE(o.updatedAt, o.createdAt) AS observedAt
    FROM product_supplier_offers o
    LEFT JOIN price_history h
      ON h.productId = o.productId AND h.supplierId = o.supplierId
    WHERE h.id IS NULL
      AND o.price IS NOT NULL
      AND CAST(o.price AS DECIMAL(15,4)) > 0
  `);

  console.log(`Pares (produto, fornecedor) sem linha de base: ${candidatos.length}`);

  if (candidatos.length === 0) {
    console.log("Nada a fazer — o histórico já tem linha de base para toda oferta válida.");
    process.exit(0);
  }

  if (!APLICAR) {
    console.log("\nDRY-RUN — nada foi gravado. Amostra dos 5 primeiros:");
    for (const c of candidatos.slice(0, 5)) {
      console.log(
        `  produto=${c.productId} fornecedor=${c.supplierId} preço=${c.price} observadoEm=${c.observedAt ?? "n/d"}`,
      );
    }
    console.log("\nPara gravar: node scripts/backfill-price-history.mjs --aplicar");
    process.exit(0);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let gravados = 0;

    for (const c of candidatos) {
      // Revalida oferta, preço e ausência de histórico no MESMO statement de
      // escrita. Isso evita usar o snapshot do scan inicial caso a oferta ou o
      // histórico mudem enquanto o operador confirma/aplica o backfill.
      const [res] = await conn.query(
        `INSERT INTO price_history
           (productId, supplierId, price, origem, data, recordedAt)
         SELECT
           o.productId,
           o.supplierId,
           o.price,
           'backfill_linha_base',
           COALESCE(o.updatedAt, o.createdAt),
           COALESCE(o.updatedAt, o.createdAt)
         FROM product_supplier_offers o
         WHERE o.productId = ?
           AND o.supplierId = ?
           AND o.price IS NOT NULL
           AND CAST(o.price AS DECIMAL(15,4)) > 0
           AND NOT EXISTS (
             SELECT 1
             FROM price_history h
             WHERE h.productId = o.productId
               AND h.supplierId = o.supplierId
           )`,
        [c.productId, c.supplierId],
      );
      if (res.affectedRows === 1) gravados++;
    }

    await conn.commit();
    console.log(`\n${gravados} registro(s) de linha de base gravados.`);
    if (gravados < candidatos.length) {
      console.log(
        `${candidatos.length - gravados} candidato(s) foram ignorados porque a oferta/histórico mudou durante a execução.`,
      );
    }
  } catch (err) {
    await conn.rollback();
    console.error("Falha no backfill — transação revertida, nada foi gravado.");
    throw err;
  } finally {
    conn.release();
  }
} finally {
  await pool.end();
}
