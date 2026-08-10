import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { supplierProductObservations } from "../../drizzle/captureCoreSchema";

export interface CaptureReviewQueueFilter {
  scraperConfigId?: number;
  supplierId?: number;
  limit?: number;
}

export async function listCaptureReviewObservations(
  input: CaptureReviewQueueFilter,
) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");

  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const filters = [
    eq(supplierProductObservations.reviewStatus, "pending"),
    inArray(supplierProductObservations.action, ["create", "review", "blocked"]),
  ];

  if (input.scraperConfigId) {
    filters.push(
      eq(supplierProductObservations.scraperConfigId, input.scraperConfigId),
    );
  }
  if (input.supplierId) {
    filters.push(eq(supplierProductObservations.supplierId, input.supplierId));
  }

  return db
    .select()
    .from(supplierProductObservations)
    .where(and(...filters))
    .orderBy(desc(supplierProductObservations.capturedAt))
    .limit(limit);
}
