/**
 * extractor.ts
 * Serviço de extração automática de metadados a partir da Ficha Técnica.
 * Usa IA (invokeLLM) para extrair chave/valor com nível de confiança.
 * Compatível com qualquer categoria de produto (medicamentos, materiais, serviços, etc.)
 */

import { invokeLLM, parseLlmJson } from "../../_core/llm";
import { getDb } from "../../db";
import { productMetadata, products } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { normalizeProductName } from "./normalizer";

export interface ExtractedMetadata {
  key: string;
  value: string;
  confidence: number; // 0.0 a 1.0
  needsReview: boolean;
}

/**
 * Extrai metadados de uma ficha técnica usando IA.
 * Retorna uma lista de chave/valor com confiança.
 */
export async function extractMetadataFromFicha(
  fichaTecnica: string,
  productName: string,
  category?: string
): Promise<ExtractedMetadata[]> {
  if (!fichaTecnica || fichaTecnica.trim().length < 10) return [];

  const systemPrompt = `Você é um especialista em análise técnica de produtos. 
Analise a ficha técnica fornecida e extraia metadados estruturados no formato JSON.
Seja conservador: extraia apenas informações claramente presentes no texto.
Atribua confidence entre 0.0 e 1.0 (1.0 = certeza absoluta, 0.5 = inferência razoável, <0.5 = incerto).
Campos comuns para medicamentos: principio_ativo, concentracao, forma_farmaceutica, via_administracao, especie_alvo, classe_terapeutica, fabricante, registro_anvisa, registro_mapa.
Campos comuns para materiais: voltagem, potencia, dimensoes, material, peso, cor, modelo.
Campos comuns para serviços: escopo, prazo_execucao, unidade_medida, area_aplicacao.
Use snake_case para as chaves. Valores devem ser strings concisas.`;

  const userPrompt = `Produto: ${productName}${category ? ` (Categoria: ${category})` : ""}

Ficha Técnica:
${fichaTecnica.substring(0, 2000)}

Extraia os metadados relevantes. Responda APENAS com JSON válido no formato:
{
  "metadata": [
    {"key": "principio_ativo", "value": "Amoxicilina", "confidence": 0.95},
    {"key": "concentracao", "value": "500mg", "confidence": 0.90}
  ]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "metadata_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              metadata: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    key: { type: "string" },
                    value: { type: "string" },
                    confidence: { type: "number" },
                  },
                  required: ["key", "value", "confidence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["metadata"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = typeof content === "string" ? parseLlmJson<any>(content) : content;
    const items: ExtractedMetadata[] = (parsed.metadata || []).map((m: any) => ({
      key: String(m.key || "").toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      value: String(m.value || "").trim(),
      confidence: Math.min(1, Math.max(0, Number(m.confidence) || 0)),
      needsReview: Number(m.confidence) < 0.70,
    }));

    return items.filter((m) => m.key && m.value);
  } catch (err) {
    console.error("[MetadataExtractor] Erro ao extrair metadados:", err);
    return [];
  }
}

/**
 * Sugere sinônimos para um produto com base no nome e ficha técnica.
 */
export async function suggestSynonyms(
  productName: string,
  fichaTecnica?: string,
  existingSynonyms?: string[]
): Promise<Array<{ synonym: string; confidence: number; reason: string }>> {
  const systemPrompt = `Você é um especialista em nomenclatura de produtos veterinários e farmacêuticos.
Sugira sinônimos, nomes alternativos, nomes populares e variações do nome do produto.
Inclua: nomes genéricos, nomes comerciais equivalentes, abreviações comuns, nomes em inglês se relevante.
Seja conservador: sugira apenas sinônimos com alta probabilidade de serem usados em editais de licitação.`;

  const userPrompt = `Produto: ${productName}
${fichaTecnica ? `Ficha Técnica (resumo): ${fichaTecnica.substring(0, 500)}` : ""}
${existingSynonyms?.length ? `Sinônimos já cadastrados: ${existingSynonyms.join(", ")}` : ""}

Sugira até 8 sinônimos relevantes. Responda APENAS com JSON:
{
  "synonyms": [
    {"synonym": "nome alternativo", "confidence": 0.90, "reason": "nome genérico do princípio ativo"}
  ]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "synonym_suggestions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              synonyms: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    synonym: { type: "string" },
                    confidence: { type: "number" },
                    reason: { type: "string" },
                  },
                  required: ["synonym", "confidence", "reason"],
                  additionalProperties: false,
                },
              },
            },
            required: ["synonyms"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) return [];
    const parsed = typeof content === "string" ? parseLlmJson<any>(content) : content;
    return (parsed.synonyms || []).filter((s: any) => s.synonym && s.synonym !== productName);
  } catch (err) {
    console.error("[MetadataExtractor] Erro ao sugerir sinônimos:", err);
    return [];
  }
}

/**
 * Salva ou atualiza metadados de um produto no banco de dados.
 * Respeita o flag lockedManual: não sobrescreve entradas manuais travadas.
 */
export async function saveProductMetadata(
  produtoId: number,
  metadata: ExtractedMetadata[],
  source: "extracted_from_ficha" | "manual" = "extracted_from_ficha",
  generatedBy: string = "ai"
): Promise<{ saved: number; skipped: number }> {
  const db = await getDb();
  if (!db || metadata.length === 0) return { saved: 0, skipped: 0 };

  let saved = 0;
  let skipped = 0;

  for (const m of metadata) {
    // Verificar se existe entrada manual travada
    const existing = await db
      .select()
      .from(productMetadata)
      .where(and(eq(productMetadata.produtoId, produtoId), eq(productMetadata.key, m.key)))
      .limit(1);

    if (existing.length > 0 && existing[0].lockedManual === 1 && source === "extracted_from_ficha") {
      skipped++;
      continue;
    }

    if (existing.length > 0) {
      // Atualizar
      await db
        .update(productMetadata)
        .set({
          value: m.value,
          confidence: String(m.confidence.toFixed(3)),
          source,
          needsReview: m.needsReview ? 1 : 0,
          generatedBy,
        })
        .where(and(eq(productMetadata.produtoId, produtoId), eq(productMetadata.key, m.key)));
    } else {
      // Inserir
      await db.insert(productMetadata).values({
        produtoId,
        key: m.key,
        value: m.value,
        confidence: String(m.confidence.toFixed(3)),
        source,
        needsReview: m.needsReview ? 1 : 0,
        generatedBy,
      });
    }
    saved++;
  }

  return { saved, skipped };
}

/**
 * Processa um produto completo: normaliza nome, extrai metadados, atualiza banco.
 */
export async function processProduct(
  produtoId: number,
  productName: string,
  fichaTecnica?: string | null,
  category?: string | null
): Promise<{ nomeNormalizado: string; metadataCount: number; needsReview: number }> {
  const db = await getDb();
  if (!db) return { nomeNormalizado: "", metadataCount: 0, needsReview: 0 };

  // 1. Normalizar nome
  const nomeNormalizado = normalizeProductName(productName);

  // 2. Extrair metadados da ficha técnica (se disponível)
  let metadataCount = 0;
  let needsReview = 0;

  if (fichaTecnica && fichaTecnica.trim().length >= 10) {
    const extracted = await extractMetadataFromFicha(fichaTecnica, productName, category ?? undefined);
    if (extracted.length > 0) {
      const result = await saveProductMetadata(produtoId, extracted, "extracted_from_ficha", "ai");
      metadataCount = result.saved;
      needsReview = extracted.filter((m) => m.needsReview).length;
    }
  }

  // 3. Atualizar nomeNormalizado e metadataExtractedAt no produto
  await db
    .update(products)
    .set({
      nomeNormalizado,
      metadataExtractedAt: new Date(),
    } as any)
    .where(eq(products.id, produtoId));

  return { nomeNormalizado, metadataCount, needsReview };
}

/**
 * Job de reindexação em lote do catálogo.
 * Processa produtos em chunks para não sobrecarregar a IA.
 */
export async function reindexCatalogFromFicha(options: {
  batchSize?: number;
  onlyWithFicha?: boolean;
  onlyWithoutNomeNormalizado?: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<{ processed: number; errors: number; totalMetadata: number; needsReview: number }> {
  const db = await getDb();
  if (!db) return { processed: 0, errors: 0, totalMetadata: 0, needsReview: 0 };

  const { batchSize = 20, onlyWithFicha = false, onlyWithoutNomeNormalizado = false } = options;

  // Buscar produtos para processar
  const allProducts = await db
    .select({
      id: products.id,
      name: products.name,
      fichaTecnica: (products as any).fichaTecnica,
      nomeNormalizado: (products as any).nomeNormalizado,
      categoryId: products.categoryId,
    })
    .from(products)
    .where(eq(products.isActive, "yes"));

  const toProcess = allProducts.filter((p) => {
    if (onlyWithFicha && !p.fichaTecnica) return false;
    if (onlyWithoutNomeNormalizado && p.nomeNormalizado) return false;
    return true;
  });

  let processed = 0;
  let errors = 0;
  let totalMetadata = 0;
  let totalNeedsReview = 0;

  for (let i = 0; i < toProcess.length; i += batchSize) {
    const chunk = toProcess.slice(i, i + batchSize);
    await Promise.all(
      chunk.map(async (p) => {
        try {
          const result = await processProduct(p.id, p.name, p.fichaTecnica, null);
          totalMetadata += result.metadataCount;
          totalNeedsReview += result.needsReview;
          processed++;
        } catch (err) {
          console.error(`[ReindexCatalog] Erro no produto #${p.id}:`, err);
          errors++;
        }
      })
    );

    options.onProgress?.(Math.min(i + batchSize, toProcess.length), toProcess.length);

    // Rate limiting: aguardar 500ms entre chunks para não sobrecarregar a IA
    if (i + batchSize < toProcess.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return { processed, errors, totalMetadata, needsReview: totalNeedsReview };
}
