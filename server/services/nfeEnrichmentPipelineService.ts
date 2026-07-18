import { z } from "zod";
import { getDb } from "../db";
import { products } from "../../drizzle/schema";
import { eq, and, like, ne } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import { logger } from "../_core/logger";

export interface EnrichmentTask {
  productId: number;
  productName: string;
  productDescription?: string;
  currentActiveIngredient?: string;
  currentConcentration?: string;
  supplierId: number;
  status: "pending" | "enriching" | "completed" | "failed";
  result?: EnrichmentResult;
  error?: string;
}

export interface EnrichmentResult {
  activeIngredient: string;
  concentration: string;
  indications: string[];
  contraindications: string[];
  dosage: string;
  administrationForm: string;
  confidence: number;
  source: "ai_extraction" | "catalog_match" | "manual";
  requiresReview: boolean;
}

const enrichmentSchema = z.object({
  activeIngredient: z.string().trim(),
  concentration: z.string().trim(),
  indications: z.array(z.string()),
  contraindications: z.array(z.string()),
  dosage: z.string(),
  administrationForm: z.string(),
  confidence: z.number().min(0).max(100),
});

export async function processNfeEnrichmentPipeline(
  productIds: number[],
  supplierId: number,
): Promise<{
  processed: number;
  enriched: number;
  matched: number;
  failed: number;
  results: EnrichmentTask[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const uniqueIds = [...new Set(productIds)];
  const results: EnrichmentTask[] = [];
  let enriched = 0;
  let matched = 0;
  let failed = 0;

  for (const productId of uniqueIds) {
    try {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product) throw new Error("Produto não encontrado");

      const enrichmentResult = await enrichProductWithAI(product);
      if (!enrichmentResult) throw new Error("A IA não devolveu dados estruturados válidos");
      if (enrichmentResult.requiresReview) {
        throw new Error(`Enriquecimento exige revisão humana (confiança ${enrichmentResult.confidence}%)`);
      }

      const currentUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (!product.activeIngredient && enrichmentResult.activeIngredient) {
        currentUpdate.activeIngredient = enrichmentResult.activeIngredient;
      }
      if (!product.concentration && enrichmentResult.concentration) {
        currentUpdate.concentration = enrichmentResult.concentration;
      }

      // Não substitui descrição, indicações, contraindicações ou posologia por texto
      // gerado por IA sem fonte documental verificável.
      await db.update(products).set(currentUpdate).where(eq(products.id, productId));
      enriched++;

      const catalogMatch = await matchWithCatalog(db, product, enrichmentResult);
      if (catalogMatch) {
        await mergeWithCatalogProduct(db, product, catalogMatch, enrichmentResult);
        matched++;
      }

      results.push({
        productId,
        productName: product.name,
        supplierId,
        status: "completed",
        result: enrichmentResult,
      });
    } catch (error) {
      failed++;
      results.push({
        productId,
        productName: "Não processado",
        supplierId,
        status: "failed",
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  }

  try {
    await notifyOwner({
      title: "Pipeline de Enriquecimento Concluído",
      content: `${enriched} produto(s) enriquecido(s), ${matched} match(es) com catálogo, ${failed} erro(s)`,
    });
  } catch (error) {
    logger.warn("[EnrichmentPipeline] Falha ao enviar notificação:", error);
  }

  return {
    processed: uniqueIds.length,
    enriched,
    matched,
    failed,
    results,
  };
}

async function enrichProductWithAI(product: any): Promise<EnrichmentResult | null> {
  try {
    const prompt = `Analise o produto abaixo e extraia somente os dados expressamente identificáveis.

Produto: ${product.name}
Descrição: ${product.description || ""}
Ingrediente ativo atual: ${product.activeIngredient || "não informado"}
Concentração atual: ${product.concentration || "não informado"}

Não presuma composição, indicação, contraindicação ou dose. Quando não houver base suficiente, deixe o campo vazio e reduza confidence.`;

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Extraia dados estruturados de produtos sem inventar informações. Dados incertos devem ficar vazios e exigir revisão humana.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "product_enrichment",
          strict: true,
          schema: {
            type: "object",
            properties: {
              activeIngredient: { type: "string" },
              concentration: { type: "string" },
              indications: { type: "array", items: { type: "string" } },
              contraindications: { type: "array", items: { type: "string" } },
              dosage: { type: "string" },
              administrationForm: { type: "string" },
              confidence: { type: "number" },
            },
            required: [
              "activeIngredient",
              "concentration",
              "indications",
              "contraindications",
              "dosage",
              "administrationForm",
              "confidence",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    const parsed = enrichmentSchema.parse(JSON.parse(contentStr));

    return {
      ...parsed,
      source: "ai_extraction",
      requiresReview:
        parsed.confidence < 80 ||
        !parsed.activeIngredient ||
        !parsed.concentration,
    };
  } catch (error) {
    logger.error("[EnrichmentPipeline] Erro ao enriquecer com IA:", error);
    return null;
  }
}

async function matchWithCatalog(
  db: any,
  product: any,
  enrichmentResult: EnrichmentResult,
): Promise<any | null> {
  // EAN é o identificador preferencial, sempre excluindo o próprio registro.
  if (product.barcode) {
    const [match] = await db
      .select()
      .from(products)
      .where(and(eq(products.barcode, product.barcode), ne(products.id, product.id)))
      .limit(1);
    if (match) return match;
  }

  // Matching por composição só é permitido com alta confiança e campos completos.
  if (
    enrichmentResult.confidence >= 90 &&
    enrichmentResult.activeIngredient &&
    enrichmentResult.concentration
  ) {
    const [match] = await db
      .select()
      .from(products)
      .where(
        and(
          like(products.activeIngredient, `%${enrichmentResult.activeIngredient}%`),
          like(products.concentration, `%${enrichmentResult.concentration}%`),
          ne(products.id, product.id),
        ),
      )
      .limit(1);
    if (match) return match;
  }

  // Nome é apenas fallback conservador e também exclui o próprio produto.
  const name = String(product.name ?? "").trim();
  if (name.length >= 8) {
    const [match] = await db
      .select()
      .from(products)
      .where(and(like(products.name, `%${name}%`), ne(products.id, product.id)))
      .limit(1);
    if (match) return match;
  }

  return null;
}

async function mergeWithCatalogProduct(
  db: any,
  nfeProduct: any,
  catalogProduct: any,
  enrichmentResult: EnrichmentResult,
): Promise<void> {
  if (catalogProduct.id === nfeProduct.id) {
    throw new Error("Matching inválido: o produto foi associado a ele mesmo");
  }

  const mergedData: Record<string, unknown> = { updatedAt: new Date() };
  if (!catalogProduct.activeIngredient && enrichmentResult.activeIngredient) {
    mergedData.activeIngredient = enrichmentResult.activeIngredient;
  }
  if (!catalogProduct.concentration && enrichmentResult.concentration) {
    mergedData.concentration = enrichmentResult.concentration;
  }

  const sourcePrice = Number(nfeProduct.price ?? nfeProduct.costPrice);
  if (Number.isFinite(sourcePrice) && sourcePrice > 0) mergedData.price = sourcePrice.toFixed(2);

  await db.update(products).set(mergedData).where(eq(products.id, catalogProduct.id));
  logger.info("[EnrichmentPipeline] Match confirmado", {
    nfeProductId: nfeProduct.id,
    catalogProductId: catalogProduct.id,
    matchConfidence: enrichmentResult.confidence,
  });
}

/**
 * Mantido apenas por compatibilidade de importação. Não existe fila persistente;
 * chamar esta função agora falha explicitamente, em vez de fingir processamento.
 */
export async function processEnrichmentQueue(): Promise<void> {
  throw new Error("Fila de enriquecimento ainda não implantada; use o pipeline síncrono.");
}
