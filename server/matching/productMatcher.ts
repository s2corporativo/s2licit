/**
 * productMatcher.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Algoritmo de correspondência multi-campo entre itens de edital e produtos
 * do catálogo interno.
 *
 * Técnicas utilizadas:
 *  - Levenshtein distance (similaridade por edição de caracteres)
 *  - Jaro-Winkler similarity (similaridade de strings curtas)
 *  - Token similarity (interseção de tokens normalizados)
 *
 * Pesos por critério:
 *  - Nome do produto:    40%
 *  - Princípio ativo:    25%
 *  - Apresentação:       15%
 *  - Unidade de medida:  10%
 *  - Fabricante:          5%
 *  - EAN/GTIN:            5%
 *
 * Regras de decisão (§6 — fonte única em matchClassification):
 *  - score >= 0.90 → match automático (uso sem validação)
 *  - score 0.75–0.89 → requer validação humana
 *  - score < 0.75  → não usar automaticamente (0.60–0.74 fica visível como
 *    candidato parcial para o revisor; < 0.60 não é sugerido)
 */

import { classificarCompatibilidade, LIMIAR_AUTO, LIMIAR_SEM_VALIDACAO } from "../services/matchClassification";

// ─── Stopwords para normalização ─────────────────────────────────────────────
const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "com", "para", "por",
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "ao", "aos",
  "na", "no", "nas", "nos", "se", "que", "ou", "mg", "ml", "mcg",
  "ui", "iu", "g", "kg", "l", "comprimido", "comprimidos", "capsula",
  "capsulas", "ampola", "ampolas", "frasco", "frascos", "bisnaga",
  "bisnagas", "sache", "sachê", "sachês", "bolsa", "bolsas", "caixa",
  "caixas", "unidade", "unidades", "cx", "un", "cp", "cps", "amp",
  "fr", "bs", "sol", "susp", "inj", "oral", "topico", "topica",
  "veterinario", "veterinaria", "humano", "humana",
]);

// ─── Normalização de texto ────────────────────────────────────────────────────

/**
 * Normaliza um texto para comparação:
 * 1. Converte para minúsculas
 * 2. Remove acentos (NFD + regex)
 * 3. Remove marcas registradas (®, ™, ©)
 * 4. Remove pontuação e caracteres especiais
 * 5. Normaliza espaços
 * 6. Remove stopwords
 */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return "";

  return text
    .toLowerCase()
    // Remove acentos
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Remove marcas registradas
    .replace(/[®™©]/g, "")
    // Remove pontuação e caracteres especiais (mantém letras, números, espaços)
    .replace(/[^a-z0-9\s]/g, " ")
    // Normaliza múltiplos espaços
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokeniza e remove stopwords de um texto normalizado.
 */
export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// ─── Algoritmos de similaridade ──────────────────────────────────────────────

/**
 * Distância de Levenshtein entre duas strings.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substituição
          matrix[i][j - 1] + 1,     // inserção
          matrix[i - 1][j] + 1      // deleção
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Similaridade normalizada por Levenshtein (0–1).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Similaridade de Jaro entre duas strings (0–1).
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  if (matchWindow < 0) return 0;

  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Similaridade de Jaro-Winkler (0–1).
 * Favorece strings com prefixo comum.
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  const jaro = jaroSimilarity(s1, s2);
  if (jaro < 0.7) return jaro;

  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Similaridade por tokens (Jaccard coefficient).
 * Compara conjuntos de tokens normalizados.
 */
export function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionCount = 0;
  tokensA.forEach((t) => { if (tokensB.has(t)) intersectionCount++; });
  const unionSize = tokensA.size + tokensB.size - intersectionCount;

  return intersectionCount / unionSize;
}

/**
 * Combina Levenshtein + Jaro-Winkler + Token similarity
 * com pesos: 40% Levenshtein, 30% Jaro-Winkler, 30% Token.
 */
export function combinedStringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const na = normalizeText(a);
  const nb = normalizeText(b);

  if (na === nb) return 1;

  const lev = levenshteinSimilarity(na, nb);
  const jw = jaroWinklerSimilarity(na, nb);
  const tok = tokenSimilarity(na, nb);

  return lev * 0.4 + jw * 0.3 + tok * 0.3;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ProductCandidate {
  id: number;
  name: string;
  activeIngredient?: string | null;
  presentation?: string | null;
  unit?: string | null;
  manufacturer?: string | null;
  barcode?: string | null;
  categoryId?: number | null;
  concentration?: string | null;
  // Motor de Inteligência V2
  nomeNormalizado?: string | null;
  synonyms?: string[];           // sinônimos aprovados
  metadata?: Record<string, string>; // metadados extraídos (key → value)
  ean?: string | null;           // EAN/GTIN padronizado
}

export interface EditalItem {
  nome: string;
  principioAtivo?: string;
  concentracao?: string;
  apresentacao?: string;
  unidade?: string;
  fabricante?: string;
  ean?: string;
  // Motor de Inteligência V2
  nomeNormalizado?: string;      // nome normalizado do item do edital
  fichaTecnica?: string;         // ficha técnica do item do edital
}

export interface MatchCriteria {
  nome: number;
  principioAtivo: number;
  apresentacao: number;
  unidade: number;
  fabricante: number;
  ean: number;
}

export interface MatchResult {
  product: ProductCandidate;
  score: number;
  criteria: MatchCriteria;
  decision: "auto_match" | "needs_review" | "no_match";
}

// ─── Pesos por critério ───────────────────────────────────────────────────────
const WEIGHTS: MatchCriteria = {
  nome: 0.40,
  principioAtivo: 0.25,
  apresentacao: 0.15,
  unidade: 0.10,
  fabricante: 0.05,
  ean: 0.05,
};

// ─── Thresholds de decisão (§6, alinhados a matchClassification) ──────────────
/** >= 90%: uso automático sem validação humana. */
export const MATCH_THRESHOLD_AUTO = LIMIAR_SEM_VALIDACAO; // 0.90
/** >= 75%: requer validação humana; abaixo disso não é automático. */
export const MATCH_THRESHOLD_REVIEW = LIMIAR_AUTO; // 0.75
/** Piso de visibilidade: candidatos parciais (0.60–0.74) ainda aparecem para
 * o revisor humano, mas nunca são usados automaticamente. */
export const MATCH_THRESHOLD_VISIBLE = 0.6;

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Calcula a similaridade entre um item de edital e um produto do catálogo.
 * Retorna score (0–1) e breakdown por critério.
 */
export function calculateProductSimilarity(
  editalItem: EditalItem,
  product: ProductCandidate
): { score: number; criteria: MatchCriteria } {
  // Score por EAN: match exato (1.0) ou zero
  let eanScore = 0;
  if (editalItem.ean && product.barcode) {
    const eanA = editalItem.ean.replace(/\D/g, "");
    const eanB = product.barcode.replace(/\D/g, "");
    if (eanA.length > 0 && eanA === eanB) eanScore = 1.0;
  }

  // Se EAN bate exatamente, retorna score máximo imediatamente
  if (eanScore === 1.0) {
    const criteria: MatchCriteria = {
      nome: 1.0, principioAtivo: 1.0, apresentacao: 1.0,
      unidade: 1.0, fabricante: 1.0, ean: 1.0,
    };
    return { score: 1.0, criteria };
  }

   // Score por nome: usa nomeNormalizado se disponível (melhor qualidade), senão nome bruto
  const editalNome = editalItem.nomeNormalizado || editalItem.nome;
  const productNome = product.nomeNormalizado || product.name;
  let nomeScore = combinedStringSimilarity(editalNome, productNome);

  // Boost por sinônimo: se o nome do edital bate com algum sinônimo do produto
  if (product.synonyms && product.synonyms.length > 0) {
    const synonymBoost = product.synonyms.reduce((best, syn) => {
      return Math.max(best, combinedStringSimilarity(editalNome, syn));
    }, 0);
    nomeScore = Math.max(nomeScore, synonymBoost * 0.95); // sinônimo vale 95% do score de nome
  }

  // Score por princípio ativo: usa metadados se disponível, senão activeIngredient
  const productPA = product.metadata?.principio_ativo || product.activeIngredient;
  const principioScore = (editalItem.principioAtivo && productPA)
    ? combinedStringSimilarity(editalItem.principioAtivo, productPA)
    : (editalItem.principioAtivo || productPA) ? 0 : 0.5; // campo ausente = neutro

  const apresentacaoScore = (editalItem.apresentacao && product.presentation)
    ? combinedStringSimilarity(editalItem.apresentacao, product.presentation)
    : (editalItem.apresentacao || product.presentation) ? 0 : 0.5;

  const unidadeScore = (editalItem.unidade && product.unit)
    ? combinedStringSimilarity(editalItem.unidade, product.unit)
    : (editalItem.unidade || product.unit) ? 0 : 0.5;

  const fabricanteScore = (editalItem.fabricante && product.manufacturer)
    ? combinedStringSimilarity(editalItem.fabricante, product.manufacturer)
    : (editalItem.fabricante || product.manufacturer) ? 0 : 0.5;

  const criteria: MatchCriteria = {
    nome: nomeScore,
    principioAtivo: principioScore,
    apresentacao: apresentacaoScore,
    unidade: unidadeScore,
    fabricante: fabricanteScore,
    ean: eanScore,
  };

  const score =
    criteria.nome * WEIGHTS.nome +
    criteria.principioAtivo * WEIGHTS.principioAtivo +
    criteria.apresentacao * WEIGHTS.apresentacao +
    criteria.unidade * WEIGHTS.unidade +
    criteria.fabricante * WEIGHTS.fabricante +
    criteria.ean * WEIGHTS.ean;

  return { score: Math.min(1, Math.max(0, score)), criteria };
}

/**
 * Determina a decisão com base no score, delegando à classificação canônica
 * da §6 (auto >= 90%, validação humana 75–89%, abaixo não-automático).
 */
export function getMatchDecision(score: number): "auto_match" | "needs_review" | "no_match" {
  const c = classificarCompatibilidade(score);
  if (c.usoAutomaticoPermitido) return "auto_match";
  if (c.exigeValidacaoHumana) return "needs_review";
  return "no_match";
}

/**
 * Aplica pré-filtros para reduzir o conjunto de candidatos antes do matching.
 * Filtra por categoria, princípio ativo ou unidade quando disponíveis.
 */
export function preFilterCandidates(
  editalItem: EditalItem,
  candidates: ProductCandidate[]
): ProductCandidate[] {
  if (candidates.length <= 50) return candidates; // Pequeno conjunto: sem filtro

  let filtered = candidates;

  // Pré-filtro por princípio ativo (se disponível)
  if (editalItem.principioAtivo) {
    const normPA = normalizeText(editalItem.principioAtivo);
    const byPA = filtered.filter((p) => {
      if (!p.activeIngredient) return false;
      return normalizeText(p.activeIngredient).includes(normPA.split(" ")[0]);
    });
    if (byPA.length >= 3) filtered = byPA;
  }

  // Pré-filtro por unidade (se disponível)
  if (editalItem.unidade && filtered.length > 100) {
    const normUnit = normalizeText(editalItem.unidade);
    const byUnit = filtered.filter((p) => {
      if (!p.unit) return false;
      return normalizeText(p.unit).includes(normUnit.split(" ")[0]);
    });
    if (byUnit.length >= 3) filtered = byUnit;
  }

  return filtered;
}

/**
 * Executa o matching completo de um item de edital contra uma lista de produtos.
 * Retorna os melhores candidatos ordenados por score, com decisão.
 *
 * @param editalItem - Item do edital a ser comparado
 * @param candidates - Lista de produtos candidatos (já pré-filtrados ou completa)
 * @param maxResults - Número máximo de resultados a retornar (default: 5)
 */
export function matchEditalItem(
  editalItem: EditalItem,
  candidates: ProductCandidate[],
  maxResults = 5
): MatchResult[] {
  const filtered = preFilterCandidates(editalItem, candidates);

  const results: MatchResult[] = filtered
    .map((product) => {
      const { score, criteria } = calculateProductSimilarity(editalItem, product);
      const decision = getMatchDecision(score);
      return { product, score, criteria, decision };
    })
    .filter((r) => r.score >= MATCH_THRESHOLD_VISIBLE) // mantém parciais visíveis; remove ruins (<60%)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return results;
}

/**
 * Extrai campos estruturados de um texto de item de edital.
 * Tenta identificar: nome, concentração, unidade, apresentação.
 *
 * Exemplo: "Propofol 10mg/ml ampola 20ml Cristália"
 * → { nome: "Propofol", concentracao: "10mg/ml", apresentacao: "ampola 20ml", fabricante: "Cristália" }
 */
export function parseEditalItemText(text: string): EditalItem {
  const normalized = normalizeText(text);
  const tokens = normalized.split(" ");

  // Padrão de concentração: número + unidade (ex: 10mg, 500mcg, 10mg/ml)
  const concPattern = /^\d+\.?\d*(mg|mcg|g|kg|ml|l|ui|iu|%)(\/\w+)?$/i;

  // Padrão de apresentação: palavras-chave comuns
  const apresentacaoKeywords = [
    "comprimido", "capsula", "ampola", "frasco", "bisnaga", "sache",
    "bolsa", "caixa", "solucao", "suspensao", "injetavel", "oral",
    "topico", "pomada", "creme", "gel", "spray", "gotas", "xarope",
    "drágea", "drágeas", "dragea", "drageas", "supositorio", "ovulo",
    "adesivo", "patch", "implante", "pellet",
  ];

  let concentracao = "";
  const apresentacaoParts: string[] = [];
  const nomeParts: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (concPattern.test(token)) {
      concentracao = token;
    } else if (apresentacaoKeywords.some((k) => token.includes(k))) {
      apresentacaoParts.push(token);
      // Pega o próximo token se for número (ex: "ampola 20ml")
      if (i + 1 < tokens.length && /^\d/.test(tokens[i + 1])) {
        apresentacaoParts.push(tokens[i + 1]);
        i++;
      }
    } else {
      // Tudo que não é concentração nem apresentação compõe o nome — "Dipirona
      // sódica" inteiro, não só a primeira palavra (o nome pesa 40% do score).
      nomeParts.push(token);
    }
  }

  return {
    nome: nomeParts.join(" ") || text,
    concentracao: concentracao || undefined,
    apresentacao: apresentacaoParts.join(" ") || undefined,
  };
}
