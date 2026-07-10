import { getDb } from "../db";
import {
  products,
  productCaptureHistory,
  suppliers,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

/**
 * Aprova mudança de produto
 */
export async function approveProductChange(
  historyId: number,
  approvedBy: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db
    .update(productCaptureHistory)
    .set({
      status: "approved",
      approvedBy,
      approvedAt: new Date(),
    })
    .where(eq(productCaptureHistory.id, historyId));
}

/**
 * Rejeita mudança de produto
 */
export async function rejectProductChange(historyId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db
    .update(productCaptureHistory)
    .set({
      status: "rejected",
    })
    .where(eq(productCaptureHistory.id, historyId));
}

/**
 * Recupera histórico de mudanças de um produto
 */
export async function getProductChangeHistory(productId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  return await db
    .select()
    .from(productCaptureHistory)
    .where(eq(productCaptureHistory.productId, productId));
}
