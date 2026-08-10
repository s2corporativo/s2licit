import { and, asc, eq, inArray, isNull, like } from "drizzle-orm";
import { z } from "zod";
import { categories, products, suppliers } from "../../drizzle/schema";
import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  applyImageByName,
  autoLinkImageUrls,
  autocompleteSearch,
  bulkApplyImageUrls,
  bulkUpdateProducts,
  compareByActiveIngredient,
  createProduct,
  deleteProduct,
  findDuplicateGroups,
  getDb,
  getProductById,
  listProducts,
  mergeProductGroup,
  searchProductsByName,
  smartSearch,
  updateProduct,
} from "../db";
import { recordAudit } from "../services/auditService";
import { analyzeEquivalences } from "../services/equivalenceCompendiumService";
import {
  applyPersistedEquivalenceMemory,
  enforceCriticalTechnicalGuards,
} from "../services/equivalenceGuardService";

const nullableText = z.string().nullable().optional();
const mapaField = z
  .string()
  .nullable()
  .optional()
  .refine(
    (value) => {
      if (!value) return true;
      const parsed = Number(value.replace(",", "."));
      return Number.isNaN(parsed) || parsed > 0;
    },
    { message: "Registro MAPA deve ser positivo" },
  );

const productWriteShape = {
  code: nullableText,
  description: nullableText,
  activeIngredient: nullableText,
  manufacturer: nullableText,
  unit: nullableText,
  concentration: nullableText,
  presentation: nullableText,
  pharmaceuticalForm: nullableText,
  price: nullableText,
  priceUnit: nullableText,
  stock: nullableText,
  barcode: nullableText,
  gtin: nullableText,
  ean: nullableText,
  registroRegulatorio: z.enum(["MAPA", "ANVISA", "FORN"]).nullable().optional(),
  codigoFornecedor: nullableText,
  catmasCode: z.string().max(32).nullable().optional(),
  catmatCode: z.string().max(32).nullable().optional(),
  informacaoTecnica: nullableText,
  fichaTecnica: nullableText,
  subcategoria: nullableText,
  mapa: mapaField,
  imageUrl: nullableText,
  productUrl: nullableText,
  isActive: z.enum(["yes", "no"]).optional(),
  freightValue: nullableText,
  taxValue: nullableText,
  ncm: nullableText,
  laboratorio: nullableText,
  nomeProduto: nullableText,
} as const;

function asPositivePrice(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export const productsRouter = router({
  // ─── Leituras de compatibilidade ──────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        categoryId: z.number().optional(),
        categoryIds: z.array(z.number()).optional(),
        supplierId: z.number().optional(),
        search: z.string().optional(),
        searchField: z
          .enum([
            "all",
            "name",
            "code",
            "activeIngredient",
            "manufacturer",
            "barcode",
            "concentration",
            "presentation",
          ])
          .optional(),
        manufacturer: z.string().optional(),
        isActive: z.enum(["yes", "no", "all"]).optional(),
        priceMin: z.number().optional(),
        priceMax: z.number().optional(),
        hasImage: z.boolean().optional(),
        hasProductUrl: z.boolean().optional(),
        withoutFichaTecnica: z.boolean().optional(),
        limit: z.number().min(1).max(500).optional(),
        offset: z.number().min(0).optional(),
        sortBy: z
          .enum(["name", "price", "mapa", "supplier", "category", "manufacturer", "createdAt"])
          .optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
      }),
    )
    .query(({ input }) => listProducts(input)),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => getProductById(input.id)),

  smartSearch: protectedProcedure
    .input(z.object({ query: z.string().min(1), categoryId: z.number().optional() }))
    .query(({ input }) => smartSearch(input.query, input.categoryId)),

  compareByActiveIngredient: protectedProcedure
    .input(z.object({ activeIngredient: z.string().min(1), categoryId: z.number().optional() }))
    .query(({ input }) => compareByActiveIngredient(input.activeIngredient, input.categoryId)),

  autocomplete: protectedProcedure
    .input(z.object({ query: z.string().min(1), limit: z.number().min(1).max(20).optional() }))
    .query(({ input }) => autocompleteSearch(input.query, input.limit ?? 12)),

  searchByName: protectedProcedure
    .input(z.object({ nameTerm: z.string().min(2), limit: z.number().min(1).max(200).optional() }))
    .query(({ input }) => searchProductsByName(input.nameTerm, input.limit ?? 100)),

  quickSearch: protectedProcedure
    .input(z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(100).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: products.id,
          name: products.name,
          manufacturer: products.manufacturer,
          price: products.price,
          priceUnit: products.priceUnit,
          unit: products.unit,
          concentration: products.concentration,
          presentation: products.presentation,
          activeIngredient: products.activeIngredient,
          imageUrl: products.imageUrl,
          productUrl: products.productUrl,
          supplierId: products.supplierId,
          supplierName: suppliers.name,
        })
        .from(products)
        .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
        .where(and(eq(products.isActive, "yes"), isNull(products.deletedAt), like(products.name, `%${input.query}%`)))
        .orderBy(asc(products.name))
        .limit(input.limit ?? 20);
    }),

  findDuplicates: protectedProcedure
    .input(
      z
        .object({
          threshold: z.number().min(0.5).max(1).optional(),
          supplierId: z.number().optional(),
          categoryId: z.number().optional(),
          limit: z.number().min(1).max(500).optional(),
        })
        .optional(),
    )
    .query(({ input }) => findDuplicateGroups(input ?? {})),

  getSupplierPrices: protectedProcedure
    .input(z.object({ productId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { getProductSupplierPrices } = await import("../db");
      return getProductSupplierPrices(input.productId);
    }),

  priceHistoryByProduct: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        supplierId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).default(20),
      }),
    )
    .query(async ({ input }) => {
      const { getPriceHistory } = await import("../db");
      return getPriceHistory(input.productId, input.supplierId, input.limit);
    }),

  findByEan: protectedProcedure
    .input(z.object({ ean: z.string().trim().min(1).max(64) }))
    .query(async ({ input }) => {
      const { findProductByEan } = await import("../db");
      return findProductByEan(input.ean);
    }),

  /**
   * Contrato legado usado pelo editor de propostas. O cálculo não vive mais
   * neste router: delega ao motor canônico do Compêndio e apenas adapta o DTO.
   */
  suggestEquivalentsByFichaTecnica: protectedProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).default(20),
        onlyWithPrice: z.boolean().default(false),
      }),
    )
    .query(async ({ input }) => {
      const analysis = await analyzeEquivalences({
        productId: input.productId,
        limit: 50,
        useAI: false,
      });

      let guarded = enforceCriticalTechnicalGuards(analysis.reference, analysis.candidates);
      guarded = await applyPersistedEquivalenceMemory({
        reference: analysis.reference,
        candidates: guarded,
      });

      const db = await getDb();
      if (!db) return { product: null, equivalents: [], totalFound: 0, fichaRef: null };

      const candidateIds = guarded.map((candidate) => candidate.id);
      const details = candidateIds.length
        ? await db
            .select({
              id: products.id,
              fichaTecnica: products.fichaTecnica,
              priceUnit: products.priceUnit,
              unit: products.unit,
              supplierId: products.supplierId,
              categoryId: products.categoryId,
              categoryName: categories.name,
              imageUrl: products.imageUrl,
              productUrl: products.productUrl,
              mapa: products.mapa,
            })
            .from(products)
            .leftJoin(categories, eq(products.categoryId, categories.id))
            .where(inArray(products.id, candidateIds))
        : [];
      const detailById = new Map(details.map((row) => [row.id, row]));
      const referenceProduct = await getProductById(input.productId);
      const referencePrice = asPositivePrice(referenceProduct?.price);

      const equivalents = guarded
        .map((candidate) => {
          const detail = detailById.get(candidate.id);
          const offer = candidate.bestOffer;
          const candidatePrice = asPositivePrice(offer?.effectivePrice ?? offer?.price);
          const economy =
            referencePrice != null && candidatePrice != null && candidatePrice < referencePrice
              ? Math.round(((referencePrice - candidatePrice) / referencePrice) * 100)
              : null;

          return {
            id: candidate.id,
            name: candidate.name,
            activeIngredient: candidate.activeIngredient,
            concentration: candidate.concentration,
            presentation: candidate.presentation,
            fichaTecnica: detail?.fichaTecnica ?? null,
            fichaParsed: {
              principioAtivo: candidate.activeIngredient ?? undefined,
              concentracao: candidate.concentration ?? undefined,
              formaFarmaceutica: candidate.pharmaceuticalForm ?? candidate.presentation ?? undefined,
              classeTerapeutica: candidate.therapeuticClass ?? undefined,
              especieAlvo: candidate.targetSpecies ?? undefined,
            },
            manufacturer: candidate.manufacturer,
            price: candidatePrice == null ? null : String(candidatePrice),
            priceUnit: detail?.priceUnit ?? null,
            unit: detail?.unit ?? null,
            supplierId: offer?.supplierId ?? detail?.supplierId ?? null,
            supplierName: offer?.supplierName ?? null,
            categoryId: detail?.categoryId ?? null,
            categoryName: detail?.categoryName ?? null,
            imageUrl: detail?.imageUrl ?? null,
            productUrl: detail?.productUrl ?? null,
            mapa: candidate.regulatoryNumber ?? detail?.mapa ?? null,
            score: candidate.technicalScore,
            technicalScore: candidate.technicalScore,
            matchDetails: Object.entries(candidate.breakdown).map(([field, breakdown]) => ({
              field,
              refValue: breakdown.ref ?? "",
              candValue: breakdown.candidate ?? "",
              match: breakdown.score >= 80,
            })),
            status: candidate.status,
            economia: economy,
            aiAssessment: candidate.aiAssessment,
          };
        })
        .filter((candidate) => !input.onlyWithPrice || asPositivePrice(candidate.price) != null);

      const statusRank = { APROVADO: 0, REVISAO: 1, DIVERGENTE: 2 } as const;
      equivalents.sort((a, b) => {
        const statusDiff = statusRank[a.status] - statusRank[b.status];
        if (statusDiff !== 0) return statusDiff;
        if (b.score !== a.score) return b.score - a.score;
        return (asPositivePrice(a.price) ?? Number.POSITIVE_INFINITY) -
          (asPositivePrice(b.price) ?? Number.POSITIVE_INFINITY);
      });

      return {
        product: referenceProduct,
        equivalents: equivalents.slice(0, input.limit),
        totalFound: equivalents.length,
        fichaRef: {
          principioAtivo: analysis.reference.activeIngredient ?? undefined,
          concentracao: analysis.reference.concentration ?? undefined,
          formaFarmaceutica:
            analysis.reference.pharmaceuticalForm ?? analysis.reference.presentation ?? undefined,
          classeTerapeutica: analysis.reference.therapeuticClass ?? undefined,
          especieAlvo: analysis.reference.targetSpecies ?? undefined,
        },
      };
    }),

  exportToExcel: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        categoryId: z.number().optional(),
        isActive: z.enum(["yes", "no", "all"]).optional(),
        withoutFichaTecnica: z.boolean().optional(),
        withoutCategory: z.boolean().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(5000).default(2000),
      }),
    )
    .query(async ({ input }) => {
      const { exportProductsToExcel } = await import("../exportExcel");
      const buffer = await exportProductsToExcel(input);
      return {
        data: buffer.toString("base64"),
        filename: `catalogo-produtos-${new Date().toISOString().split("T")[0]}.xlsx`,
      };
    }),

  // ─── Escritas legadas: editor-only ────────────────────────────────────────
  create: editorProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(512),
        supplierId: z.number().int().positive(),
        categoryId: z.number().int().positive(),
        ...productWriteShape,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await createProduct(input);
      await recordAudit({
        userId: ctx.user.id,
        action: "product_create_legacy",
        entity: "products",
        entityId: Number((result as { insertId?: number }).insertId ?? 0) || null,
        summary: `Produto criado pela fachada legada: ${input.name}`,
      });
      return result;
    }),

  update: editorProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(512).optional(),
        supplierId: z.number().int().positive().optional(),
        categoryId: z.number().int().positive().optional(),
        ...productWriteShape,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const result = await updateProduct(id, data);
      await recordAudit({
        userId: ctx.user.id,
        action: "product_update_legacy",
        entity: "products",
        entityId: id,
        summary: `Produto atualizado pela fachada legada (${Object.keys(data).join(", ")})`,
      });
      return result;
    }),

  bulkUpdate: editorProcedure
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).min(1).max(2000),
        supplierId: z.number().int().positive().optional(),
        categoryId: z.number().int().positive().optional(),
        name: z.string().optional(),
        priceAdjustPercent: z.number().gt(-100).optional(),
        ...productWriteShape,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { ids, ...data } = input;
      const result = await bulkUpdateProducts(ids, data);
      await recordAudit({
        userId: ctx.user.id,
        action: "product_bulk_update_legacy",
        entity: "products",
        summary: `${ids.length} produto(s) atualizados pela fachada legada`,
        changes: { ids: ids.slice(0, 500), fields: Object.keys(data) },
      });
      return result;
    }),

  delete: editorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await deleteProduct(input.id);
      await recordAudit({
        userId: ctx.user.id,
        action: "product_delete_legacy",
        entity: "products",
        entityId: input.id,
        summary: `Produto #${input.id} desativado pela fachada legada`,
      });
      return { deleted: true };
    }),

  bulkDelete: editorProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(2000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const [result] = await db
        .update(products)
        .set({ isActive: "no", deletedAt: new Date() })
        .where(and(inArray(products.id, input.ids), isNull(products.mergedIntoId)));
      await recordAudit({
        userId: ctx.user.id,
        action: "product_bulk_delete_legacy",
        entity: "products",
        summary: `${input.ids.length} produto(s) solicitados para desativação em lote`,
        changes: { ids: input.ids.slice(0, 500) },
      });
      return {
        deleted: Number((result as { affectedRows?: number }).affectedRows ?? input.ids.length),
      };
    }),

  applyImageByName: editorProcedure
    .input(z.object({ nameTerm: z.string().min(2), imageUrl: z.string().url() }))
    .mutation(({ input }) => applyImageByName(input.nameTerm, input.imageUrl)),

  autoLinkImageUrls: editorProcedure
    .input(z.object({ imageUrls: z.array(z.string().url()).max(1000) }))
    .mutation(({ input }) => autoLinkImageUrls(input.imageUrls)),

  bulkApplyImageUrls: editorProcedure
    .input(
      z.object({
        items: z
          .array(z.object({ productId: z.number().int().positive(), imageUrl: z.string().url() }))
          .max(1000),
      }),
    )
    .mutation(({ input }) => bulkApplyImageUrls(input.items)),

  upsertSupplierPrice: editorProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        supplierId: z.number().int().positive(),
        price: z.string().nullable(),
        codigoFornecedor: z.string().optional(),
        linkProduto: z.string().url().optional(),
        origem: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { upsertProductSupplierPrice } = await import("../db");
      await upsertProductSupplierPrice(input.productId, input.supplierId, input.price, {
        codigoFornecedor: input.codigoFornecedor,
        linkProduto: input.linkProduto,
        origem: input.origem ?? "manual_legacy",
      });
      return { ok: true };
    }),

  deleteSupplierPrice: editorProcedure
    .input(z.object({ productId: z.number().int().positive(), supplierId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const { deleteProductSupplierPrice } = await import("../db");
      await deleteProductSupplierPrice(input.productId, input.supplierId);
      return { ok: true };
    }),

  mergeDuplicates: editorProcedure
    .input(
      z.object({
        masterId: z.number().int().positive(),
        duplicateIds: z.array(z.number().int().positive()).min(1).max(100),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.duplicateIds.includes(input.masterId)) {
        throw new Error("O produto mestre não pode estar na lista de duplicados");
      }
      const result = await mergeProductGroup(input.masterId, input.duplicateIds, ctx.user.id);
      await recordAudit({
        userId: ctx.user.id,
        action: "product_merge_legacy",
        entity: "products",
        entityId: input.masterId,
        summary: `${input.duplicateIds.length} produto(s) fundidos no mestre #${input.masterId}`,
        changes: { duplicateIds: input.duplicateIds, mergeEventId: result.mergeEventId },
      });
      return result;
    }),
});
