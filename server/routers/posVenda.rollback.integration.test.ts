import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

/**
 * Testes de integração contra um MySQL REAL (mesmo padrão de
 * server/db.integration-db.test.ts) — só rodam quando DATABASE_URL aponta
 * para um banco; sem ela, são pulados.
 *
 * Regressão: `criarPedidoDeProposta`/`salvarPedido` gravavam o cabeçalho do
 * pedido de compra e os itens em dois `db.insert`/`db.update` soltos, sem
 * transação. Uma falha no segundo escrevia um pedido com valorTotal
 * preenchido e ZERO itens — e como existe guarda de unicidade por
 * proposalId, a retentativa batia em CONFLICT: o operador ficava travado,
 * sem conseguir recriar o pedido. Reproduzido e corrigido em b49e48f+.
 *
 * Prova, contra o driver mysql2 real (não um mock), que envolver as duas
 * escritas em `db.transaction()` reverte o cabeçalho quando o insert dos
 * itens falha — em vez de só verificar que uma função lança um erro.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("db.transaction — rollback real do cabeçalho órfão", () => {
  afterEach(async () => {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`DELETE FROM purchase_order_items`);
    await db.execute(sql`DELETE FROM purchase_orders`);
  });

  it("SEM transação: o cabeçalho fica órfão quando o insert dos itens falha", async () => {
    const { getDb } = await import("../db");
    const { purchaseOrders, purchaseOrderItems } = await import("../../drizzle/schema");
    const db = await getDb();
    if (!db) throw new Error("getDb retornou null com DATABASE_URL definido");

    const [res] = await db.insert(purchaseOrders).values({
      fornecedorNome: "Teste Rollback",
      descricao: "Pedido de prova",
      valorTotal: "999.99",
    });
    await expect(
      db.insert(purchaseOrderItems).values({
        orderId: 999_999_999, // FK inexistente, de propósito
        descricao: "item",
        quantidade: "1",
        precoUnit: "1",
      })
    ).rejects.toThrow();

    const rows = await db.select().from(purchaseOrders);
    // Este é o bug que a transação corrige: sem ela, sobra 1 cabeçalho órfão.
    expect(rows.length).toBe(1);
  });

  it("COM transaction: a mesma falha reverte o cabeçalho também", async () => {
    const { getDb } = await import("../db");
    const { purchaseOrders, purchaseOrderItems } = await import("../../drizzle/schema");
    const db = await getDb();
    if (!db) throw new Error("getDb retornou null com DATABASE_URL definido");

    await expect(
      db.transaction(async (tx) => {
        await tx.insert(purchaseOrders).values({
          fornecedorNome: "Teste Rollback TX",
          descricao: "Pedido de prova TX",
          valorTotal: "999.99",
        });
        await tx.insert(purchaseOrderItems).values({
          orderId: 999_999_999, // mesma falha de FK, agora dentro da transação
          descricao: "item",
          quantidade: "1",
          precoUnit: "1",
        });
      })
    ).rejects.toThrow();

    const rows = await db.select().from(purchaseOrders);
    // Nada órfão: o driver reverteu as duas escritas juntas.
    expect(rows.length).toBe(0);
  });
});
