import { getDb } from "../db";
import { products, productSupplierPrices } from "../../drizzle/schema";
import { eq, and, like } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";

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
  confidence: number; // 0-100
  source: "ai_extraction" | "catalog_match" | "manual";
}

/**
 * Pipeline completo: NF-e → Enriquecimento → Catálogo
 * 1. Recebe produtos importados de NF-e
 * 2. Enriquece com IA (extrai ingrediente ativo, indicações, etc)
 * 3. Faz matching com catálogo existente
 * 4. Mescla dados e atualiza banco
 */
export async function processNfeEnrichmentPipeline(
  productIds: number[],
  supplierId: number
): Promise<{
  processed: number;
  enriched: number;
  matched: number;
  failed: number;
  results: EnrichmentTask[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results: EnrichmentTask[] = [];
  let enriched = 0;
  let matched = 0;
  let failed = 0;

  for (const productId of productIds) {
    try {
      // Busca produto
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product) {
        results.push({
          productId,
          productName: "Unknown",
          supplierId,
          status: "failed",
          error: "Product not found",
        });
        failed++;
        continue;
      }

      // Fase 1: Enriquecimento com IA
      const enrichmentResult = await enrichProductWithAI(product);

      if (!enrichmentResult) {
        results.push({
          productId,
          productName: product.name,
          supplierId,
          status: "failed",
          error: "AI enrichment failed",
        });
        failed++;
        continue;
      }

      enriched++;

      // Fase 2: Matching com catálogo
      const catalogMatch = await matchWithCatalog(db, product, enrichmentResult);

      if (catalogMatch) {
        matched++;

        // Fase 3: Mescla dados
        await mergeWithCatalogProduct(db, product, catalogMatch, enrichmentResult);
      }

      // Atualiza produto com dados enriquecidos
      await db
        .update(products)
        .set({
          activeIngredient: enrichmentResult.activeIngredient,
          concentration: enrichmentResult.concentration,
          description: enrichmentResult.indications.join("; "),
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      results.push({
        productId,
        productName: product.name,
        supplierId,
        status: "completed",
        result: enrichmentResult,
      });
    } catch (error) {
      console.error(`[EnrichmentPipeline] Erro ao processar produto ${productId}:`, error);
      failed++;
      results.push({
        productId,
        productName: "Unknown",
        supplierId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Notifica usuário
  await notifyOwner({
    title: "Pipeline de Enriquecimento Concluído",
    content: `${enriched} produto(s) enriquecido(s), ${matched} match(es) com catálogo, ${failed} erro(s)`,
  });

  return {
    processed: productIds.length,
    enriched,
    matched,
    failed,
    results,
  };
}

/**
 * Fase 1: Enriquecimento com IA
 * Extrai automaticamente: ingrediente ativo, indicações, contraindicações, dosagem
 */
async function enrichProductWithAI(product: any): Promise<EnrichmentResult | null> {
  try {
    const prompt = `Analise o seguinte produto veterinário e extraia as informações solicitadas em formato JSON:

Produto: ${product.name}
Descrição: ${product.description || ""}
Ingrediente Ativo Atual: ${product.activeIngredient || "não informado"}
Concentração Atual: ${product.concentration || "não informado"}

Retorne um JSON com:
{
  "activeIngredient": "princípio ativo principal",
  "concentration": "concentração (ex: 10%, 500mg/ml)",
  "indications": ["indicação 1", "indicação 2"],
  "contraindications": ["contraindicação 1"],
  "dosage": "dosagem recomendada",
  "administrationForm": "forma de administração (injetável, comprimido, etc)",
  "confidence": 85
}

Se não conseguir extrair com certeza, use 0 para confidence.`;

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "Você é um especialista em medicamentos veterinários. Extraia informações de produtos de forma precisa e estruturada.",
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

    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr);
    return {
      ...parsed,
      source: "ai_extraction",
    };
  } catch (error) {
    console.error("[EnrichmentPipeline] Erro ao enriquecer com IA:", error);
    return null;
  }
}

/**
 * Fase 2: Matching com catálogo
 * Identifica se o produto já existe no catálogo capturado
 */
async function matchWithCatalog(
  db: any,
  product: any,
  enrichmentResult: EnrichmentResult
): Promise<any | null> {
  try {
    // Busca por EAN
    if (product.barcode) {
      const [match] = await db
        .select()
        .from(products)
        .where(and(eq(products.barcode, product.barcode), eq(products.id, product.id)))
        .limit(1);

      if (match) return match;
    }

    // Busca por ingrediente ativo + concentração
    if (enrichmentResult.activeIngredient && enrichmentResult.concentration) {
      const [match] = await db
        .select()
        .from(products)
        .where(
          and(
            like(products.activeIngredient, `%${enrichmentResult.activeIngredient}%`),
            like(products.concentration, `%${enrichmentResult.concentration}%`)
          )
        )
        .limit(1);

      if (match) return match;
    }

    // Busca por nome similar
    const normalizedName = normalizeString(product.name);
    const [match] = await db
      .select()
      .from(products)
      .where(like(products.name, `%${normalizedName}%`))
      .limit(1);

    if (match) return match;
  } catch (error) {
    console.error("[EnrichmentPipeline] Erro ao fazer matching:", error);
  }

  return null;
}

/**
 * Fase 3: Mescla dados
 * Combina dados do NF-e com dados do catálogo
 */
async function mergeWithCatalogProduct(
  db: any,
  nfeProduct: any,
  catalogProduct: any,
  enrichmentResult: EnrichmentResult
): Promise<void> {
  try {
    // Atualiza produto do catálogo com dados enriquecidos
    const mergedData = {
      // Mantém dados do catálogo, preenche com dados enriquecidos
      activeIngredient: catalogProduct.activeIngredient || enrichmentResult.activeIngredient,
      concentration: catalogProduct.concentration || enrichmentResult.concentration,
      description: enrichmentResult.indications.join("; "),
      // Atualiza preço com dados do NF-e
      price: nfeProduct.price,
      updatedAt: new Date(),
    };

    await db.update(products).set(mergedData).where(eq(products.id, catalogProduct.id));

    // Registra match no histórico (tabela não existe, apenas log)
    console.log("[EnrichmentPipeline] Match registrado:", {
      nfeProductId: nfeProduct.id,
      catalogProductId: catalogProduct.id,
      matchConfidence: enrichmentResult.confidence,
    });
  } catch (error) {
    console.error("[EnrichmentPipeline] Erro ao mesclar dados:", error);
  }
}

/**
 * Normaliza string para comparação
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Processa fila de enriquecimento em background
 */
export async function processEnrichmentQueue(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Busca produtos pendentes de enriquecimento
    // TODO: Implementar tabela de fila de enriquecimento
    console.log("[EnrichmentPipeline] Processando fila de enriquecimento...");
  } catch (error) {
    console.error("[EnrichmentPipeline] Erro ao processar fila:", error);
  }
}
