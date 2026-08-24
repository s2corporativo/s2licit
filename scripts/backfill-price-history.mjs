#!/usr/bin/env node
/**
 * Backfill do histórico de preços — Ressalva 3 do Módulo 06, etapa 3.
 *
 * Contexto medido em 24/08/2026, e ele desmente parte do diagnóstico original.
 * A ressalva dizia que o histórico "não é alimentado". Hoje **cinco dos seis**
 * gatilhos já gravam:
 *
 *   importação de lista (importSmartRouter)      grava
 *   custo landed (landedCost)                    grava
 *   edição manual (productsGroup)                grava, via upsert canônico
 *   importação em lote (importsGroup)            grava, via batchUpsert
 *   scraping, produto novo   (scraperEngine)     grava
 *   scraping, produto existente (scraperEngine)  grava
 *
 * O sexto — cotação recebida — **não deve** alimentar: `email_quotation_items`
 * não tem `supplierId`, e `precoSugerido` é o nosso preço de VENDA, não custo
 * de fornecedor. `price_history` é indexado por (productId, supplierId) e
 * guarda custo. Gravar preço de venda ali corromperia a base que a
 * precificação usa para decidir margem.
 *
 * O que faltava de verdade era a LINHA DE BASE: as tabelas nasceram vazias, e
 * os gatilhos só registram MUDANÇA de preço. Um produto cujo preço não mudou
 * desde que os gatilhos passaram a funcionar nunca entra no histórico. Este
 * script grava o snapshot de hoje como primeira observação, uma única vez.
 *
 * Uso:
 *   node scripts/backfill-price-history.mjs           # dry-run (padrão)
 *   node scripts/backfill-price-history.mjs --aplicar # grava
 *
 * Segurança: dry-run por padrão; só considera ofertas com preço numérico
 * positivo; NUNCA sobrescreve — pula todo par (produto, fornecedor) que já
 * tenha qualquer registro no histórico, então reexecutar é inofensivo.
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
  // Pares (produto, fornecedor) com preço válido e SEM nenhum histórico ainda.
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
      // `origem` distingue a linha de base de uma observação real de mercado,
      // para que relatórios possam excluí-la de análise de variação.
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
