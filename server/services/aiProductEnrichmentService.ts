import { invokeLLM } from "../_core/llm";
import type { ScrapedProduct } from "./scraperIntegrationService";

/**
 * Interface para campos enriquecidos por IA
 */
export interface EnrichedProductFields {
  activeIngredient?: string;
  concentration?: string;
  unit?: string;
  indication?: string;
  contraindication?: string;
  dosage?: string;
  administration?: string;
  sideEffects?: string;
  storage?: string;
  validity?: string;
  manufacturer?: string;
  ncm?: string;
  mapa?: string;
  specieAnimal?: string;
  therapeuticClass?: string;
  confidence: number; // 0-100
  fieldsExtracted: string[];
  rawResponse: string;
}

/**
 * Enriquece produto com IA extraindo campos faltantes
 */
export async function enrichProductWithAI(
  product: ScrapedProduct
): Promise<EnrichedProductFields> {
  const fieldsToExtract: string[] = [];

  // Identificar campos faltantes
  if (!product.activeIngredient) fieldsToExtract.push("ingrediente ativo");
  if (!product.concentration) fieldsToExtract.push("concentração");
  if (!product.unit) fieldsToExtract.push("unidade");
  if (!product.manufacturer) fieldsToExtract.push("fabricante");
  if (!product.ncm) fieldsToExtract.push("NCM");
  if (!product.mapa) fieldsToExtract.push("registro MAPA");
  if (!product.especieAnimal) fieldsToExtract.push("espécie animal");
  if (!product.classeTerapeutica) fieldsToExtract.push("classe terapêutica");

  if (fieldsToExtract.length === 0) {
    return {
      confidence: 100,
      fieldsExtracted: [],
      rawResponse: "Produto já contém todos os campos",
    };
  }

  try {
    const prompt = buildEnrichmentPrompt(product, fieldsToExtract);

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um especialista em produtos veterinários e farmacêuticos. 
          Analise a descrição do produto e extraia informações técnicas precisas.
          Retorne APENAS um JSON válido com os campos solicitados.
          Se não conseguir extrair um campo, omita-o da resposta.
          Seja conservador: só inclua informações que você tem certeza.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "product_enrichment",
          strict: true,
          schema: {
            type: "object",
            properties: {
              activeIngredient: {
                type: "string",
                description: "Ingrediente ativo principal",
              },
              concentration: {
                type: "string",
                description: "Concentração do ingrediente ativo",
              },
              unit: {
                type: "string",
                description: "Unidade de medida (mg, ml, g, etc)",
              },
              indication: {
                type: "string",
                description: "Indicação terapêutica",
              },
              contraindication: {
                type: "string",
                description: "Contraindicações",
              },
              dosage: {
                type: "string",
                description: "Dosagem recomendada",
              },
              administration: {
                type: "string",
                description: "Via de administração",
              },
              sideEffects: {
                type: "string",
                description: "Efeitos colaterais conhecidos",
              },
              storage: {
                type: "string",
                description: "Condições de armazenamento",
              },
              validity: {
                type: "string",
                description: "Validade ou prazo de validade",
              },
              manufacturer: {
                type: "string",
                description: "Fabricante",
              },
              ncm: {
                type: "string",
                description: "Código NCM",
              },
              mapa: {
                type: "string",
                description: "Registro MAPA",
              },
              specieAnimal: {
                type: "string",
                description: "Espécie animal de uso",
              },
              therapeuticClass: {
                type: "string",
                description: "Classe terapêutica",
              },
              confidence: {
                type: "number",
                description: "Confiança da extração (0-100)",
              },
            },
            required: ["confidence"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message.content;
    if (!content) {
      throw new Error("Resposta vazia da IA");
    }

    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const extracted = JSON.parse(contentStr);

    return {
      activeIngredient: extracted.activeIngredient,
      concentration: extracted.concentration,
      unit: extracted.unit,
      indication: extracted.indication,
      contraindication: extracted.contraindication,
      dosage: extracted.dosage,
      administration: extracted.administration,
      sideEffects: extracted.sideEffects,
      storage: extracted.storage,
      validity: extracted.validity,
      manufacturer: extracted.manufacturer || product.manufacturer,
      ncm: extracted.ncm,
      mapa: extracted.mapa,
      specieAnimal: extracted.specieAnimal,
      therapeuticClass: extracted.therapeuticClass,
      confidence: extracted.confidence || 75,
      fieldsExtracted: Object.keys(extracted).filter(
        (k) => extracted[k] && k !== "confidence"
      ),
      rawResponse: typeof content === 'string' ? content : JSON.stringify(content),
    };
  } catch (error) {
    console.error("[AI Enrichment] Erro ao enriquecer produto:", error);
    throw error;
  }
}

/**
 * Constrói prompt para enriquecimento
 */
function buildEnrichmentPrompt(
  product: ScrapedProduct,
  fieldsToExtract: string[]
): string {
  return `
Analise o seguinte produto e extraia os campos solicitados:

**Nome do Produto:** ${product.name}
**Descrição:** ${product.description || "Não disponível"}
**Fabricante:** ${product.manufacturer || "Não disponível"}
**Apresentação:** ${product.presentation || "Não disponível"}
**Preço:** ${product.price ? `R$ ${product.price}` : "Não disponível"}
**EAN:** ${product.ean || "Não disponível"}
**URL:** ${product.productUrl || "Não disponível"}

**Campos a extrair:**
${fieldsToExtract.map((f) => `- ${f}`).join("\n")}

Retorne um JSON com os campos extraídos. Seja preciso e conservador.
`;
}

/**
 * Enriquece múltiplos produtos em batch
 */
export async function enrichProductsBatch(
  products: ScrapedProduct[],
  maxConcurrent: number = 3
): Promise<Map<string, EnrichedProductFields>> {
  const results = new Map<string, EnrichedProductFields>();
  const queue = [...products];
  const inProgress = new Set<Promise<void>>();

  while (queue.length > 0 || inProgress.size > 0) {
    while (inProgress.size < maxConcurrent && queue.length > 0) {
      const product = queue.shift();
      if (!product) break;

      const promise = enrichProductWithAI(product)
        .then((enriched) => {
          const key = product.ean || product.name;
          results.set(key, enriched);
        })
        .catch((error) => {
          console.error(
            `[AI Enrichment] Erro ao processar ${product.name}:`,
            error
          );
        })
        .finally(() => {
          inProgress.delete(promise);
        });

      inProgress.add(promise);
    }

    if (inProgress.size > 0) {
      await Promise.race(inProgress);
    }
  }

  return results;
}

/**
 * Valida campos enriquecidos
 */
export function validateEnrichedFields(
  enriched: EnrichedProductFields
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (enriched.confidence < 50) {
    errors.push(`Confiança baixa: ${enriched.confidence}%`);
  }

  if (
    enriched.activeIngredient &&
    enriched.activeIngredient.length > 500
  ) {
    errors.push("Ingrediente ativo muito longo");
  }

  if (enriched.concentration && !/^[\d.,\s\-/()a-zA-Z%]+$/.test(enriched.concentration)) {
    errors.push("Concentração com formato inválido");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Mescla campos enriquecidos com produto original
 */
export function mergeEnrichedFields(
  product: ScrapedProduct,
  enriched: EnrichedProductFields
): ScrapedProduct {
  return {
    ...product,
    activeIngredient: enriched.activeIngredient || product.activeIngredient,
    concentration: enriched.concentration || product.concentration,
    unit: enriched.unit || product.unit,
    manufacturer: enriched.manufacturer || product.manufacturer,
    especieAnimal: enriched.specieAnimal || product.especieAnimal,
    classeTerapeutica:
      enriched.therapeuticClass || product.classeTerapeutica,
    mapa: enriched.mapa || product.mapa,
    ncm: enriched.ncm || product.ncm,
  };
}

/**
 * Calcula score de qualidade do enriquecimento
 */
export function calculateEnrichmentScore(
  original: ScrapedProduct,
  enriched: EnrichedProductFields
): number {
  let score = 0;

  // Confiança da IA (0-30 pontos)
  score += (enriched.confidence / 100) * 30;

  // Campos extraídos (0-40 pontos)
  const maxFields = 8;
  score += (enriched.fieldsExtracted.length / maxFields) * 40;

  // Campos críticos (0-30 pontos)
  const criticalFields = [
    "activeIngredient",
    "concentration",
    "manufacturer",
  ];
  const hasCritical = criticalFields.filter((f) =>
    enriched.fieldsExtracted.includes(f)
  ).length;
  score += (hasCritical / criticalFields.length) * 30;

  return Math.min(100, Math.round(score));
}
