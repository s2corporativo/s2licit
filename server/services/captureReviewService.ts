import { and, eq, or } from "drizzle-orm";
import { getDb, recordPriceHistory } from "../db";
import {
  productSupplierOffers,
  products,
  suppliers,
} from "../../drizzle/schema";
import {
  captureAiFeedback,
  supplierProductObservations,
} from "../../drizzle/captureCoreSchema";
import { normalizeText } from "../matching/productMatcher";
import {
  capturePresentationCompatible,
  normalizeCaptureEan,
} from "./captureCoreService";
import { toLegacyAvailability } from "./captureOfferService";
import { logger } from "../_core/logger";

export interface CaptureReviewDecisionInput {
  observationId: number;
  decision: "approve" | "reject";
  expectedProductId?: number | null;
  userId?: number | null;
  notes?: string | null;
}

export interface CaptureReviewDecisionResult {
  applied: boolean;
  status: "approved" | "rejected";
  productId?: number;
  created?: boolean;
}

type ObservationRow = typeof supplierProductObservations.$inferSelect;

function compactText(value: string | null | undefined, maxLength = 2_000): string | null {
  if (!value) return null;
  const compact = value.trim().replace(/\s+/g, " ");
  return compact ? compact.slice(0, maxLength) : null;
}

function payloadUnit(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).unit;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 64) : null;
}

function numericOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertValidObservedPrice(observation: ObservationRow): number {
  const price = numericOrNull(observation.price);
  if (price === null || price <= 0) {
    throw new Error("A observação não possui preço válido para aplicação.");
  }
  return price;
}

function feedbackDecisionForApproval(input: {
  created: boolean;
  originalProductId: number | null;
  resolvedProductId: number;
}): "correct_match" | "approve_update" {
  if (input.created || input.originalProductId !== input.resolvedProductId) {
    return "correct_match";
  }
  return "approve_update";
}

/**
 * Aprovação/rejeição humana é uma unidade transacional única.
 *
 * `FOR UPDATE` serializa decisões sobre a mesma observação e sobre o produto/
 * oferta alvo. Campos temporais de oferta obedecem a mesma regra do fluxo
 * automático: se estoque/disponibilidade/promoção não foram observados agora,
 * ficam desconhecidos/nulos em vez de herdar um estado antigo.
 */
export async function decideCaptureObservationTransactional(
  input: CaptureReviewDecisionInput,
): Promise<CaptureReviewDecisionResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível.");

  const notes = compactText(input.notes);
  let priceHistoryAfterCommit:
    | { productId: number; supplierId: number; price: string }
    | null = null;

  const result = await db.transaction(async (tx) => {
    const [observation] = await tx
      .select()
      .from(supplierProductObservations)
      .where(eq(supplierProductObservations.id, input.observationId))
      .for("update")
      .limit(1);

    if (!observation) throw new Error("Observação não encontrada.");
    if (observation.reviewStatus !== "pending") {
      throw new Error(`Esta observação já foi revisada (${observation.reviewStatus}).`);
    }

    const reviewedAt = new Date();

    if (input.decision === "reject") {
      await tx
        .update(supplierProductObservations)
        .set({
          reviewStatus: "rejected",
          reviewedAt,
          reviewedByUserId: input.userId ?? null,
          reason: notes ?? observation.reason ?? "Rejeitado por revisão humana.",
        })
        .where(
          and(
            eq(supplierProductObservations.id, observation.id),
            eq(supplierProductObservations.reviewStatus, "pending"),
          ),
        );

      await tx.insert(captureAiFeedback).values({
        supplierId: observation.supplierId,
        observationId: observation.id,
        decision: observation.productId ? "reject_update" : "wrong_match",
        observedName: observation.rawName,
        expectedProductId: input.expectedProductId ?? null,
        expectedNormalizedName: null,
        notes,
        createdByUserId: input.userId ?? null,
        reusable: true,
      });

      return { applied: false, status: "rejected" as const };
    }

    const observedPrice = assertValidObservedPrice(observation);
    const observedEan = normalizeCaptureEan(observation.ean);

    const [supplier] = await tx
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, observation.supplierId))
      .limit(1);
    if (!supplier) {
      throw new Error(`Fornecedor #${observation.supplierId} não existe mais.`);
    }

    let productId = input.expectedProductId ?? observation.productId;
    let created = false;

    if (observation.action === "create" && !input.expectedProductId) {
      if (!observedEan) {
        throw new Error(
          "Criação após revisão exige EAN/GTIN válido. Vincule manualmente a um produto mestre existente ou corrija a observação.",
        );
      }

      const [existingByEan] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          or(
            eq(products.ean, observedEan),
            eq(products.gtin, observedEan),
            eq(products.barcode, observedEan),
          ),
        )
        .for("update")
        .limit(1);

      if (existingByEan) {
        productId = existingByEan.id;
      } else {
        const [inserted] = await tx.insert(products).values({
          supplierId: observation.supplierId,
          name: observation.rawName.slice(0, 512),
          nomeProduto: observation.rawName.slice(0, 512),
          nomeNormalizado: normalizeText(observation.rawName).slice(0, 512),
          price: String(observedPrice),
          codigoFornecedor: observation.supplierSku,
          code: observation.supplierSku,
          ean: observedEan,
          gtin: observedEan,
          unit: payloadUnit(observation.rawPayload),
          imageUrl: observation.imageUrl,
          productUrl: observation.productUrl,
          stock: observation.stock != null ? String(observation.stock) : null,
          statusConfiabilidade: "parcial",
          isActive: "yes",
        });

        const insertedId = Number(
          (inserted as { insertId?: number | string }).insertId,
        );
        if (!Number.isInteger(insertedId) || insertedId <= 0) {
          throw new Error("Banco não retornou o ID do novo produto aprovado.");
        }

        productId = insertedId;
        created = true;
      }
    }

    if (!productId) {
      throw new Error(
        "Selecione o produto mestre correspondente ou aprove uma proposta de criação com EAN válido.",
      );
    }

    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .for("update")
      .limit(1);

    if (!product) throw new Error("Produto mestre selecionado não existe.");
    if (product.isActive !== "yes") {
      throw new Error("Produto mestre selecionado está inativo.");
    }

    const productEan = normalizeCaptureEan(product.ean || product.gtin || product.barcode);
    if (observedEan && productEan && observedEan !== productEan) {
      throw new Error(
        "Aprovação bloqueada: o EAN observado conflita com o produto selecionado.",
      );
    }
    if (!capturePresentationCompatible(observation.rawName, product.name)) {
      throw new Error(
        "Aprovação bloqueada: apresentação/quantidade incompatível com o produto selecionado.",
      );
    }

    const [existingOffer] = await tx
      .select({
        id: productSupplierOffers.id,
        price: productSupplierOffers.price,
        supplierCode: productSupplierOffers.supplierCode,
        link: productSupplierOffers.link,
        image: productSupplierOffers.image,
      })
      .from(productSupplierOffers)
      .where(
        and(
          eq(productSupplierOffers.productId, productId),
          eq(productSupplierOffers.supplierId, observation.supplierId),
        ),
      )
      .for("update")
      .limit(1);

    const previousPrice = numericOrNull(existingOffer?.price);
    const offerValues = {
      price: String(observedPrice),
      supplierCode: observation.supplierSku ?? existingOffer?.supplierCode ?? null,
      supplierName: supplier.name,
      link: observation.productUrl ?? existingOffer?.link ?? null,
      image: observation.imageUrl ?? existingOffer?.image ?? null,
      availability: toLegacyAvailability(observation.availability),
      promoPrice: observation.promoPrice != null ? String(observation.promoPrice) : null,
      stock: observation.stock ?? null,
      updatedAt: reviewedAt,
    };

    await tx
      .insert(productSupplierOffers)
      .values({
        productId,
        supplierId: observation.supplierId,
        ...offerValues,
        createdAt: reviewedAt,
      })
      .onDuplicateKeyUpdate({ set: offerValues });

    if (product.supplierId === observation.supplierId) {
      const productUpdates: Record<string, unknown> = {
        price: String(observedPrice),
        updatedAt: reviewedAt,
      };
      if (observation.imageUrl && !product.imageUrl) {
        productUpdates.imageUrl = observation.imageUrl;
      }
      if (observation.productUrl) {
        productUpdates.productUrl = observation.productUrl;
      }
      await tx.update(products).set(productUpdates).where(eq(products.id, productId));
    }

    const reason = notes ?? (
      created
        ? "Novo produto criado após aprovação humana."
        : "Correspondência/oferta aprovada por revisão humana."
    );

    await tx
      .update(supplierProductObservations)
      .set({
        productId,
        reviewStatus: "approved",
        reviewedAt,
        reviewedByUserId: input.userId ?? null,
        reason,
      })
      .where(
        and(
          eq(supplierProductObservations.id, observation.id),
          eq(supplierProductObservations.reviewStatus, "pending"),
        ),
      );

    await tx.insert(captureAiFeedback).values({
      supplierId: observation.supplierId,
      observationId: observation.id,
      decision: feedbackDecisionForApproval({
        created,
        originalProductId: observation.productId,
        resolvedProductId: productId,
      }),
      observedName: observation.rawName,
      expectedProductId: productId,
      expectedNormalizedName: normalizeText(product.name).slice(0, 512),
      notes: reason,
      createdByUserId: input.userId ?? null,
      reusable: true,
    });

    if (previousPrice === null || previousPrice !== observedPrice) {
      priceHistoryAfterCommit = {
        productId,
        supplierId: observation.supplierId,
        price: String(observedPrice),
      };
    }

    return {
      applied: true,
      status: "approved" as const,
      productId,
      created,
    };
  });

  if (priceHistoryAfterCommit) {
    try {
      await recordPriceHistory({
        ...priceHistoryAfterCommit,
        origem: "capture_review",
      });
    } catch (error) {
      logger.warn(
        `[CaptureReview] Decisão #${input.observationId} aplicada, mas histórico de preço falhou:`,
        (error as Error).message,
      );
    }
  }

  return result;
}
