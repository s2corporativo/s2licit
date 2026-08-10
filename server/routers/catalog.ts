import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { recordAudit } from "../services/auditService";
import {
  getCatalogIntegrityHealth,
  repairCatalogConsistency,
} from "../services/catalogHealthService";
import { ensureCatalogKnowledgeSchema } from "../services/catalogKnowledgeSchema";
import {
  catalogQualitySummary,
  createCanonicalProduct,
  deleteCanonicalOffer,
  getCanonicalProductDetail,
  listCanonicalCatalog,
  restoreCanonicalProduct,
  saveCanonicalOffer,
  softDeleteCanonicalProduct,
  updateCanonicalProduct,
} from "../services/productCatalogService";

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalUrl = z.string().trim().url().max(2048).optional();
const canonicalPrice = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,4})?$/, "Preço inválido")
  .transform((value) => value.replace(",", "."));

const productMasterInput = z
  .object({
    code: nullableText(128),
    name: z.string().trim().min(1).max(512),
    description: z.string().trim().nullable().optional(),
    activeIngredient: nullableText(512),
    manufacturer: nullableText(256),
    unit: nullableText(64),
    concentration: nullableText(128),
    presentation: nullableText(256),
    pharmaceuticalForm: nullableText(128),
    stock: nullableText(64),
    barcode: nullableText(128),
    gtin: nullableText(64),
    ean: nullableText(64),
    mapa: nullableText(128),
    registroRegulatorio: z.enum(["MAPA", "ANVISA", "FORN"]).nullable().optional(),
    catmasCode: nullableText(32),
    catmatCode: nullableText(32),
    informacaoTecnica: z.string().trim().nullable().optional(),
    fichaTecnica: z.string().trim().nullable().optional(),
    subcategoria: nullableText(256),
    ncm: nullableText(16),
    laboratorio: nullableText(256),
    especieAnimal: nullableText(256),
    viaAdministracao: nullableText(128),
    validadeMeses: z.number().int().min(0).max(600).nullable().optional(),
    classeTerapeutica: nullableText(256),
    imageUrl: z.string().trim().max(2048).nullable().optional(),
    productUrl: z.string().trim().max(2048).nullable().optional(),
    categoryId: z.number().int().positive().nullable().optional(),
    isActive: z.enum(["yes", "no"]).optional(),
  })
  .strict();

const masterPatch = productMasterInput.partial().strict();

const createInput = productMasterInput
  .extend({
    supplierId: z.number().int().positive().nullable().optional(),
    initialPrice: canonicalPrice.nullable().optional(),
    supplierCode: nullableText(128),
    supplierLink: z.string().trim().url().max(2048).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.initialPrice != null && input.supplierId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supplierId"],
        message: "Preço inicial exige fornecedor",
      });
    }
  });

const listInput = z
  .object({
    search: z.string().trim().max(256).optional(),
    categoryId: z.number().int().positive().optional(),
    isActive: z.enum(["yes", "no", "all"]).optional(),
    quality: z
      .enum(["all", "incomplete", "without_offer", "stale_price", "without_image"])
      .optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
    sort: z.enum(["name", "updatedAt"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
  })
  .strict()
  .optional();

async function initialized<T>(operation: () => Promise<T>): Promise<T> {
  await ensureCatalogKnowledgeSchema();
  return operation();
}

export const catalogRouter = router({
  create: editorProcedure.input(createInput).mutation(async ({ input, ctx }) =>
    initialized(async () => {
      const result = await createCanonicalProduct(input, ctx.user.id);
      await recordAudit({
        userId: ctx.user.id,
        action: "canonical_product_create",
        entity: "products",
        entityId: result.productId,
        summary: `Produto canônico criado: ${input.name}`,
        changes: { categoryId: input.categoryId, supplierId: input.supplierId },
      });
      return result;
    }),
  ),

  list: protectedProcedure.input(listInput).query(({ input }) =>
    initialized(() => listCanonicalCatalog(input ?? {})),
  ),

  detail: protectedProcedure
    .input(z.object({ productId: z.number().int().positive() }).strict())
    .query(({ input }) => initialized(() => getCanonicalProductDetail(input.productId))),

  qualitySummary: protectedProcedure.query(() => initialized(() => catalogQualitySummary())),

  health: protectedProcedure.query(() => initialized(() => getCatalogIntegrityHealth())),

  repair: editorProcedure.mutation(async ({ ctx }) =>
    initialized(async () => {
      const result = await repairCatalogConsistency();
      await recordAudit({
        userId: ctx.user.id,
        action: "canonical_catalog_repair",
        entity: "products",
        summary: `Reconciliação: ${result.offersBackfilled} ofertas, ${result.pricesMirrored} preços`,
      });
      return result;
    }),
  ),

  update: editorProcedure
    .input(
      z
        .object({
          productId: z.number().int().positive(),
          patch: masterPatch,
        })
        .strict(),
    )
    .mutation(async ({ input, ctx }) =>
      initialized(async () => {
        const result = await updateCanonicalProduct(input.productId, input.patch, ctx.user.id);
        await recordAudit({
          userId: ctx.user.id,
          action: "canonical_product_update",
          entity: "products",
          entityId: input.productId,
          summary: `Produto canônico atualizado: ${Object.keys(input.patch).join(", ")}`,
          changes: input.patch,
        });
        return result;
      }),
    ),

  softDelete: editorProcedure
    .input(z.object({ productId: z.number().int().positive() }).strict())
    .mutation(async ({ input, ctx }) =>
      initialized(async () => {
        const result = await softDeleteCanonicalProduct(input.productId);
        await recordAudit({
          userId: ctx.user.id,
          action: "canonical_product_soft_delete",
          entity: "products",
          entityId: input.productId,
          summary: "Produto desativado por soft-delete",
        });
        return result;
      }),
    ),

  restore: editorProcedure
    .input(z.object({ productId: z.number().int().positive() }).strict())
    .mutation(async ({ input, ctx }) =>
      initialized(async () => {
        const result = await restoreCanonicalProduct(input.productId);
        await recordAudit({
          userId: ctx.user.id,
          action: "canonical_product_restore",
          entity: "products",
          entityId: input.productId,
          summary: "Produto restaurado ao catálogo",
        });
        return result;
      }),
    ),

  saveOffer: editorProcedure
    .input(
      z
        .object({
          productId: z.number().int().positive(),
          supplierId: z.number().int().positive(),
          price: canonicalPrice,
          supplierCode: z.string().trim().max(128).optional(),
          link: optionalUrl,
          origin: z.string().trim().max(64).optional(),
        })
        .strict(),
    )
    .mutation(async ({ input, ctx }) =>
      initialized(async () => {
        const result = await saveCanonicalOffer(input);
        await recordAudit({
          userId: ctx.user.id,
          action: "canonical_offer_upsert",
          entity: "product_supplier_offers",
          entityId: input.productId,
          summary: `Oferta atualizada para fornecedor #${input.supplierId}`,
          changes: {
            supplierId: input.supplierId,
            price: input.price,
            origin: input.origin ?? "catalog_central",
          },
        });
        return result;
      }),
    ),

  deleteOffer: editorProcedure
    .input(
      z
        .object({
          productId: z.number().int().positive(),
          supplierId: z.number().int().positive(),
        })
        .strict(),
    )
    .mutation(async ({ input, ctx }) =>
      initialized(async () => {
        const result = await deleteCanonicalOffer(input.productId, input.supplierId);
        await recordAudit({
          userId: ctx.user.id,
          action: "canonical_offer_delete",
          entity: "product_supplier_offers",
          entityId: input.productId,
          summary: `Oferta removida do fornecedor #${input.supplierId}`,
          changes: { supplierId: input.supplierId },
        });
        return result;
      }),
    ),
});
