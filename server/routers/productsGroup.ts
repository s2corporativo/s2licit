

import { z } from "zod";
import {
  bulkUpdateProducts,
  compareByActiveIngredient,
  createProduct,
  deleteProduct,
  getProductById,
  listProducts,
  autocompleteSearch,
  searchProductsByName,
  applyImageByName,
  smartSearch,
  updateProduct,
  autoLinkImageUrls,
  bulkApplyImageUrls,
  getDb,
  findDuplicateGroups,
  mergeProductGroup,
} from "../db";
import {
  products, categories, suppliers,
} from "../../drizzle/schema";
import { or, like, sql, eq, asc, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { recordAudit } from "../services/auditService";

export const productsRouter = router({
    list: protectedProcedure
      .input(
        z.object({
          categoryId: z.number().optional(),
          categoryIds: z.array(z.number()).optional(),
          supplierId: z.number().optional(),
          search: z.string().optional(),
          searchField: z.enum(["all", "name", "code", "activeIngredient", "manufacturer", "barcode", "concentration", "presentation"]).optional(),
          manufacturer: z.string().optional(),
          isActive: z.enum(["yes", "no", "all"]).optional(),
          priceMin: z.number().optional(),
          priceMax: z.number().optional(),
          hasImage: z.boolean().optional(),
          hasProductUrl: z.boolean().optional(),
          withoutFichaTecnica: z.boolean().optional(),
          limit: z.number().min(1).max(500).optional(),
          offset: z.number().min(0).optional(),
          sortBy: z.enum(["name", "price", "mapa", "supplier", "category", "manufacturer", "createdAt"]).optional(),
          sortDir: z.enum(["asc", "desc"]).optional(),
        })
      )
      .query(({ input }) => listProducts(input as any)),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getProductById(input.id)),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(512),
          supplierId: z.number(),
          categoryId: z.number(),
          code: z.string().optional().nullable(),
          description: z.string().optional().nullable(),
          activeIngredient: z.string().optional().nullable(),
          manufacturer: z.string().optional().nullable(),
          unit: z.string().optional().nullable(),
          concentration: z.string().optional().nullable(),
          presentation: z.string().optional().nullable(),
          price: z.string().optional().nullable(),
          priceUnit: z.string().optional().nullable(),
          stock: z.string().optional().nullable(),
          barcode: z.string().optional().nullable(),
          catmasCode: z.string().max(32).optional().nullable(),
          catmatCode: z.string().max(32).optional().nullable(),
          mapa: z.string().optional().nullable().refine(
            (v) => { if (!v) return true; const n = parseFloat(v.replace(',','.')); return isNaN(n) || n > 0; },
            { message: "Registro MAPA deve ser positivo" }
          ),
          imageUrl: z.string().optional().nullable(),
          productUrl: z.string().optional().nullable(),
          isActive: z.enum(["yes", "no"]).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const result = await createProduct(input as any);
        await recordAudit({
          userId: ctx.user?.id,
          action: "product_create",
          entity: "products",
          entityId: Number((result as any)?.insertId) || null,
          summary: `Produto criado: ${input.name}`,
        });
        return result;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          code: z.string().optional().nullable(),
          name: z.string().min(1).max(512).optional(),
          description: z.string().optional().nullable(),
          activeIngredient: z.string().optional().nullable(),
          manufacturer: z.string().optional().nullable(),
          unit: z.string().optional().nullable(),
          concentration: z.string().optional().nullable(),
          presentation: z.string().optional().nullable(),
          pharmaceuticalForm: z.string().optional().nullable(),
          price: z.string().optional().nullable(),
          priceUnit: z.string().optional().nullable(),
          stock: z.string().optional().nullable(),
          barcode: z.string().optional().nullable(),
          gtin: z.string().optional().nullable(),
          ean: z.string().optional().nullable(),
          registroRegulatorio: z.enum(["MAPA", "ANVISA", "FORN"]).optional().nullable(),
          codigoFornecedor: z.string().optional().nullable(),
          catmasCode: z.string().max(32).optional().nullable(),
          catmatCode: z.string().max(32).optional().nullable(),
          informacaoTecnica: z.string().optional().nullable(),
          fichaTecnica: z.string().optional().nullable(),
          subcategoria: z.string().optional().nullable(),
          mapa: z.string().optional().nullable().refine(
            (v) => { if (!v) return true; const n = parseFloat(v.replace(',','.')); return isNaN(n) || n > 0; },
            { message: "Registro MAPA deve ser positivo" }
          ),
          imageUrl: z.string().optional().nullable(),
          productUrl: z.string().optional().nullable(),
          isActive: z.enum(["yes", "no"]).optional(),
          supplierId: z.number().optional(),
          categoryId: z.number().optional(),
          freightValue: z.string().optional().nullable(),
          taxValue: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const result = await updateProduct(id, data as any);
        await recordAudit({
          userId: ctx.user?.id,
          action: "product_update",
          entity: "products",
          entityId: id,
          summary: `Produto atualizado (campos: ${Object.keys(data).join(", ")})`,
        });
        return result;
      }),

    bulkUpdate: protectedProcedure
      .input(
        z.object({
          ids: z.array(z.number()).min(1),
          supplierId: z.number().optional(),
          categoryId: z.number().optional(),
          name: z.string().optional(),
          code: z.string().optional(),
          activeIngredient: z.string().optional(),
          manufacturer: z.string().optional(),
          concentration: z.string().optional(),
          presentation: z.string().optional(),
          pharmaceuticalForm: z.string().optional(),
          unit: z.string().optional(),
          price: z.string().optional(),
          priceUnit: z.string().optional(),
          mapa: z.string().optional(),
          barcode: z.string().optional(),
          description: z.string().optional(),
          imageUrl: z.string().optional(),
          productUrl: z.string().optional(),
          stock: z.string().optional(),
          isActive: z.enum(["yes", "no"]).optional(),
          priceAdjustPercent: z.number().optional(),
          // Campos V2
          fichaTecnica: z.string().optional().nullable(),
          codigoFornecedor: z.string().optional().nullable(),
          ean: z.string().optional().nullable(),
          gtin: z.string().optional().nullable(),
          subcategoria: z.string().optional().nullable(),
          registroRegulatorio: z.enum(["MAPA", "ANVISA", "FORN"]).optional().nullable(),
          laboratorio: z.string().optional().nullable(),
          nomeProduto: z.string().optional().nullable(),
        })
      )
      .mutation(({ input }) => {
        const { ids, ...data } = input;
        return bulkUpdateProducts(ids, data as any);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteProduct(input.id);
        await recordAudit({
          userId: ctx.user?.id,
          action: "product_delete",
          entity: "products",
          entityId: input.id,
          summary: `Produto excluído (id ${input.id})`,
        });
      }),

    bulkDelete: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        for (const id of input.ids) {
          await deleteProduct(id);
        }
        await recordAudit({
          userId: ctx.user?.id,
          action: "product_bulk_delete",
          entity: "products",
          summary: `${input.ids.length} produtos excluídos em massa`,
          changes: { ids: input.ids.slice(0, 500) },
        });
        return { deleted: input.ids.length };
      }),

    /**
     * Resolve duplicados dos produtos selecionados (ação em massa).
     * Usa a detecção canônica (db/duplicateMerge — nome normalizado ≥0.82
     * ou mesmo princípio ativo + nome ≥0.65) e processa apenas os grupos em
     * que TODOS os membros estão na seleção. Para cada grupo, escolhe como
     * mestre o produto com mais dados preenchidos e executa o merge seguro
     * transacional (soft-delete + mergedIntoId + redirecionamento de
     * propostas, ofertas e preços).
     */
    bulkResolveDuplicates: protectedProcedure
      .input(z.object({ ids: z.array(z.number()).min(1) }))
      .mutation(async ({ input, ctx }) => {
        const groups = await findDuplicateGroups({ threshold: 0.82, limit: 500 });
        const selected = new Set(input.ids);
        const applicable = groups.filter((g) => g.products.length >= 2 && g.products.every((p) => selected.has(p.id)));
        let merged = 0;
        let redirected = 0;
        const processed: Array<{ groupId: number; masterId: number; duplicateIds: number[]; reason: string; similarity: number }> = [];
        for (const g of applicable) {
          const sorted = [...g.products].sort((a, b) => {
            const scoreA = (a.name?.length ?? 0) + (a.price ? 10 : 0) + (a.concentration ? 10 : 0) + (a.activeIngredient ? 10 : 0) + (a.presentation ? 5 : 0);
            const scoreB = (b.name?.length ?? 0) + (b.price ? 10 : 0) + (b.concentration ? 10 : 0) + (b.activeIngredient ? 10 : 0) + (b.presentation ? 5 : 0);
            return scoreB - scoreA;
          });
          const masterId = sorted[0].id;
          const duplicateIds = sorted.slice(1).map((p) => p.id);
          const res = await mergeProductGroup(masterId, duplicateIds);
          merged += res.merged;
          redirected += res.redirected;
          processed.push({ groupId: g.groupId, masterId, duplicateIds, reason: g.reason, similarity: g.similarity });
        }
        await recordAudit({
          userId: ctx.user?.id,
          action: "product_bulk_resolve_duplicates",
          entity: "products",
          summary: `${processed.length} grupo(s) de duplicados resolvidos entre ${input.ids.length} produtos selecionados (${merged} mesclados)`,
          changes: { selected: input.ids.slice(0, 500), processed: processed.slice(0, 100) },
        });
        return { groups: processed.length, merged, redirected };
      }),

    smartSearch: protectedProcedure
      .input(
        z.object({
          query: z.string().min(1),
          categoryId: z.number().optional(),
        })
      )
      .query(({ input }) => smartSearch(input.query, input.categoryId)),

    compareByActiveIngredient: protectedProcedure
      .input(
        z.object({
          activeIngredient: z.string().min(1),
          categoryId: z.number().optional(),
        })
      )
      .query(({ input }) =>
        compareByActiveIngredient(input.activeIngredient, input.categoryId)
      ),

    autocomplete: protectedProcedure
      .input(
        z.object({
          query: z.string().min(1),
          limit: z.number().min(1).max(20).optional(),
        })
      )
      .query(({ input }) => autocompleteSearch(input.query, input.limit ?? 12)),

    // ─── Image Management ───────────────────────────────────────────────
    searchByName: protectedProcedure
      .input(
        z.object({
          nameTerm: z.string().min(2),
          limit: z.number().min(1).max(200).optional(),
        })
      )
      .query(({ input }) => searchProductsByName(input.nameTerm, input.limit ?? 100)),
    quickSearch: protectedProcedure
      .input(z.object({ query: z.string().min(1), limit: z.number().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const rows = await db
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
          .where(and(eq(products.isActive, "yes"), like(products.name, `%${input.query}%`)))
          .orderBy(asc(products.name))
          .limit(input.limit ?? 20);
        return rows;
      }),

    applyImageByName: protectedProcedure
      .input(
        z.object({
          nameTerm: z.string().min(2),
          imageUrl: z.string().url(),
        })
      )
      .mutation(({ input }) => applyImageByName(input.nameTerm, input.imageUrl)),

    // Auto-link: dado array de URLs, tenta vincular cada uma a um produto pelo nome extraído da URL
    autoLinkImageUrls: protectedProcedure
      .input(z.object({ imageUrls: z.array(z.string()) }))
      .mutation(({ input }) => autoLinkImageUrls(input.imageUrls)),

    // Aplica em lote as URLs de imagem nos produtos correspondentes
    bulkApplyImageUrls: protectedProcedure
      .input(
        z.object({
          items: z.array(
            z.object({
              productId: z.number(),
              imageUrl: z.string(),
            })
          ),
        })
      )
      .mutation(({ input }) => bulkApplyImageUrls(input.items)),

    // ─── Detecção de duplicatas por fuzzy matching ─────────────────────────
    findDuplicates: protectedProcedure
      .input(z.object({
        threshold: z.number().min(0.5).max(1).optional(),
        supplierId: z.number().optional(),
        categoryId: z.number().optional(),
        limit: z.number().min(1).max(500).optional(),
      }).optional())
      .query(({ input }) => findDuplicateGroups(input ?? {})),
    // ─── Preços por Fornecedor ───────────────────────────────────────────────────
    getSupplierPrices: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input }) => {
        const { getProductSupplierPrices } = await import("../db");
        return getProductSupplierPrices(input.productId);
      }),
    upsertSupplierPrice: protectedProcedure
      .input(z.object({
        productId: z.number(),
        supplierId: z.number(),
        price: z.string().nullable(),
        codigoFornecedor: z.string().optional(),
        linkProduto: z.string().optional(),
        origem: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { upsertProductSupplierPrice } = await import("../db");
        await upsertProductSupplierPrice(input.productId, input.supplierId, input.price, {
          codigoFornecedor: input.codigoFornecedor,
          linkProduto: input.linkProduto,
          origem: input.origem ?? 'manual',
        });
        return { ok: true };
      }),
    priceHistoryByProduct: protectedProcedure
      .input(z.object({ productId: z.number(), supplierId: z.number().optional(), limit: z.number().default(20) }))
      .query(async ({ input }) => {
        const { getPriceHistory } = await import("../db");
        return getPriceHistory(input.productId, input.supplierId, input.limit);
      }),
    findByEan: protectedProcedure
      .input(z.object({ ean: z.string() }))
      .query(async ({ input }) => {
        const { findProductByEan } = await import("../db");
        return findProductByEan(input.ean);
      }),
    deleteSupplierPrice: protectedProcedure
      .input(z.object({
        productId: z.number(),
        supplierId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { deleteProductSupplierPrice } = await import("../db");
        await deleteProductSupplierPrice(input.productId, input.supplierId);
        return { ok: true };
      }),
    // ─── Sugestão de Equivalentes por Ficha Técnica ────────────────────────────
    /**
     * Dado um productId, extrai a ficha técnica estruturada do produto e busca
     * candidatos equivalentes no catálogo, ranqueando por score de compatibilidade
     * técnica (princípio ativo, concentração, forma farmacêutica, classe terapêutica)
     * e ordenando os aprovados pelo menor preço.
     */
    suggestEquivalentsByFichaTecnica: protectedProcedure
      .input(z.object({
        productId: z.number(),
        limit: z.number().int().min(1).max(50).default(20),
        onlyWithPrice: z.boolean().default(false),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { product: null, equivalents: [], totalFound: 0 };

        // 1. Buscar o produto de referência com ficha técnica
        const [ref] = await db
          .select({
            id: products.id,
            name: products.name,
            activeIngredient: products.activeIngredient,
            concentration: products.concentration,
            presentation: products.presentation,
            fichaTecnica: products.fichaTecnica,
            manufacturer: products.manufacturer,
            price: products.price,
            priceUnit: products.priceUnit,
            unit: products.unit,
            supplierId: products.supplierId,
            imageUrl: products.imageUrl,
            productUrl: products.productUrl,
            categoryId: products.categoryId,
          })
          .from(products)
          .where(eq(products.id, input.productId))
          .limit(1);

        if (!ref) return { product: null, equivalents: [], totalFound: 0 };

        // 2. Parsear ficha técnica estruturada (JSON ou texto livre)
        type FichaParsed = {
          principioAtivo?: string;
          concentracao?: string;
          formaFarmaceutica?: string;
          classeTerapeutica?: string;
          especieAlvo?: string;
          indicacoes?: string;
        };
        let fichaRef: FichaParsed = {};
        if (ref.fichaTecnica) {
          try {
            const parsed = JSON.parse(ref.fichaTecnica);
            fichaRef = {
              principioAtivo: parsed.principioAtivo ?? parsed.principio_ativo ?? parsed.activeIngredient ?? ref.activeIngredient ?? undefined,
              concentracao: parsed.concentracao ?? parsed.concentration ?? ref.concentration ?? undefined,
              formaFarmaceutica: parsed.formaFarmaceutica ?? parsed.forma_farmaceutica ?? parsed.formFarmaceutica ?? ref.presentation ?? undefined,
              classeTerapeutica: parsed.classeTerapeutica ?? parsed.classe_terapeutica ?? undefined,
              especieAlvo: parsed.especieAlvo ?? parsed.especie_alvo ?? undefined,
              indicacoes: parsed.indicacoes ?? undefined,
            };
          } catch {
            // Texto livre — usar campos diretos do produto
            fichaRef = {
              principioAtivo: ref.activeIngredient ?? undefined,
              concentracao: ref.concentration ?? undefined,
              formaFarmaceutica: ref.presentation ?? undefined,
            };
          }
        } else {
          fichaRef = {
            principioAtivo: ref.activeIngredient ?? undefined,
            concentracao: ref.concentration ?? undefined,
            formaFarmaceutica: ref.presentation ?? undefined,
          };
        }

        // 3. Buscar candidatos por princípio ativo (campo direto + ficha técnica)
        const paSearch = fichaRef.principioAtivo ?? ref.activeIngredient;
        if (!paSearch || paSearch.trim().length < 2) {
          return { product: ref, equivalents: [], totalFound: 0, fichaRef };
        }

        const paTerm = `%${paSearch.trim()}%`;
        const candidates = await db
          .select({
            id: products.id,
            name: products.name,
            activeIngredient: products.activeIngredient,
            concentration: products.concentration,
            presentation: products.presentation,
            fichaTecnica: products.fichaTecnica,
            manufacturer: products.manufacturer,
            price: products.price,
            priceUnit: products.priceUnit,
            unit: products.unit,
            supplierId: products.supplierId,
            supplierName: suppliers.name,
            categoryId: products.categoryId,
            categoryName: categories.name,
            imageUrl: products.imageUrl,
            productUrl: products.productUrl,
            mapa: products.mapa,
          })
          .from(products)
          .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .where(
            and(
              eq(products.isActive, "yes"),
              sql`${products.id} != ${input.productId}`,
              or(
                like(products.activeIngredient, paTerm),
                like(products.fichaTecnica, paTerm),
              )
            )
          )
          .orderBy(asc(products.price))
          .limit(200);

        // 4. Calcular score de equivalência técnica para cada candidato
        type EquivalentResult = {
          id: number;
          name: string;
          activeIngredient: string | null;
          concentration: string | null;
          presentation: string | null;
          fichaTecnica: string | null;
          fichaParsed: FichaParsed;
          manufacturer: string | null;
          price: string | null;
          priceUnit: string | null;
          unit: string | null;
          supplierId: number | null;
          supplierName: string | null;
          categoryId: number | null;
          categoryName: string | null;
          imageUrl: string | null;
          productUrl: string | null;
          mapa: string | null;
          score: number;
          matchDetails: { field: string; refValue: string; candValue: string; match: boolean }[];
          status: "APROVADO" | "REVISAO" | "DIVERGENTE";
          economia: number | null;
        };

        const normalize = (s?: string | null) =>
          (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        const scored: EquivalentResult[] = [];

        for (const cand of candidates) {
          if (input.onlyWithPrice && (!cand.price || parseFloat(String(cand.price)) <= 0)) continue;

          // Parsear ficha técnica do candidato
          let fichaCand: FichaParsed = {};
          if (cand.fichaTecnica) {
            try {
              const parsed = JSON.parse(cand.fichaTecnica);
              fichaCand = {
                principioAtivo: parsed.principioAtivo ?? parsed.principio_ativo ?? parsed.activeIngredient ?? cand.activeIngredient ?? undefined,
                concentracao: parsed.concentracao ?? parsed.concentration ?? cand.concentration ?? undefined,
                formaFarmaceutica: parsed.formaFarmaceutica ?? parsed.forma_farmaceutica ?? cand.presentation ?? undefined,
                classeTerapeutica: parsed.classeTerapeutica ?? parsed.classe_terapeutica ?? undefined,
                especieAlvo: parsed.especieAlvo ?? parsed.especie_alvo ?? undefined,
                indicacoes: parsed.indicacoes ?? undefined,
              };
            } catch {
              fichaCand = {
                principioAtivo: cand.activeIngredient ?? undefined,
                concentracao: cand.concentration ?? undefined,
                formaFarmaceutica: cand.presentation ?? undefined,
              };
            }
          } else {
            fichaCand = {
              principioAtivo: cand.activeIngredient ?? undefined,
              concentracao: cand.concentration ?? undefined,
              formaFarmaceutica: cand.presentation ?? undefined,
            };
          }

          // Calcular score por campo
          const matchDetails: EquivalentResult["matchDetails"] = [];
          let totalPoints = 0;
          let earnedPoints = 0;
          let hasCriticalDivergence = false;

          // Princípio ativo (crítico — peso 40)
          const paRef = normalize(fichaRef.principioAtivo);
          const paCand = normalize(fichaCand.principioAtivo);
          if (paRef && paCand) {
            totalPoints += 40;
            const match = paRef === paCand || paCand.includes(paRef) || paRef.includes(paCand);
            if (match) earnedPoints += 40;
            else hasCriticalDivergence = true;
            matchDetails.push({ field: "Princípio Ativo", refValue: fichaRef.principioAtivo!, candValue: fichaCand.principioAtivo!, match });
          }

          // Concentração (crítico — peso 30)
          const concRef = normalize(fichaRef.concentracao);
          const concCand = normalize(fichaCand.concentracao);
          if (concRef && concCand) {
            totalPoints += 30;
            const match = concRef === concCand || concCand.includes(concRef) || concRef.includes(concCand);
            if (match) earnedPoints += 30;
            else hasCriticalDivergence = true;
            matchDetails.push({ field: "Concentração", refValue: fichaRef.concentracao!, candValue: fichaCand.concentracao!, match });
          }

          // Forma farmacêutica (importante — peso 20)
          const ffRef = normalize(fichaRef.formaFarmaceutica);
          const ffCand = normalize(fichaCand.formaFarmaceutica);
          if (ffRef && ffCand) {
            totalPoints += 20;
            const match = ffRef === ffCand || ffCand.includes(ffRef) || ffRef.includes(ffCand);
            if (match) earnedPoints += 20;
            matchDetails.push({ field: "Forma Farmacêutica", refValue: fichaRef.formaFarmaceutica!, candValue: fichaCand.formaFarmaceutica!, match });
          }

          // Classe terapêutica (informativo — peso 10)
          const ctRef = normalize(fichaRef.classeTerapeutica);
          const ctCand = normalize(fichaCand.classeTerapeutica);
          if (ctRef && ctCand) {
            totalPoints += 10;
            const match = ctRef === ctCand || ctCand.includes(ctRef) || ctRef.includes(ctCand);
            if (match) earnedPoints += 10;
            matchDetails.push({ field: "Classe Terapêutica", refValue: fichaRef.classeTerapeutica!, candValue: fichaCand.classeTerapeutica!, match });
          }

          const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 50;
          const status: EquivalentResult["status"] = hasCriticalDivergence ? "DIVERGENTE" : score >= 70 ? "APROVADO" : "REVISAO";

          // Calcular economia
          const refPrice = ref.price ? parseFloat(String(ref.price)) : null;
          const candPrice = cand.price ? parseFloat(String(cand.price)) : null;
          const economia = refPrice && candPrice && candPrice < refPrice
            ? Math.round(((refPrice - candPrice) / refPrice) * 100)
            : null;

          scored.push({
            id: cand.id,
            name: cand.name,
            activeIngredient: cand.activeIngredient,
            concentration: cand.concentration,
            presentation: cand.presentation,
            fichaTecnica: cand.fichaTecnica,
            fichaParsed: fichaCand,
            manufacturer: cand.manufacturer,
            price: cand.price,
            priceUnit: cand.priceUnit,
            unit: cand.unit,
            supplierId: cand.supplierId,
            supplierName: cand.supplierName,
            categoryId: cand.categoryId,
            categoryName: cand.categoryName,
            imageUrl: cand.imageUrl,
            productUrl: cand.productUrl,
            mapa: cand.mapa,
            score,
            matchDetails,
            status,
            economia,
          });
        }

        // 5. Ordenar: APROVADO primeiro (por preço asc), depois REVISAO, depois DIVERGENTE
        scored.sort((a, b) => {
          const statusOrder = { APROVADO: 0, REVISAO: 1, DIVERGENTE: 2 };
          const sA = statusOrder[a.status];
          const sB = statusOrder[b.status];
          if (sA !== sB) return sA - sB;
          // Dentro do mesmo status: menor preço primeiro
          const pA = a.price ? parseFloat(String(a.price)) : Infinity;
          const pB = b.price ? parseFloat(String(b.price)) : Infinity;
          return pA - pB;
        });

        return {
          product: {
            ...ref,
            fichaParsed: fichaRef,
          },
          equivalents: scored.slice(0, input.limit),
          totalFound: scored.length,
          fichaRef,
        };
      }),

    // ─── Fusão de duplicatas ───────────────────────────────────────────────────
    mergeDuplicates: protectedProcedure
      .input(z.object({
        masterId: z.number(),
        duplicateIds: z.array(z.number()).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const result = await mergeProductGroup(input.masterId, input.duplicateIds);
        await recordAudit({
          userId: ctx.user?.id,
          action: "product_merge",
          entity: "products",
          entityId: input.masterId,
          summary: `Merge de duplicatas: ${input.duplicateIds.length} produtos fundidos no #${input.masterId}`,
          changes: { duplicateIds: input.duplicateIds },
        });
        return result;
      }),

    // ─── Exportação em Excel ───────────────────────────────────────────────────
    exportToExcel: protectedProcedure
      .input(
        z.object({
          supplierId: z.number().optional(),
          categoryId: z.number().optional(),
          isActive: z.enum(["yes", "no", "all"]).optional(),
          withoutFichaTecnica: z.boolean().optional(),
          withoutCategory: z.boolean().optional(),
          search: z.string().optional(),
          limit: z.number().min(1).max(5000).default(2000), // limite obrigatório por segurança
        })
      )
      .query(async ({ input }) => {
        const { exportProductsToExcel } = await import("../exportExcel");
        const buffer = await exportProductsToExcel(input as any);
        return {
          data: buffer.toString("base64"),
          filename: `catalogo-produtos-${new Date().toISOString().split("T")[0]}.xlsx`,
        };
      }),
  });
