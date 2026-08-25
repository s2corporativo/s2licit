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
 * Segurança: dry-run por padrão; somente preço positivo; nunca sobrescreve
 * pares que já tenham histórico; grava em transação e faz rollback em falha.
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
    SELECT o.productId, o.supplierId, o.price
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
      console.log(`  produto=${c.productId} fornecedor=${c.supplierId} preço=${c.price}`);
    }
    console.log("\nPara gravar: node scripts/backfill-price-history.mjs --aplicar");
    process.exit(0);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let gravados = 0;
    for (const c of candidatos) {
      const [res] = await conn.query(
        `INSERT INTO price_history (productId, supplierId, price, origem, createdAt)
         VALUES (?, ?, ?, 'backfill_linha_base', NOW())`,
        [c.productId, c.supplierId, c.price],
      );
      if (res.affectedRows === 1) gravados++;
    }
    await conn.commit();
    console.log(`\n${gravados} registro(s) de linha de base gravados.`);
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
