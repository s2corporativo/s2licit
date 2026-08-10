import { eq } from "drizzle-orm";
import { z } from "zod";
import { products } from "../drizzle/schema";
import { editorProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  getProductSupplierPrices,
  upsertProductSupplierPrice,
} from "./db/supplierPrices";
import { recordAudit } from "./services/auditService";
import { ensureCatalogKnowledgeSchema } from "./services/catalogKnowledgeSchema";
import {
  createCanonicalProduct,
  type ProductMasterPatch,
  updateCanonicalProduct,
} from "./services/productCatalogService";
import { resolveProductIdentity } from "./services/productIdentityService";

const optionalText = (max: number) => z.string().trim().max(max).optional();
const importProductInput = z.object({
  name: z.string().trim().min(1).max(512),
  principioAtivo: optionalText(512),
  concentracao: optionalText(128),
  formaFarmaceutica: optionalText(128),
  fabricante: optionalText(256),
  manufacturer: optionalText(256),
  categoria: optionalText(256),
  fichaTecnica: z.string().trim().max(20_000).optional(),
  tipoCatalogo: z
    .enum([
      "medicamento_veterinario",
      "medicamento_humano",
      "produto_nao_medicamentoso",
      "material_insumo_equipamento",
    ])
    .optional(),
  ean: optionalText(64),
  gtin: optionalText(64),
  barcode: optionalText(128),
  mapa: optionalText(128),
  catmatCode: optionalText(32),
  catmasCode: optionalText(32),
  supplierId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  price: z.number().finite().positive().optional(),
  code: optionalText(128),
  supplierCode: optionalText(128),
  imageUrl: optionalText(2048),
  productUrl: optionalText(2048),
  presentation: optionalText(256),
});

type ImportProduct = z.infer<typeof importProductInput>;

function masterPatch(product: ImportProduct): ProductMasterPatch {
  return {
    activeIngredient: product.principioAtivo || null,
    concentration: product.concentracao || null,
    pharmaceuticalForm: product.formaFarmaceutica || null,
    presentation: product.presentation || null,
    manufacturer: product.fabricante || product.manufacturer || null,
    fichaTecnica: product.fichaTecnica || null,
    ean: product.ean || null,
    gtin: product.gtin || null,
    barcode: product.barcode || null,
    mapa: product.mapa || null,
    catmatCode: product.catmatCode || null,
    catmasCode: product.catmasCode || null,
    code: product.code || null,
    imageUrl: product.imageUrl || null,
    productUrl: product.productUrl || null,
    categoryId: product.categoryId ?? null,
  };
}

function fillOnlyBlank(existing: Record<string, unknown>, candidate: ProductMasterPatch) {
  const patch: ProductMasterPatch = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (value == null || value === "") continue;
    const current = existing[key];
    if (current == null || String(current).trim() === "") {
      (patch as Record<string, unknown>)[key] = value;
    }
  }
  return patch;
}

export const importSmartRouter = router({
  /**
   * Entrada canônica de catálogo.
   *
   * Responsabilidade única:
   * 1. resolver identidade global do produto;
   * 2. criar produto, completar campos vazios ou pedir revisão;
   * 3. tratar fornecedor exclusivamente como oferta comercial.
   *
   * Não classifica por IA, não gera equivalências e não executa pós-processos.
   * Essas responsabilidades pertencem aos módulos especializados.
   */
  importWithDeduplication: editorProcedure
    .input(z.object({ products: z.array(importProductInput).min(1).max(3000) }))
    .mutation(async ({ input, ctx }) => {
      await ensureCatalogKnowledgeSchema();

      const results = {
        total: input.products.length,
        created: 0,
        updated: 0,
        newSupplier: 0,
        priceUpdated: 0,
        reviewNeeded: 0,
        errors: 0,
        detailsTruncated: false,
        details: [] as Array<{
          action: string;
          name: string;
          productId?: number;
          confidence?: number;
          reason?: string;
          error?: string;
        }>,
      };

      const pushDetail = (detail: (typeof results.details)[number]) => {
        if (results.details.length < 500) results.details.push(detail);
        else results.detailsTruncated = true;
      };

      const BATCH_SIZE = 100;
      const PARALLEL = 5;

      for (let batchStart = 0; batchStart < input.products.length; batchStart += BATCH_SIZE) {
        const batch = input.products.slice(batchStart, batchStart + BATCH_SIZE);

        for (let index = 0; index < batch.length; index += PARALLEL) {
          const chunk = batch.slice(index, index + PARALLEL);
          await Promise.all(
            chunk.map(async (product) => {
              try {
                const identity = await resolveProductIdentity({
                  name: product.name,
                  principioAtivo: product.principioAtivo,
                  concentracao: product.concentracao,
                  formaFarmaceutica: product.formaFarmaceutica,
                  fabricante: product.fabricante ?? product.manufacturer,
                  categoria: product.categoria,
                  fichaTecnica: product.fichaTecnica,
                  tipoCatalogo: product.tipoCatalogo,
                  ean: product.ean,
                  gtin: product.gtin,
                  barcode: product.barcode,
                  mapa: product.mapa,
                  catmatCode: product.catmatCode,
                  catmasCode: product.catmasCode,
                  supplierId: product.supplierId,
                });

                if (identity.action === "revisar_manual") {
                  results.reviewNeeded += 1;
                  pushDetail({
                    action: identity.action,
                    name: product.name,
                    productId: identity.matchedProductId,
                    confidence: identity.confidence,
                    reason: identity.reason,
                  });
                  return;
                }

                if (identity.action === "criar_novo") {
                  const created = await createCanonicalProduct(
                    {
                      name: product.name,
                      ...masterPatch(product),
                      supplierId: product.supplierId ?? null,
                      initialPrice:
                        product.supplierId && product.price != null
                          ? String(product.price)
                          : null,
                      supplierCode: product.supplierCode ?? product.code ?? null,
                      supplierLink: product.productUrl ?? null,
                    },
                    ctx.user.id,
                  );

                  // Mesmo sem preço, registra a relação Produto × Fornecedor.
                  if (product.supplierId && product.price == null) {
                    await upsertProductSupplierPrice(
                      created.productId,
                      product.supplierId,
                      null,
                      {
                        codigoFornecedor: product.supplierCode ?? product.code,
                        linkProduto: product.productUrl,
                        origem: "catalog_import",
                      },
                    );
                  }

                  results.created += 1;
                  pushDetail({
                    action: identity.action,
                    name: product.name,
                    productId: created.productId,
                    confidence: identity.confidence,
                    reason:
                      product.price != null && !product.supplierId
                        ? "Produto criado; preço ignorado porque não há fornecedor associado"
                        : identity.reason,
                  });
                  return;
                }

                if (!identity.matchedProductId) {
                  throw new Error("Motor de identidade retornou ação sem produto correspondente");
                }

                const productId = identity.matchedProductId;
                const db = await getDb();
                if (!db) throw new Error("Database unavailable");
                const [existing] = await db
                  .select()
                  .from(products)
                  .where(eq(products.id, productId))
                  .limit(1);
                if (!existing) throw new Error("Produto canônico não encontrado");

                // Importação nunca sobrescreve dado técnico já preenchido.
                const patch = fillOnlyBlank(
                  existing as Record<string, unknown>,
                  masterPatch(product),
                );
                if (Object.keys(patch).length > 0) {
                  await updateCanonicalProduct(productId, patch, ctx.user.id);
                  results.updated += 1;
                }

                if (identity.action === "atualizar_existente") {
                  pushDetail({
                    action: identity.action,
                    name: product.name,
                    productId,
                    confidence: identity.confidence,
                    reason: identity.reason,
                  });
                  return;
                }

                if (!product.supplierId) {
                  throw new Error("Ação comercial sem fornecedor informado");
                }

                const hasCommercialPayload =
                  product.price != null ||
                  Boolean(product.supplierCode ?? product.code ?? product.productUrl);

                if (identity.action === "novo_fornecedor") {
                  await upsertProductSupplierPrice(
                    productId,
                    product.supplierId,
                    product.price == null ? null : String(product.price),
                    {
                      codigoFornecedor: product.supplierCode ?? product.code,
                      linkProduto: product.productUrl,
                      origem: "catalog_import",
                    },
                  );
                  results.newSupplier += 1;
                } else if (hasCommercialPayload) {
                  // Ausência de preço em uma atualização NÃO significa apagar o
                  // preço existente. Preserva o valor e atualiza apenas metadados.
                  let preservedPrice: string | null = null;
                  if (product.price == null) {
                    const offers = await getProductSupplierPrices(productId);
                    preservedPrice =
                      offers.find((offer) => offer.supplierId === product.supplierId)?.price ?? null;
                  }

                  await upsertProductSupplierPrice(
                    productId,
                    product.supplierId,
                    product.price == null ? preservedPrice : String(product.price),
                    {
                      codigoFornecedor: product.supplierCode ?? product.code,
                      linkProduto: product.productUrl,
                      origem: "catalog_import",
                    },
                  );
                  if (product.price != null) results.priceUpdated += 1;
                }

                pushDetail({
                  action: identity.action,
                  name: product.name,
                  productId,
                  confidence: identity.confidence,
                  reason: identity.reason,
                });
              } catch (error) {
                results.errors += 1;
                pushDetail({
                  action: "erro",
                  name: product.name,
                  error: (error as Error).message,
                });
              }
            }),
          );
        }
      }

      await recordAudit({
        userId: ctx.user.id,
        action: "canonical_catalog_import",
        entity: "products",
        summary:
          `Importação canônica: ${results.created} criados, ${results.updated} completados, ` +
          `${results.newSupplier} novas ofertas, ${results.priceUpdated} ofertas atualizadas, ` +
          `${results.reviewNeeded} para revisão, ${results.errors} erros (total ${results.total})`,
        changes: {
          total: results.total,
          created: results.created,
          updated: results.updated,
          newSupplier: results.newSupplier,
          priceUpdated: results.priceUpdated,
          reviewNeeded: results.reviewNeeded,
          errors: results.errors,
        },
      });

      return results;
    }),
});
