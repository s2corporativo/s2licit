import { editorProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb, mergeProductGroup } from "../db";
import { products, duplicateExceptions } from "../../drizzle/schema";
import { eq, or, and } from "drizzle-orm";
import { jaroWinklerSimilarity as canonicalJaroWinklerSimilarity } from "../matching/productMatcher";
import { recordAudit } from "../services/auditService";

// Só os campos usados pela detecção de duplicidade — nunca as colunas TEXT
// (description, informacaoTecnica, fichaTecnica), que podem ser grandes e
// tornariam a varredura direcionada (sem teto de linhas) sujeita à mesma
// exaustão de memória que o teto de 20k existe para evitar na global.
type ProductRow = Pick<typeof products.$inferSelect, "id" | "name" | "concentration" | "presentation" | "manufacturer">;

/**
 * Teto de catálogo carregado em memória por varredura de duplicidade.
 * O container roda com 2 GB compartilhados com o Chromium, e a varredura sem
 * alvo é O(n²) dentro de cada bucket — acima deste volume a resposta certa é
 * recusar com instrução, nunca truncar em silêncio (truncar devolveria "sem
 * duplicados" para pares que existem).
 */
const MAX_CATALOGO_EM_MEMORIA = 20000;

/**
 * `comTeto: false` é só para a varredura com `productId` (O(n), um produto
 * contra o catálogo inteiro) — o teto existe para a varredura global O(n²)
 * sem alvo, que é a que esgota memória. Aplicar o mesmo teto ao caminho com
 * alvo quebraria a própria alternativa que a mensagem de erro recomenda.
 */
async function carregarCatalogoAtivo(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, comTeto = true) {
  const query = db
    .select({
      id: products.id,
      name: products.name,
      concentration: products.concentration,
      presentation: products.presentation,
      manufacturer: products.manufacturer,
    })
    .from(products)
    .where(eq(products.isActive, "yes"));

  if (!comTeto) return query;

  const linhas = await query.limit(MAX_CATALOGO_EM_MEMORIA + 1);

  if (linhas.length > MAX_CATALOGO_EM_MEMORIA) {
    throw new Error(
      `Catálogo ativo acima de ${MAX_CATALOGO_EM_MEMORIA} produtos: a varredura global de ` +
        "duplicidade foi recusada para não esgotar a memória do processo. " +
        "Informe productId para comparar um produto específico contra todo o catálogo.",
    );
  }
  return linhas;
}

type DuplicateProduct = {
  id: number;
  name: string;
  concentration: string | null;
  presentation: string | null;
  manufacturer: string | null;
  similarity: number;
};

type DuplicateGroup = {
  groupId: string;
  products: DuplicateProduct[];
  similarity: number;
};

function pairKey(id1: number, id2: number): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

async function loadExceptionPairs(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
): Promise<Set<string>> {
  const rows = await db
    .select({ productId1: duplicateExceptions.productId1, productId2: duplicateExceptions.productId2 })
    .from(duplicateExceptions);
  return new Set(rows.map((r) => pairKey(r.productId1, r.productId2)));
}

function jaroWinklerSimilarity(s1: string, s2: string): number {
  return canonicalJaroWinklerSimilarity(s1.toLowerCase().trim(), s2.toLowerCase().trim());
}

function combinedSimilarity(a: ProductRow, b: ProductRow): number {
  const nameSimilarity = jaroWinklerSimilarity(a.name, b.name);
  const concSimilarity =
    (!a.concentration && !b.concentration)
      ? 1
      : (a.concentration && b.concentration)
        ? jaroWinklerSimilarity(a.concentration, b.concentration)
        : 0;
  return nameSimilarity * 0.7 + concSimilarity * 0.3;
}

function compactName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Chaves de bloqueio para reduzir o universo de pares comparados. Produtos
 * realmente duplicados tendem a compartilhar o início normalizado do nome;
 * duas larguras aumentam recall sem voltar à comparação global O(n²).
 */
function blockingKeys(product: ProductRow): string[] {
  const compact = compactName(product.name);
  if (!compact) return [`id:${product.id}`];
  const keys = new Set<string>();
  keys.add(`p8:${compact.slice(0, Math.min(8, compact.length))}`);
  if (compact.length >= 12) keys.add(`p12:${compact.slice(0, 12)}`);
  return Array.from(keys);
}

function toDuplicateProduct(product: ProductRow, similarity: number): DuplicateProduct {
  return {
    id: product.id,
    name: product.name,
    concentration: product.concentration,
    presentation: product.presentation,
    manufacturer: product.manufacturer,
    similarity,
  };
}

function targetDuplicateGroup(
  allProducts: ProductRow[],
  targetId: number,
  exceptions: Set<string>,
  minSimilarity: number,
  limit: number,
): DuplicateGroup[] {
  const target = allProducts.find((product) => product.id === targetId);
  if (!target) return [];

  const matches = allProducts
    .filter((candidate) => candidate.id !== target.id)
    .filter((candidate) => !exceptions.has(pairKey(target.id, candidate.id)))
    .map((candidate) => ({ candidate, score: combinedSimilarity(target, candidate) }))
    .filter(({ score }) => score >= minSimilarity)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit - 1));

  if (matches.length === 0) return [];
  const average = matches.reduce((sum, item) => sum + item.score, 0) / matches.length;
  return [{
    groupId: `product_${target.id}`,
    products: [
      toDuplicateProduct(target, 1),
      ...matches.map(({ candidate, score }) => toDuplicateProduct(candidate, score)),
    ],
    similarity: average,
  }];
}

function blockedDuplicateGroups(
  allProducts: ProductRow[],
  exceptions: Set<string>,
  minSimilarity: number,
  limit = Number.POSITIVE_INFINITY,
): DuplicateGroup[] {
  const buckets = new Map<string, ProductRow[]>();
  for (const product of allProducts) {
    for (const key of blockingKeys(product)) {
      const bucket = buckets.get(key) ?? [];
      bucket.push(product);
      buckets.set(key, bucket);
    }
  }

  const candidatePairs = new Map<string, [ProductRow, ProductRow]>();
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i];
        const b = bucket[j];
        const key = pairKey(a.id, b.id);
        if (!candidatePairs.has(key) && !exceptions.has(key)) {
          candidatePairs.set(key, [a, b]);
        }
      }
    }
  }

  const adjacency = new Map<number, Array<{ product: ProductRow; score: number }>>();
  for (const [a, b] of candidatePairs.values()) {
    const score = combinedSimilarity(a, b);
    if (score < minSimilarity) continue;
    adjacency.set(a.id, [...(adjacency.get(a.id) ?? []), { product: b, score }]);
    adjacency.set(b.id, [...(adjacency.get(b.id) ?? []), { product: a, score }]);
  }

  const byId = new Map(allProducts.map((product) => [product.id, product]));
  const visited = new Set<number>();
  const groups: DuplicateGroup[] = [];

  for (const product of allProducts) {
    if (visited.has(product.id) || !adjacency.has(product.id)) continue;
    const queue = [product.id];
    const component = new Set<number>();
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (component.has(id)) continue;
      component.add(id);
      visited.add(id);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!component.has(neighbor.product.id)) queue.push(neighbor.product.id);
      }
    }
    if (component.size < 2) continue;

    const members = Array.from(component)
      .map((id) => byId.get(id))
      .filter((row): row is ProductRow => Boolean(row));
    const master = members[0];
    const scored = members.map((member, index) => ({
      member,
      score: index === 0 ? 1 : combinedSimilarity(master, member),
    }));
    const similarities = scored.slice(1).map((item) => item.score);
    groups.push({
      groupId: `group_${master.id}`,
      products: scored.map(({ member, score }) => toDuplicateProduct(member, score)),
      similarity: similarities.length
        ? similarities.reduce((sum, score) => sum + score, 0) / similarities.length
        : 1,
    });
    if (groups.length >= limit) break;
  }

  return groups;
}

export const duplicatesRouter = router({
  /**
   * Detecta duplicados. Com `productId`, compara o produto selecionado contra
   * TODO o catálogo ativo em O(n), sem limite de 1.000 registros. Sem alvo,
   * usa blocking por prefixo normalizado para evitar uma varredura global O(n²).
   */
  detectDuplicates: protectedProcedure
    .input(z.object({
      productId: z.number().int().positive().optional(),
      minSimilarity: z.number().min(0).max(1).default(0.7),
      limit: z.number().min(1).max(1000).default(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const allProducts = await carregarCatalogoAtivo(db, !input.productId);
      const exceptions = await loadExceptionPairs(db);

      if (input.productId) {
        return targetDuplicateGroup(
          allProducts,
          input.productId,
          exceptions,
          input.minSimilarity,
          input.limit,
        );
      }
      return blockedDuplicateGroups(allProducts, exceptions, input.minSimilarity, input.limit);
    }),

  mergeDuplicates: editorProcedure
    .input(z.object({
      primaryProductId: z.number().int().positive(),
      secondaryProductId: z.number().int().positive(),
      keepFields: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.primaryProductId === input.secondaryProductId) {
        throw new Error("Produto mestre e duplicado precisam ser diferentes");
      }
      const result = await mergeProductGroup(input.primaryProductId, [input.secondaryProductId]);
      await recordAudit({
        userId: ctx.user?.id ?? null,
        action: "product_merge",
        entity: "products",
        entityId: input.primaryProductId,
        origin: "operator",
        summary: `Produto ${input.secondaryProductId} mesclado no mestre ${input.primaryProductId}`,
        changes: {
          masterId: input.primaryProductId,
          duplicateIds: [input.secondaryProductId],
          merged: result.merged,
          redirected: result.redirected,
        },
      });
      return {
        success: true,
        primaryProductId: input.primaryProductId,
        secondaryProductId: input.secondaryProductId,
        merged: result.merged,
        redirected: result.redirected,
        message: "Produtos mesclados com sucesso e referências preservadas",
      };
    }),

  replaceProduct: editorProcedure
    .input(z.object({
      oldProductId: z.number().int().positive(),
      newProductId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.oldProductId === input.newProductId) {
        throw new Error("Produto antigo e novo precisam ser diferentes");
      }
      const result = await mergeProductGroup(input.newProductId, [input.oldProductId]);
      await recordAudit({
        userId: ctx.user?.id ?? null,
        action: "product_replace",
        entity: "products",
        entityId: input.newProductId,
        origin: "operator",
        summary: `Produto ${input.oldProductId} substituído pelo mestre ${input.newProductId}`,
        changes: {
          oldProductId: input.oldProductId,
          newProductId: input.newProductId,
          merged: result.merged,
          redirected: result.redirected,
        },
      });
      return {
        success: true,
        oldProductId: input.oldProductId,
        newProductId: input.newProductId,
        merged: result.merged,
        redirected: result.redirected,
        message: "Produto substituído com sucesso e referências preservadas",
      };
    }),

  markAsNotDuplicate: editorProcedure
    .input(z.object({
      productId1: z.number().int().positive(),
      productId2: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      if (input.productId1 === input.productId2) {
        throw new Error("Não é possível marcar um produto como não duplicado dele mesmo");
      }

      const existing = await db
        .select({ id: duplicateExceptions.id })
        .from(duplicateExceptions)
        .where(
          or(
            and(eq(duplicateExceptions.productId1, input.productId1), eq(duplicateExceptions.productId2, input.productId2)),
            and(eq(duplicateExceptions.productId1, input.productId2), eq(duplicateExceptions.productId2, input.productId1)),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(duplicateExceptions).values({
          productId1: input.productId1,
          productId2: input.productId2,
        });
        await recordAudit({
          userId: ctx.user?.id ?? null,
          action: "product_duplicate_exception",
          entity: "products",
          entityId: input.productId1,
          origin: "operator",
          summary: `Produtos ${input.productId1} e ${input.productId2} marcados como distintos`,
          changes: { productId1: input.productId1, productId2: input.productId2 },
        });
      }

      return { success: true, message: "Marcado como não duplicado" };
    }),

  listDuplicateGroups: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      minSimilarity: z.number().min(0).max(1).default(0.7),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const allProducts = await carregarCatalogoAtivo(db);
      const exceptions = await loadExceptionPairs(db);
      const groups = blockedDuplicateGroups(allProducts, exceptions, input.minSimilarity);
      const start = (input.page - 1) * input.pageSize;
      return {
        groups: groups.slice(start, start + input.pageSize).map((group) => ({
          groupId: group.groupId,
          count: group.products.length,
          similarity: group.similarity,
          products: group.products.map((product) => ({
            id: product.id,
            name: product.name,
            concentration: product.concentration,
          })),
        })),
        total: groups.length,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(groups.length / input.pageSize),
      };
    }),

  getDuplicateStats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB indisponível");
    const allProducts = await carregarCatalogoAtivo(db);
    const exceptions = await loadExceptionPairs(db);
    const groups = blockedDuplicateGroups(allProducts, exceptions, 0.7);
    const totalDuplicateProducts = groups.reduce((sum, group) => sum + group.products.length, 0);

    return {
      totalProducts: allProducts.length,
      totalDuplicateGroups: groups.length,
      totalDuplicateProducts,
      duplicatePercentage: allProducts.length > 0
        ? (totalDuplicateProducts / allProducts.length * 100).toFixed(2)
        : "0.00",
    };
  }),
});
