import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Testes de integração contra um MySQL REAL. Só rodam quando DATABASE_URL
 * aponta para um banco (no CI, o job `mysql-migrations` sobe um MySQL efêmero
 * e aplica as migrações antes). Sem DATABASE_URL, são pulados — o `pnpm test`
 * local continua passando sem depender de banco.
 *
 * Exercita o que os testes com mock não cobrem: que o schema migrado aceita
 * as escritas reais dos fluxos críticos (produto, oferta de fornecedor,
 * histórico de preço) e que as queries do ORM batem com as colunas do banco.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("integração MySQL — schema e queries críticas", () => {
  let db: NonNullable<Awaited<ReturnType<typeof import("./db")["getDb"]>>>;
  let supplierId: number;

  beforeAll(async () => {
    const { getDb } = await import("./db");
    const maybe = await getDb();
    if (!maybe) throw new Error("getDb retornou null com DATABASE_URL definido");
    db = maybe;

    const { suppliers } = await import("../drizzle/schema");
    const [ins] = await db.insert(suppliers).values({ name: `Fornecedor CI ${Date.now()}` });
    supplierId = Number((ins as { insertId: number | string }).insertId);
  });

  afterAll(async () => {
    if (!db) return;
    const { suppliers } = await import("../drizzle/schema");
    await db.delete(suppliers).where(eq(suppliers.id, supplierId)).catch(() => undefined);
  });

  it("insere e lê um produto com as colunas de soft-delete", async () => {
    const { products } = await import("../drizzle/schema");
    const [ins] = await db.insert(products).values({
      name: "Produto de Integração",
      supplierId,
      price: "10.50",
      statusConfiabilidade: "incompleto",
      isActive: "yes",
    });
    const id = Number((ins as { insertId: number | string }).insertId);
    expect(id).toBeGreaterThan(0);

    const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    expect(row).toBeDefined();
    expect(row.name).toBe("Produto de Integração");
    // Colunas adicionadas nesta rodada precisam existir no banco migrado.
    expect(row.deletedAt).toBeNull();
    expect(row.mergedIntoId).toBeNull();

    await db.delete(products).where(eq(products.id, id));
  });

  it("registra consumo de IA e agrega por dia (ai_usage_daily)", async () => {
    const { aiUsageDaily } = await import("../drizzle/schema");
    const { sql } = await import("drizzle-orm");
    const dia = "1999-01-01";
    await db
      .insert(aiUsageDaily)
      .values({ dia, provider: "ci", model: "ci-model", chamadas: 1, promptTokens: 100, completionTokens: 50, custoUsd: "0.001000" })
      .onDuplicateKeyUpdate({
        set: {
          chamadas: sql`${aiUsageDaily.chamadas} + 1`,
          promptTokens: sql`${aiUsageDaily.promptTokens} + 100`,
        },
      });
    // segunda escrita no mesmo dia/provedor/modelo deve AGREGAR (unique key)
    await db
      .insert(aiUsageDaily)
      .values({ dia, provider: "ci", model: "ci-model", chamadas: 1, promptTokens: 100, completionTokens: 50, custoUsd: "0.001000" })
      .onDuplicateKeyUpdate({
        set: {
          chamadas: sql`${aiUsageDaily.chamadas} + 1`,
          promptTokens: sql`${aiUsageDaily.promptTokens} + 100`,
        },
      });

    const [row] = await db
      .select()
      .from(aiUsageDaily)
      .where(eq(aiUsageDaily.dia, dia))
      .limit(1);
    expect(Number(row.chamadas)).toBe(2);
    expect(Number(row.promptTokens)).toBe(200);

    await db.delete(aiUsageDaily).where(eq(aiUsageDaily.dia, dia));
  });
});
