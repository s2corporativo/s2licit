import { asc, and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { products, suppliers, supplierSanctions, type InsertSupplierSanction } from "../../drizzle/schema";
import { getDb } from "./_client";

/**
 * Lista sanções, opcionalmente filtradas por fornecedor.
 */
export async function listSanctions(supplierId?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db
    .select()
    .from(supplierSanctions)
    .orderBy(asc(supplierSanctions.dataInicio));
  if (supplierId !== undefined) {
    return query.where(eq(supplierSanctions.supplierId, supplierId));
  }
  return query;
}

/**
 * Sanções ATIVAS de um fornecedor cuja vigência ainda não expirou
 * (status = 'ativa' e (dataFim IS NULL OR dataFim >= hoje)).
 */
export async function getActiveSanctions(supplierId: number) {
  const db = await getDb();
  if (!db) return [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return db
    .select()
    .from(supplierSanctions)
    .where(
      and(
        eq(supplierSanctions.supplierId, supplierId),
        eq(supplierSanctions.status, "ativa"),
        or(isNull(supplierSanctions.dataFim), gte(supplierSanctions.dataFim, hoje)),
      ),
    )
    .orderBy(asc(supplierSanctions.dataInicio));
}

export interface ActiveSanctionInfo {
  fornecedor: string;
  orgao: string;
  processo: string | null;
  penalidade: string;
  dataInicio: Date | null;
  dataFim: Date | null;
}

/**
 * Para cada productId informado, retorna a primeira sanção ATIVA e vigente
 * do fornecedor do produto (produto → suppliers via products.supplierId).
 * Usado na validação de cotações/orçamentos.
 */
export async function getActiveSanctionsByProductIds(
  productIds: number[],
): Promise<Map<string, ActiveSanctionInfo>> {
  const db = await getDb();
  const result = new Map<string, ActiveSanctionInfo>();
  if (!db || productIds.length === 0) return result;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      supplierName: suppliers.name,
      orgao: supplierSanctions.orgao,
      processo: supplierSanctions.processo,
      penalidade: supplierSanctions.penalidade,
      dataInicio: supplierSanctions.dataInicio,
      dataFim: supplierSanctions.dataFim,
    })
    .from(products)
    .innerJoin(suppliers, eq(products.supplierId, suppliers.id))
    .innerJoin(supplierSanctions, eq(supplierSanctions.supplierId, suppliers.id))
    .where(
      and(
        inArray(products.id, productIds),
        eq(supplierSanctions.status, "ativa"),
        or(isNull(supplierSanctions.dataFim), gte(supplierSanctions.dataFim, hoje)),
      ),
    );
  for (const row of rows) {
    if (!result.has(row.productName)) {
      result.set(row.productName, {
        fornecedor: row.supplierName,
        orgao: row.orgao,
        processo: row.processo,
        penalidade: row.penalidade,
        dataInicio: row.dataInicio,
        dataFim: row.dataFim,
      });
    }
  }
  return result;
}

export async function getSanctionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(supplierSanctions)
    .where(eq(supplierSanctions.id, id))
    .limit(1);
  return result[0];
}

export async function createSanction(data: InsertSupplierSanction) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(supplierSanctions).values(data);
  return result;
}

export async function updateSanction(id: number, data: Partial<InsertSupplierSanction>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(supplierSanctions).set(data).where(eq(supplierSanctions.id, id));
}

/**
 * Revoga uma sanção (status = 'revogada') sem excluir o registro,
 * preservando o histórico para auditoria.
 */
export async function revokeSanction(id: number, revogadoPor?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(supplierSanctions)
    .set({ status: "revogada", observacoes: revogadoPor ? `Revogada por ${revogadoPor}` : undefined })
    .where(eq(supplierSanctions.id, id));
}
