import { asc, eq } from "drizzle-orm";
import { suppliers, type InsertSupplier } from "../../drizzle/schema";
import { getDb } from "./_client";

export async function listSuppliers(activeOnly = false) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(suppliers).orderBy(asc(suppliers.name));
  if (activeOnly) {
    return db.select().from(suppliers).where(eq(suppliers.isActive, "yes")).orderBy(asc(suppliers.name));
  }
  return query;
}

export async function getSupplierById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  return result[0];
}

export async function createSupplier(data: InsertSupplier) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(suppliers).values(data);
  return result;
}

export async function updateSupplier(id: number, data: Partial<InsertSupplier>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(suppliers).set(data).where(eq(suppliers.id, id));
}

/**
 * Fornecedor não é mais uma entidade descartável: produtos legados ainda têm
 * FK com ON DELETE CASCADE. Portanto "excluir" significa desativar. Isso evita
 * que uma operação administrativa remova produtos, propostas e histórico por
 * efeito cascata. Uma futura migração poderá tornar products.supplierId opcional
 * e remover definitivamente o acoplamento legado.
 */
export async function deleteSupplier(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(suppliers).set({ isActive: "no" }).where(eq(suppliers.id, id));
}
