/**
 * metadata.ts
 * Router tRPC para o Motor de Inteligência baseado na Ficha Técnica.
 * Gerencia: productMetadata, normalização, sinônimos automáticos, reindexação em lote.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { productMetadata, products, synonyms as synonymsTable } from "../../drizzle/schema";
import { eq, and, desc, like, or, isNull } from "drizzle-orm";
import { processProduct, reindexCatalogFromFicha, suggestSynonyms, saveProductMetadata } from "../services/metadataExtractor/extractor";
import { normalizeProductName } from "../services/metadataExtractor/normalizer";

export const metadataRouter = router({

  // ─── Listar metadados de um produto ─────────────────────────────────────────
  listByProduct: protectedProcedure
    .input(z.object({ produtoId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(productMetadata)
        .where(eq(productMetadata.produtoId, input.produtoId))
        .orderBy(desc(productMetadata.confidence));
    }),

  // ─── Listar metadados que precisam de revisão ────────────────────────────────
  listNeedsReview: protectedProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const items = await db
        .select({
          id: productMetadata.id,
          produtoId: productMetadata.produtoId,
          key: productMetadata.key,
          value: productMetadata.value,
          confidence: productMetadata.confidence,
          source: productMetadata.source,
          needsReview: productMetadata.needsReview,
          lockedManual: productMetadata.lockedManual,
          generatedBy: productMetadata.generatedBy,
          updatedAt: productMetadata.updatedAt,
          productName: products.name,
        })
        .from(productMetadata)
        .innerJoin(products, eq(productMetadata.produtoId, products.id))
        .where(eq(productMetadata.needsReview, 1))
        .orderBy(desc(productMetadata.updatedAt))
        .limit(input.limit)
        .offset(input.offset);
      return { items, total: items.length };
    }),

  // ─── Salvar/atualizar metadado manualmente ───────────────────────────────────
  upsert: protectedProcedure
    .input(z.object({
      produtoId: z.number(),
      key: z.string().min(1).max(128),
      value: z.string().min(1),
      confidence: z.number().min(0).max(1).default(1.0),
      lockManual: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await saveProductMetadata(
        input.produtoId,
        [{
          key: input.key,
          value: input.value,
          confidence: input.confidence,
          needsReview: false,
        }],
        "manual",
        String(ctx.user.id)
      );
      if (input.lockManual) {
        const db = await getDb();
        if (db) {
          await db
            .update(productMetadata)
            .set({ lockedManual: 1, needsReview: 0 })
            .where(and(eq(productMetadata.produtoId, input.produtoId), eq(productMetadata.key, input.key)));
        }
      }
      return result;
    }),

  // ─── Deletar metadado ────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      await db.delete(productMetadata).where(eq(productMetadata.id, input.id));
      return { ok: true };
    }),

  // ─── Travar/destravar como manual ────────────────────────────────────────────
  setLocked: protectedProcedure
    .input(z.object({ id: z.number(), locked: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      await db
        .update(productMetadata)
        .set({ lockedManual: input.locked ? 1 : 0, needsReview: 0 })
        .where(eq(productMetadata.id, input.id));
      return { ok: true };
    }),

  // ─── Aprovar revisão (marcar como não precisa revisão) ───────────────────────
  approveReview: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      await db
        .update(productMetadata)
        .set({ needsReview: 0 })
        .where(eq(productMetadata.id, input.id));
      return { ok: true };
    }),

  // ─── Extrair metadados de um produto específico ──────────────────────────────
  extractForProduct: protectedProcedure
    .input(z.object({ produtoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { error: "DB não disponível" };
      const product = await db
        .select()
        .from(products)
        .where(eq(products.id, input.produtoId))
        .limit(1);
      if (!product.length) return { error: "Produto não encontrado" };
      const p = product[0] as any;
      const result = await processProduct(p.id, p.name, p.fichaTecnica, p.categoryId?.toString());
      return result;
    }),

  // ─── Sugerir sinônimos para um produto ──────────────────────────────────────
  suggestSynonyms: protectedProcedure
    .input(z.object({ produtoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { suggestions: [] };
      const product = await db
        .select()
        .from(products)
        .where(eq(products.id, input.produtoId))
        .limit(1);
      if (!product.length) return { suggestions: [] };
      const p = product[0] as any;

      // Buscar sinônimos existentes via metadados (synonyms table é global, não por produto)
      const suggestions = await suggestSynonyms(
        p.name,
        p.fichaTecnica,
        []
      );
      return { suggestions };
    }),

  // ─── Reindexar catálogo em lote ──────────────────────────────────────────────
  reindexBatch: protectedProcedure
    .input(z.object({
      batchSize: z.number().min(1).max(100).default(20),
      onlyWithFicha: z.boolean().default(false),
      onlyWithoutNomeNormalizado: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const result = await reindexCatalogFromFicha({
        batchSize: input.batchSize,
        onlyWithFicha: input.onlyWithFicha,
        onlyWithoutNomeNormalizado: input.onlyWithoutNomeNormalizado,
      });
      return result;
    }),

  // ─── Normalizar nome de um produto específico ────────────────────────────────
  normalizeProduct: protectedProcedure
    .input(z.object({ produtoId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      const product = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.id, input.produtoId))
        .limit(1);
      if (!product.length) return { ok: false, error: "Produto não encontrado" };
      const nomeNormalizado = normalizeProductName(product[0].name);
      await db
        .update(products)
        .set({ nomeNormalizado } as any)
        .where(eq(products.id, input.produtoId));
      return { ok: true, nomeNormalizado };
    }),

  // ─── Busca inteligente de produtos ──────────────────────────────────────────
  smartSearch: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const q = `%${input.query.toLowerCase()}%`;
      const normalizedQuery = normalizeProductName(input.query);
      const nq = `%${normalizedQuery}%`;

      // Busca em nome, nomeNormalizado, EAN, ficha técnica
      const results = await db
        .select({
          id: products.id,
          name: products.name,
          nomeNormalizado: (products as any).nomeNormalizado,
          ean: (products as any).ean,
          categoryId: products.categoryId,
          presentation: products.presentation,
          manufacturer: products.manufacturer,
          price: products.price,
          imageUrl: (products as any).imageUrl,
        })
        .from(products)
        .where(
          and(
            eq(products.isActive, "yes"),
            or(
              like(products.name, q),
              like((products as any).nomeNormalizado, nq),
              like((products as any).ean, q),
              like((products as any).fichaTecnica, q),
              like(products.barcode, q),
            )
          )
        )
        .limit(input.limit);

      // Ordenar por relevância: nome exato > nomeNormalizado > outros
      return results.sort((a, b) => {
        const aExact = a.name.toLowerCase().includes(input.query.toLowerCase()) ? 2 : 0;
        const bExact = b.name.toLowerCase().includes(input.query.toLowerCase()) ? 2 : 0;
        const aNorm = (a.nomeNormalizado || "").includes(normalizedQuery) ? 1 : 0;
        const bNorm = (b.nomeNormalizado || "").includes(normalizedQuery) ? 1 : 0;
        return (bExact + bNorm) - (aExact + aNorm);
      });
    }),

  // ─── Estatísticas do motor de inteligência ───────────────────────────────────
  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [totalMeta] = await db
      .select({ count: productMetadata.id })
      .from(productMetadata);
    const [needsReview] = await db
      .select({ count: productMetadata.id })
      .from(productMetadata)
      .where(eq(productMetadata.needsReview, 1));
    const [locked] = await db
      .select({ count: productMetadata.id })
      .from(productMetadata)
      .where(eq(productMetadata.lockedManual, 1));
    const [withNomeNorm] = await db
      .select({ count: products.id })
      .from(products)
      .where(and(eq(products.isActive, "yes")));
    return {
      totalMetadata: totalMeta?.count ?? 0,
      needsReview: needsReview?.count ?? 0,
      lockedManual: locked?.count ?? 0,
      totalProducts: withNomeNorm?.count ?? 0,
    };
  }),
});
