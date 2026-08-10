import { z } from "zod";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { recordAudit } from "../services/auditService";
import {
  catalogQualitySummary,
  getCanonicalProductDetail,
  listCanonicalCatalog,
  restoreCanonicalProduct,
  saveCanonicalOffer,
  softDeleteCanonicalProduct,
  updateCanonicalProduct,
} from "../services/productCatalogService";

const masterPatch = z.object({
  code: z.string().max(128).nullable().optional(),
  name: z.string().min(1).max(512).optional(),
  description: z.string().nullable().optional(),
  activeIngredient: z.string().max(512).nullable().optional(),
  manufacturer: z.string().max(256).nullable().optional(),
  unit: z.string().max(64).nullable().optional(),
  concentration: z.string().max(128).nullable().optional(),
  presentation: z.string().max(256).nullable().optional(),
  pharmaceuticalForm: z.string().max(128).nullable().optional(),
  stock: z.string().max(64).nullable().optional(),
  barcode: z.string().max(128).nullable().optional(),
  gtin: z.string().max(64).nullable().optional(),
  ean: z.string().max(64).nullable().optional(),
  mapa: z.string().max(128).nullable().optional(),
  registroRegulatorio: z.enum(["MAPA", "ANVISA", "FORN"]).nullable().optional(),
  catmasCode: z.string().max(32).nullable().optional(),
  catmatCode: z.string().max(32).nullable().optional(),
  informacaoTecnica: z.string().nullable().optional(),
  fichaTecnica: z.string().nullable().optional(),
  subcategoria: z.string().max(256).nullable().optional(),
  ncm: z.string().max(16).nullable().optional(),
  laboratorio: z.string().max(256).nullable().optional(),
  especieAnimal: z.string().max(256).nullable().optional(),
  viaAdministracao: z.string().max(128).nullable().optional(),
  validadeMeses: z.number().int().min(0).max(600).nullable().optional(),
  classeTerapeutica: z.string().max(256).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  productUrl: z.string().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  isActive: z.enum(["yes", "no"]).optional(),
}).strict();

export const catalogRouter = router({
  list: protectedProcedure.input(z.object({
    search: z.string().max(256).optional(),
    categoryId: z.number().int().positive().optional(),
    isActive: z.enum(["yes", "no", "all"]).optional(),
    quality: z.enum(["all", "incomplete", "without_offer", "stale_price", "without_image"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
    sort: z.enum(["name", "updatedAt"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
  }).optional()).query(({ input }) => listCanonicalCatalog(input ?? {})),

  detail: protectedProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .query(({ input }) => getCanonicalProductDetail(input.productId)),

  qualitySummary: protectedProcedure.query(() => catalogQualitySummary()),

  update: editorProcedure
    .input(z.object({ productId: z.number().int().positive(), patch: masterPatch }))
    .mutation(async ({ input, ctx }) => {
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

  softDelete: editorProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
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

  restore: editorProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
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

  saveOffer: editorProcedure
    .input(z.object({
      productId: z.number().int().positive(),
      supplierId: z.number().int().positive(),
      price: z.string().nullable(),
      supplierCode: z.string().max(128).optional(),
      link: z.string().optional(),
      origin: z.string().max(64).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await saveCanonicalOffer(input);
      await recordAudit({
        userId: ctx.user.id,
        action: "canonical_offer_upsert",
        entity: "product_supplier_offers",
        entityId: input.productId,
        summary: `Oferta atualizada para fornecedor #${input.supplierId}`,
        changes: { supplierId: input.supplierId, price: input.price, origin: input.origin ?? "catalog_central" },
      });
      return result;
    }),
});
