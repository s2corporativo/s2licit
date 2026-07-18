/**
 * aiEnrichmentService: processamento paginado das operações de IA em massa
 * (ficha técnica e reclassificação). Cada função processa UMA página e devolve
 * o cursor — quem orquestra o loop completo é o job em background
 * (server/jobs/aiJobRunner.ts), nunca uma mutation tRPC segurando a conexão.
 */
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { products, categories } from "../../drizzle/schema";
import { invokeLLM, parseLlmJson } from "../_core/llm";
import type { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type PageResult = {
  updated: number;
  skipped: number;
  errors: number;
  total: number;
  processedInPage: number;
  nextOffset: number;
  hasMore: boolean;
  errorMessages: string[];
};

export type FichaTecnicaPageInput = {
  scope: "withoutFicha" | "selected" | "all";
  productIds?: number[];
  overwrite: boolean;
  offset: number;
  pageSize: number;
};

export async function processFichaTecnicaPage(db: Db, input: FichaTecnicaPageInput): Promise<PageResult> {
  // 1. Contar total de produtos alvo (sem carregar todos na memória)
  let totalCount = 0;
  if (input.scope === "selected" && input.productIds?.length) {
    totalCount = input.productIds.length;
  } else {
    const countWhere = input.overwrite && input.scope === "all"
      ? eq(products.isActive, "yes")
      : and(eq(products.isActive, "yes"), or(isNull(products.fichaTecnica), eq(products.fichaTecnica, "")));
    const [cnt] = await db.select({ c: sql<number>`COUNT(*)` }).from(products).where(countWhere);
    totalCount = Number(cnt?.c ?? 0);
  }

  // 2. Buscar apenas a página atual (offset+pageSize)
  let targets: { id: number; name: string }[] = [];
  if (input.scope === "selected" && input.productIds?.length) {
    const page = input.productIds.slice(input.offset, input.offset + input.pageSize);
    targets = page.length
      ? await db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(and(eq(products.isActive, "yes"), inArray(products.id, page)))
      : [];
  } else {
    const whereClause = input.overwrite && input.scope === "all"
      ? eq(products.isActive, "yes")
      : and(eq(products.isActive, "yes"), or(isNull(products.fichaTecnica), eq(products.fichaTecnica, "")));
    targets = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(whereClause)
      .orderBy(asc(products.id))
      .limit(input.pageSize)
      .offset(input.offset);
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const errorMessages: string[] = [];
  // Sub-lotes de 30 para a LLM (melhor qualidade de extração)
  const BATCH = 30;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    try {
      const llmResp = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `Você é um especialista técnico em produtos para cotações — medicamentos veterinários e humanos, materiais de construção, insumos e equipamentos. Para cada produto informado, extraia do nome do produto as informações técnicas: princípio ativo / composição / especificação, concentração ou dimensão, forma farmacêutica ou apresentação, espécie animal (apenas se veterinário) e classe terapêutica ou categoria de uso. Se não for possível extrair algum campo, deixe null. Responda em JSON válido.`,
          },
          {
            role: "user",
            content: JSON.stringify(batch.map((p, idx) => ({ idx, name: p.name }))),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ficha_tecnica_extraction",
            strict: true,
            schema: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      idx: { type: "integer" },
                      fichaTecnica: { type: ["string", "null"], description: "Princípio ativo / composição completa" },
                      concentration: { type: ["string", "null"], description: "Concentração (ex: 500mg, 10%)" },
                      presentation: { type: ["string", "null"], description: "Forma farmacêutica (ex: comprimido, injetável)" },
                      classeTerapeutica: { type: ["string", "null"], description: "Classe terapêutica" },
                    },
                    required: ["idx", "fichaTecnica", "concentration", "presentation", "classeTerapeutica"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["results"],
              additionalProperties: false,
            },
          },
        },
      });
      const parsed = parseLlmJson<{
        results: { idx: number; fichaTecnica: string | null; concentration: string | null; presentation: string | null; classeTerapeutica: string | null }[];
      }>(llmResp.choices[0].message.content as string);
      const toUpdate: Array<{ id: number; fichaTecnica?: string; concentration?: string; presentation?: string }> = [];
      for (const item of (parsed.results ?? [])) {
        const prod = batch[item.idx];
        if (!prod) { skipped++; continue; }
        if (!item.fichaTecnica && !item.concentration && !item.presentation) { skipped++; continue; }
        toUpdate.push({
          id: prod.id,
          ...(item.fichaTecnica ? { fichaTecnica: item.fichaTecnica.trim() } : {}),
          ...(item.concentration ? { concentration: item.concentration.trim() } : {}),
          ...(item.presentation ? { presentation: item.presentation.trim() } : {}),
        });
      }
      await Promise.all(toUpdate.map(({ id, ...fields }) =>
        db.update(products).set({ ...fields, updatedAt: new Date() }).where(eq(products.id, id))
      ));
      updated += toUpdate.length;
    } catch (err) {
      errors += batch.length;
      errorMessages.push(
        `Produtos ${batch[0]?.id}–${batch[batch.length - 1]?.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  const nextOffset = input.offset + targets.length;
  const hasMore = targets.length > 0 && nextOffset < totalCount;
  return {
    updated,
    skipped,
    errors,
    total: totalCount,
    processedInPage: targets.length,
    nextOffset,
    hasMore,
    errorMessages,
  };
}

export type ReclassifyPageInput = {
  productIds?: number[];
  includeAlreadyCategorized: boolean;
  offset: number;
  pageSize: number;
  batchSize: number;
};

export async function processReclassifyPage(db: Db, input: ReclassifyPageInput): Promise<PageResult> {
  const cats = await db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
    .from(categories)
    .orderBy(categories.parentId, categories.sortOrder);
  const catList = cats.map((c) => {
    const parent = cats.find((p) => p.id === c.parentId);
    return parent ? `${c.id}: ${parent.name} > ${c.name}` : `${c.id}: ${c.name}`;
  }).join("\n");

  let totalCount = 0;
  if (input.productIds && input.productIds.length > 0) {
    totalCount = input.productIds.length;
  } else {
    const whereClause = input.includeAlreadyCategorized
      ? eq(products.isActive, "yes")
      : isNull(products.categoryId);
    const [cnt] = await db.select({ c: sql<number>`COUNT(*)` }).from(products).where(whereClause);
    totalCount = Number(cnt?.c ?? 0);
  }

  let prods: Array<{ id: number; name: string; fichaTecnica: string | null; manufacturer: string | null; presentation: string | null; laboratorio: string | null; subcategoria: string | null; categoryId: number | null }>;
  if (input.productIds && input.productIds.length > 0) {
    const page = input.productIds.slice(input.offset, input.offset + input.pageSize);
    prods = page.length
      ? await db
          .select({ id: products.id, name: products.name, fichaTecnica: products.fichaTecnica, manufacturer: products.manufacturer, presentation: products.presentation, laboratorio: products.laboratorio, subcategoria: products.subcategoria, categoryId: products.categoryId })
          .from(products)
          .where(inArray(products.id, page))
      : [];
  } else {
    const whereClause = input.includeAlreadyCategorized
      ? eq(products.isActive, "yes")
      : isNull(products.categoryId);
    prods = await db
      .select({ id: products.id, name: products.name, fichaTecnica: products.fichaTecnica, manufacturer: products.manufacturer, presentation: products.presentation, laboratorio: products.laboratorio, subcategoria: products.subcategoria, categoryId: products.categoryId })
      .from(products)
      .where(whereClause)
      .orderBy(asc(products.id))
      .limit(input.pageSize)
      .offset(input.offset);
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const errorMessages: string[] = [];
  const batchSize = input.batchSize;
  for (let i = 0; i < prods.length; i += batchSize) {
    const batch = prods.slice(i, i + batchSize);
    const prodList = batch.map((p) => {
      const extra = [p.fichaTecnica?.slice(0, 80), p.laboratorio ?? p.manufacturer, p.presentation].filter(Boolean).join(", ");
      return `${p.id}: ${p.name}${extra ? ` (${extra})` : ""}`;
    }).join("\n");
    try {
      const result = await invokeLLM({
        messages: [
          { role: "system" as const, content: "Você é um especialista em classificação de produtos veterinários, agropecuários, farmacêuticos e de construção. Analise cada produto e atribua a categoria mais adequada da lista. Responda APENAS com JSON válido." },
          { role: "user" as const, content: `CATEGORIAS DISPONÍVEIS:\n${catList}\n\nPRODUTOS PARA CLASSIFICAR:\n${prodList}\n\nRetorne um array JSON com objetos {productId, categoryId, subcategoria} para cada produto. subcategoria deve ser uma string curta (ex: "Antiparasitários", "Antibióticos", "Anestésicos") ou string vazia se não se aplicar.` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "bulk_classify",
            strict: true,
            schema: {
              type: "object",
              properties: {
                classifications: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      productId: { type: "number" },
                      categoryId: { type: "number" },
                      subcategoria: { type: "string" },
                    },
                    required: ["productId", "categoryId", "subcategoria"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["classifications"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = result.choices?.[0]?.message?.content;
      if (content && typeof content === "string") {
        const parsed = parseLlmJson<{ classifications: Array<{ productId: number; categoryId: number; subcategoria: string }> }>(content);
        const validItems = (parsed.classifications ?? []).filter(item => cats.find(c => c.id === item.categoryId));
        skipped += (parsed.classifications ?? []).length - validItems.length;
        // Agrupar por (categoryId, subcategoria) para bulk update
        const groups = new Map<string, number[]>();
        const subMap = new Map<string, string | null>();
        for (const item of validItems) {
          const key = `${item.categoryId}|||${item.subcategoria?.trim() || ""}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(item.productId);
          subMap.set(key, item.subcategoria?.trim() || null);
        }
        for (const [key, ids] of Array.from(groups.entries())) {
          const [catIdStr] = key.split("|||");
          const catId = parseInt(catIdStr);
          const subcat = subMap.get(key) ?? null;
          if (ids.length > 0) {
            await db.update(products).set({ categoryId: catId, subcategoria: subcat, updatedAt: new Date() }).where(inArray(products.id, ids));
            updated += ids.length;
          }
        }
      }
    } catch (err) {
      errors += batch.length;
      errorMessages.push(
        `Produtos ${batch[0]?.id}–${batch[batch.length - 1]?.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  const nextOffset = input.offset + prods.length;
  const hasMore = prods.length > 0 && nextOffset < totalCount;
  return {
    updated,
    skipped,
    errors,
    total: totalCount,
    processedInPage: prods.length,
    nextOffset,
    hasMore,
    errorMessages,
  };
}
