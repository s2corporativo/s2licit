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
 * - usa `createdAt` da oferta como timestamp CONSERVADOR da linha de base;
 *   `updatedAt` não é usado porque também muda por link/imagem/código/estoque;
 * - escrita em um único INSERT ... SELECT com NOT EXISTS;
 * - execuções do backfill são serializadas por lock nomeado do MySQL;
 * - transação SERIALIZABLE e rollback em falha.
 */

import { createPool } from "mysql2/promise";

const APLICAR = process.argv.includes("--aplicar");
const URL = process.env.DATABASE_URL;
const BACKFILL_LOCK = "s2licit_price_history_backfill";

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
      o.createdAt AS observedAt
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
        `  produto=${c.productId} fornecedor=${c.supplierId} preço=${c.price} observadoAté=${c.observedAt ?? "n/d"}`,
      );
    }
    console.log("\nPara gravar: node scripts/backfill-price-history.mjs --aplicar");
    process.exit(0);
  }

  const conn = await pool.getConnection();
  let lockAdquirido = false;
  try {
    const [lockRows] = await conn.query("SELECT GET_LOCK(?, 30) AS acquired", [BACKFILL_LOCK]);
    lockAdquirido = Number(lockRows?.[0]?.acquired ?? 0) === 1;
    if (!lockAdquirido) {
      throw new Error("Não foi possível obter o lock exclusivo do backfill em 30 segundos.");
    }

    await conn.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await conn.beginTransaction();

    // Reavalia TODOS os candidatos dentro da transação e grava em um único
    // statement. `createdAt` é deliberadamente conservador: se o preço tiver
    // sido atualizado depois por um fluxo que não registra a data específica da
    // cotação, a linha de base fica mais antiga (exige revalidação), nunca mais
    // recente do que podemos provar.
    const [res] = await conn.query(`
      INSERT INTO price_history
        (productId, supplierId, price, origem, data, recordedAt)
      SELECT
        o.productId,
        o.supplierId,
        o.price,
        'backfill_linha_base',
        o.createdAt,
        o.createdAt
      FROM product_supplier_offers o
      WHERE o.price IS NOT NULL
        AND CAST(o.price AS DECIMAL(15,4)) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM price_history h
          WHERE h.productId = o.productId
            AND h.supplierId = o.supplierId
        )
    `);

    await conn.commit();
    const gravados = Number(res.affectedRows ?? 0);
    console.log(`\n${gravados} registro(s) de linha de base gravados.`);
    if (gravados < candidatos.length) {
      console.log(
        `${candidatos.length - gravados} candidato(s) do dry-scan já não precisavam de backfill no momento da escrita.`,
      );
    }
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    console.error("Falha no backfill — transação revertida, nada foi gravado.");
    throw err;
  } finally {
    if (lockAdquirido) {
      await conn.query("SELECT RELEASE_LOCK(?)", [BACKFILL_LOCK]).catch(() => undefined);
    }
    conn.release();
  }
} finally {
  await pool.end();
}
