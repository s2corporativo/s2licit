import { eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  bulkPricingApplications,
  bulkPricingApplicationDetails,
  products,
  BulkPricingApplication,
  InsertBulkPricingApplication,
  BulkPricingApplicationDetail,
} from "../../drizzle/schema";

/**
 * Criar registro de aplicação em massa
 */
export async function createBulkPricingApplication(
  data: InsertBulkPricingApplication
): Promise<BulkPricingApplication> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const result = await db.insert(bulkPricingApplications).values(data);
  const id = (result as any).insertId;

  const created = await db
    .select()
    .from(bulkPricingApplications)
    .where(eq(bulkPricingApplications.id, Number(id)))
    .limit(1);

  if (!created[0]) throw new Error("Falha ao criar registro de aplicação");
  return created[0];
}

/**
 * Listar histórico de aplicações
 */
export async function listBulkPricingApplications(
  limit = 20,
  offset = 0
): Promise<{ total: number; applications: BulkPricingApplication[] }> {
  const db = await getDb();
  if (!db) return { total: 0, applications: [] };

  const applications = await db
    .select()
    .from(bulkPricingApplications)
    .orderBy(desc(bulkPricingApplications.appliedAt))
    .limit(limit)
    .offset(offset);

  return { total: applications.length, applications };
}

/**
 * Obter aplicação por ID
 */
export async function getBulkPricingApplication(
  id: number
): Promise<BulkPricingApplication | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(bulkPricingApplications)
    .where(eq(bulkPricingApplications.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Registrar detalhes de cada produto atualizado
 */
export async function createBulkPricingDetails(
  applicationId: number,
  details: Array<{
    productId: number;
    oldPrice: number;
    newPrice: number;
    priceIncrease: number;
    status?: "success" | "skipped" | "error";
    errorMessage?: string;
  }>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  if (details.length === 0) return;

  await db.insert(bulkPricingApplicationDetails).values(
    details.map((d) => ({
      applicationId,
      productId: d.productId,
      oldPrice: String(d.oldPrice),
      newPrice: String(d.newPrice),
      priceIncrease: String(d.priceIncrease),
      status: (d.status || "success") as "success" | "skipped" | "error",
      errorMessage: d.errorMessage,
    }))
  );
}

/**
 * Listar detalhes de uma aplicação
 */
export async function getBulkPricingDetails(
  applicationId: number
): Promise<BulkPricingApplicationDetail[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(bulkPricingApplicationDetails)
    .where(eq(bulkPricingApplicationDetails.applicationId, applicationId));
}

/**
 * Aplicar preços em massa nos produtos
 */
export async function applyPricesToProducts(
  updates: Array<{ productId: number; newPrice: number }>
): Promise<{ updated: number; errors: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let updated = 0;
  const errors: string[] = [];

  for (const { productId, newPrice } of updates) {
    try {
      await db
        .update(products)
        .set({
          price: String(newPrice),
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));
      updated++;
    } catch (err) {
      errors.push(`Produto ${productId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { updated, errors };
}

/**
 * Reverter preços de uma aplicação
 */
export async function revertBulkPricingApplication(applicationId: number): Promise<{
  reverted: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Buscar detalhes da aplicação
  const details = await getBulkPricingDetails(applicationId);
  if (details.length === 0) {
    throw new Error("Nenhum detalhe encontrado para esta aplicação");
  }

  let reverted = 0;
  const errors: string[] = [];

  for (const detail of details) {
    try {
      await db
        .update(products)
        .set({
          price: String(detail.oldPrice),
          updatedAt: new Date(),
        })
        .where(eq(products.id, detail.productId));
      reverted++;
    } catch (err) {
      errors.push(
        `Produto ${detail.productId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Marcar aplicação como revertida
  await db
    .update(bulkPricingApplications)
    .set({ status: "reverted" })
    .where(eq(bulkPricingApplications.id, applicationId));

  return { reverted, errors };
}
