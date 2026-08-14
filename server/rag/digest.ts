/**
 * digest.ts — Texto canônico de produto para embedding (Motor de Equivalências).
 * ─────────────────────────────────────────────────────────────────────────────
 * Compõe um texto semântico rico a partir dos campos técnicos do produto
 * (`products`), reutilizando o Normalization Engine oficial do S2
 * (`shared/normalize`) para que os termos fiquem na mesma família lexical
 * usada pelo matching determinístico. O digest NÃO remove unidades/dosagens
 * (estágios 6–9 do pipeline completo são evitados): concentração e via são
 * *sinal* de equivalência, não ruído.
 *
 * Formato do digest:
 *   "produto: {nome} | principio ativo: {activeIngredient} |
 *    concentracao: {concentration} | forma: {pharmaceuticalForm} |
 *    via: {viaAdministracao} | especie: {especieAnimal} |
 *    classe: {classeTerapeutica} | fabricante: {manufacturer} |
 *    descricao: {description}"
 *
 * Versão do pipeline (version) deve ser incrementada se o formato mudar —
 * força reindexação automática pela rotina de reindexação.
 */
import { normalizeText } from "../../shared/normalize";

export const RAG_DIGEST_VERSION = 1;

type ProductDigestSource = {
  name: string;
  activeIngredient?: string | null;
  concentration?: string | null;
  pharmaceuticalForm?: string | null;
  viaAdministracao?: string | null;
  especieAnimal?: string | null;
  classeTerapeutica?: string | null;
  manufacturer?: string | null;
  laboratorio?: string | null;
  description?: string | null;
  informacaoTecnica?: string | null;
};

/**
 * Monta o texto canônico do produto. Campos nulos/vazios são omitidos
 * (sem placeholders que poluam o espaço vetorial).
 */
export function buildProductDigest(product: ProductDigestSource): string {
  const parts: Array<{ label: string; value: string }> = [
    { label: "produto", value: normalizeText(product.name) },
  ];
  const add = (label: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (v) parts.push({ label, value: normalizeText(v) });
  };
  add("principio ativo", product.activeIngredient);
  add("concentracao", product.concentration);
  add("forma", product.pharmaceuticalForm);
  add("via", product.viaAdministracao);
  add("especie", product.especieAnimal);
  add("classe terapeutica", product.classeTerapeutica);
  add("fabricante", product.manufacturer || product.laboratorio);
  add("descricao", product.description);
  return parts.map((p) => `${p.label}: ${p.value}`).join(" | ");
}

/**
 * Monta o digest da consulta do usuário (TR/descrição livre), mantendo a
 * estrutura de rótulos para alinhar o espaço vetorial com o dos produtos.
 */
export function buildQueryDigest(query: string): string {
  const q = query.trim();
  if (!q) throw new Error("buildQueryDigest: consulta vazia");
  return `consulta: ${normalizeText(q)}`;
}

/**
 * Similaridade de cosseno entre dois vetores. Assume normalização por
 * magnitude (vetores de embedding já vêm normalizados pelo provedor,
 * mas o cálculo completo protege contra divergências entre famílias).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error(`cosineSimilarity: vetores incompatíveis (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}
