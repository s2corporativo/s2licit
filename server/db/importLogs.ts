import { desc, eq } from "drizzle-orm";
import { categories, importLogs, suppliers, type InsertImportLog } from "../../drizzle/schema";
import { getDb } from "./_client";

export async function createImportLog(data: InsertImportLog) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Sanitiza categoryId e supplierId: garante null quando vazio ou inválido
  const sanitized = {
    ...data,
    categoryId: data.categoryId && Number(data.categoryId) > 0 ? Number(data.categoryId) : null,
    supplierId: data.supplierId && Number(data.supplierId) > 0 ? Number(data.supplierId) : null,
  };
  const [result] = await db.insert(importLogs).values(sanitized);
  return (result as any).insertId as number;
}

export async function updateImportLog(id: number, data: Partial<InsertImportLog>) {
  const db = await getDb();
  if (!db) return;
  await db.update(importLogs).set(data).where(eq(importLogs.id, id));
}

export async function listImportLogs(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: importLogs.id,
      fileName: importLogs.fileName,
      totalRows: importLogs.totalRows,
      importedRows: importLogs.importedRows,
      errorRows: importLogs.errorRows,
      status: importLogs.status,
      errorMessage: importLogs.errorMessage,
      createdAt: importLogs.createdAt,
      supplierId: importLogs.supplierId,
      categoryId: importLogs.categoryId,
      supplierName: suppliers.name,
      categoryName: categories.name,
    })
    .from(importLogs)
    .leftJoin(suppliers, eq(importLogs.supplierId, suppliers.id))
    .leftJoin(categories, eq(importLogs.categoryId, categories.id))
    .orderBy(desc(importLogs.createdAt))
    .limit(limit);
}
