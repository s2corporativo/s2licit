/**
 * equivalenceValidationService.ts
 * Serviço de validação automática de equivalência técnica para itens de pregão
 * 
 * Funcionalidades:
 * - Extrair atributos técnicos de descrições de itens de pregão via IA
 * - Buscar produtos equivalentes no catálogo por princípio ativo, concentração, forma farmacêutica
 * - Calcular score de compatibilidade técnica
 * - Ordenar sugestões por score e preço
 */

import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { products, extractedAttributes } from "../../drizzle/schema";
import { eq, and, like, sql } from "drizzle-orm";

export interface PregoItem {
  id: string;
  description: string;
  quantity?: number;
  unit?: string;
  estimatedValue?: number;
}

export interface ExtractedAttributes {
  principioAtivo?: string;
  concentracao?: string;
  formaFarmaceutica?: string;
  classeTerapeutica?: string;
  especieAlvo?: string;
  indicacoes?: string;
  [key: string]: string | undefined;
}

export interface EquivalentProduct {
  id: number;
  name: string;
  supplierId: number;
  supplierName?: string;
  activeIngredient?: string;
  concentration?: string;
  presentation?: string;
  price?: string;
  priceUnit?: string;
  unit?: string;
  imageUrl?: string;
  productUrl?: string;
  score: number;
  scoreBreakdown: {
    activeIngredient: number;
    concentration: number;
    presentation: number;
    other: number;
  };
  justification: string;
}

export interface EquivalenceValidationResult {
  pregoItem: PregoItem;
  extractedAttributes: ExtractedAttributes;
  equivalents: EquivalentProduct[];
  bestMatch?: EquivalentProduct;
  totalFound: number;
}

/**
 * Extrai atributos técnicos de uma descrição de item de pregão via IA
 */
export async function extractPregoItemAttributes(
  description: string
): Promise<ExtractedAttributes> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Você é um especialista em medicamentos veterinários e humanos. 
Extraia os atributos técnicos da descrição de um item de licitação/pregão.
Retorne um JSON estruturado com os atributos encontrados.
Seja preciso e técnico nas extrações.`,
        },
        {
          role: "user",
          content: `Descrição do item: "${description}"
          
Extraia e retorne em JSON com as seguintes chaves (quando disponíveis):
- principioAtivo: princípio ativo ou nome do fármaco
- concentracao: concentração (ex: 10mg/mL)
- formaFarmaceutica: forma farmacêutica (ex: solução injetável, comprimido)
- classeTerapeutica: classe terapêutica
- especieAlvo: espécie alvo (ex: equinos, bovinos, cães)
- indicacoes: indicações de uso
- apresentacao: apresentação/embalagem
- laboratorio: laboratório/fabricante

Retorne APENAS o JSON, sem explicações.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "prego_attributes",
          strict: true,
          schema: {
            type: "object",
            properties: {
              principioAtivo: { type: "string" },
              concentracao: { type: "string" },
              formaFarmaceutica: { type: "string" },
              classeTerapeutica: { type: "string" },
              especieAlvo: { type: "string" },
              indicacoes: { type: "string" },
              apresentacao: { type: "string" },
              laboratorio: { type: "string" },
            },
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    
    return {
      principioAtivo: parsed.principioAtivo,
      concentracao: parsed.concentracao,
      formaFarmaceutica: parsed.formaFarmaceutica,
      classeTerapeutica: parsed.classeTerapeutica,
      especieAlvo: parsed.especieAlvo,
      indicacoes: parsed.indicacoes,
    };
  } catch (error) {
    console.error("Erro ao extrair atributos do item de pregão:", error);
    return {};
  }
}

/**
 * Normaliza valor para comparação
 */
function normalizeValue(value: string | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/[,]/g, ".");
}

/**
 * Calcula score de compatibilidade entre atributos
 */
function calculateAttributeScore(
  refValue: string | undefined,
  candValue: string | undefined,
  weight: number = 1
): { score: number; match: boolean } {
  if (!refValue || !candValue) return { score: 0, match: false };

  const ref = normalizeValue(refValue);
  const cand = normalizeValue(candValue);

  // Busca exata
  if (ref === cand) return { score: 100 * weight, match: true };

  // Busca parcial (substring)
  if (cand.includes(ref) || ref.includes(cand)) return { score: 75 * weight, match: true };

  // Comparação numérica para concentrações
  const refNum = parseFloat(ref.match(/[\d.]+/)?.[0] || "");
  const candNum = parseFloat(cand.match(/[\d.]+/)?.[0] || "");

  if (!isNaN(refNum) && !isNaN(candNum)) {
    const diff = Math.abs(refNum - candNum) / refNum;
    if (diff <= 0.05) return { score: 90 * weight, match: true }; // 5% tolerance
    if (diff <= 0.1) return { score: 70 * weight, match: true }; // 10% tolerance
    if (diff <= 0.2) return { score: 50 * weight, match: true }; // 20% tolerance
  }

  return { score: 0, match: false };
}

/**
 * Busca produtos equivalentes no catálogo
 */
export async function findEquivalentProducts(
  attributes: ExtractedAttributes,
  limit: number = 20
): Promise<EquivalentProduct[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    // Buscar produtos por princípio ativo
    let candidates: any[] = [];

    if (attributes.principioAtivo) {
      candidates = await db
        .select({
          id: products.id,
          name: products.name,
          supplierId: products.supplierId,
          activeIngredient: products.activeIngredient,
          concentration: products.concentration,
          presentation: products.presentation,
          price: products.price,
          priceUnit: products.priceUnit,
          unit: products.unit,
          imageUrl: products.imageUrl,
          productUrl: products.productUrl,
        })
        .from(products)
        .where(
          and(
            eq(products.isActive, "yes"),
            like(products.activeIngredient, `%${attributes.principioAtivo}%`)
          )
        )
        .limit(limit * 2); // Buscar o dobro para depois filtrar
    }

    // Se não encontrou por princípio ativo, buscar por nome
    if (candidates.length === 0 && attributes.principioAtivo) {
      candidates = await db
        .select({
          id: products.id,
          name: products.name,
          supplierId: products.supplierId,
          activeIngredient: products.activeIngredient,
          concentration: products.concentration,
          presentation: products.presentation,
          price: products.price,
          priceUnit: products.priceUnit,
          unit: products.unit,
          imageUrl: products.imageUrl,
          productUrl: products.productUrl,
        })
        .from(products)
        .where(
          and(
            eq(products.isActive, "yes"),
            like(products.name, `%${attributes.principioAtivo}%`)
          )
        )
        .limit(limit * 2);
    }

    // Calcular scores de compatibilidade
    const scored = candidates.map((product) => {
      const scores = {
        activeIngredient: calculateAttributeScore(
          attributes.principioAtivo,
          product.activeIngredient,
          40
        ),
        concentration: calculateAttributeScore(
          attributes.concentracao,
          product.concentration,
          35
        ),
        presentation: calculateAttributeScore(
          attributes.formaFarmaceutica,
          product.presentation,
          25
        ),
      };

      const totalScore =
        (scores.activeIngredient.score +
          scores.concentration.score +
          scores.presentation.score) /
        100;

      const justification = [
        scores.activeIngredient.match ? `✓ Princípio ativo compatível` : `✗ Princípio ativo diferente`,
        scores.concentration.match ? `✓ Concentração compatível` : `✗ Concentração diferente`,
        scores.presentation.match ? `✓ Forma farmacêutica compatível` : `✗ Forma farmacêutica diferente`,
      ]
        .filter((j) => j)
        .join("; ");

      return {
        ...product,
        score: Math.round(totalScore),
        scoreBreakdown: {
          activeIngredient: scores.activeIngredient.score,
          concentration: scores.concentration.score,
          presentation: scores.presentation.score,
          other: 0,
        },
        justification,
      };
    });

    // Ordenar por score (descendente) e depois por preço (ascendente)
    return scored
      .filter((p) => p.score >= 50) // Mínimo 50% de compatibilidade
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const priceA = parseFloat(a.price || "999999");
        const priceB = parseFloat(b.price || "999999");
        return priceA - priceB;
      })
      .slice(0, limit);
  } catch (error) {
    console.error("Erro ao buscar produtos equivalentes:", error);
    return [];
  }
}

/**
 * Valida equivalência para um item de pregão
 */
export async function validateEquivalenceForPregoItem(
  pregoItem: PregoItem
): Promise<EquivalenceValidationResult> {
  // Extrair atributos
  const attributes = await extractPregoItemAttributes(pregoItem.description);

  // Buscar equivalentes
  const equivalents = await findEquivalentProducts(attributes, 20);

  return {
    pregoItem,
    extractedAttributes: attributes,
    equivalents,
    bestMatch: equivalents[0],
    totalFound: equivalents.length,
  };
}

/**
 * Valida equivalência para múltiplos itens de pregão
 */
export async function validateEquivalenceForMultipleItems(
  pregoItems: PregoItem[]
): Promise<EquivalenceValidationResult[]> {
  return Promise.all(
    pregoItems.map((item) => validateEquivalenceForPregoItem(item))
  );
}
