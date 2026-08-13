/**
 * normalize.ts — Normalization Engine oficial do S2Licit.
 * ─────────────────────────────────────────────────────────────────────────────
 * Fonte ÚNICA de verdade para normalização de texto de produtos, usada por
 * todos os engines (matching, duplicidade, equivalência, busca, importação).
 *
 * Pipeline por estágios, todos opcionais e ativáveis individualmente:
 *   1. case         — minúsculas/maiúsculas e trimming
 *   2. accents      — remoção de acentuação (NFD + regex)
 *   3. punctuation  — remoção de pontuação e símbolos (mantém letras, números, espaços)
 *   4. whitespace   — colapso de espaços múltiplos
 *   5. stopwords    — remoção de conectivos farmacêuticos e gerais (pt-BR)
 *   6. plural       — redução de plurais comuns em "s"
 *   7. abbreviations— expansão de abreviações comuns de produtos (amp, cx, fr, cp...)
 *   8. units        — padronização de unidades e medidas (ml, g, kg, ui, %)
 *   9. packaging    — padronização de embalagens/apresentações comerciais
 *  10. quantities   — remoção de quantidades comerciais ("caixa com 10", "duplo")
 *  11. brandNoise   — remoção de ruído comercial (®, ™, ©, "marca xyz")
 *  12. codes        — remoção de códigos comerciais (SKU/CX de caixas)
 *
 * A API pública é `normalizeText`, que aplica os estágios 1–5 (comportamento
 * compatível com o `normalizeText` antigo do matching, preservando os
 * consumidores existentes), e `normalizeProductKey`, que aplica o pipeline
 * completo para chaves de comparação e detecção de duplicidade.
 *
 * Este módulo é puro: sem banco, sem dependências.
 */

// ─── Constantes dos estágios ─────────────────────────────────────────────────

export const STOPWORDS = new Set([
  // Conectivos gerais (pt-BR)
  "de", "da", "do", "das", "dos", "e", "em", "com", "para", "por",
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "ao", "aos",
  "na", "no", "nas", "nos", "se", "que", "ou", "c",
  // Unidades e medidas (mantidas na CHAVE de produto, removidas da chave de nome)
  "mg", "ml", "mcg", "ui", "iu", "g", "kg", "l", "gr", "lt",
  // Formas farmacêuticas/apresentações (stopwords do matching histórico)
  "comprimido", "comprimidos", "capsula", "capsulas", "caps", "ampola",
  // Variantes acentuadas (o texto já passa por stageAccents antes, mas
  // stopwording também pode operar sobre texto bruto em alguns chamadores).
  "sache", "saches", "sachê", "sachês",
  "ampolas", "frasco", "frascos", "bisnaga", "bisnagas", "bolsa",
  "bolsas", "caixa", "caixas", "unidade", "unidades",
  "cx", "un", "cp", "cps", "amp", "fr", "bs", "sol", "susp", "inj",
  "oral", "topico", "topica", "pomada", "creme", "gel", "spray",
  "gotas", "xarope", "dragea", "drageas", "supositorio", "ovulo",
  // Qualificadores de segmento
  "veterinario", "veterinaria", "humano", "humana",
]);

/** Abreviações → forma expandida (unidades e apresentações comuns). */
export const ABBREVIATIONS: Record<string, string> = {
  amp: "ampola",
  ampolas: "ampola",
  fr: "frasco",
  frascos: "frasco",
  frs: "frasco",
  bs: "bisnaga",
  cp: "comprimido",
  cps: "comprimido",
  comp: "comprimido",
  caps: "capsula",
  cx: "caixa",
  cxas: "caixa",
  c: "caixa", // "caixa c/ 21" → "c" vira espaço de "c/"
  un: "unidade",
  unds: "unidade",
  und: "unidade",
  ml: "mililitro",
  l: "litro",
  lt: "litro",
  kg: "quilo",
  ui: "unidade_internacional",
  iu: "unidade_internacional",
  solucao: "solucao",
  susp: "suspensao",
  inj: "injetavel",
  topico: "topico",
  topica: "topico",
};

/** Embalagens/apresentações comerciais → chave padrão. */
export const PACKAGING: Record<string, string> = {
  bisnaga: "bisnaga",
  bisnagas: "bisnaga",
  sachê: "sache",
  saches: "sache",
  cartela: "cartela",
  cartelas: "cartela",
  blister: "blister",
  pote: "pote",
  potes: "pote",
  galao: "galao",
  galoes: "galao",
  lata: "lata",
  latas: "lata",
  rolo: "rolo",
  rolos: "rolo",
  barra: "barra",
  barras: "barra",
  par: "par",
  dupla: "duplo",
  trio: "trio",
};

/** Quantidades comerciais a remover da chave (não alteram a identidade). */
export const QUANTITY_PATTERNS: RegExp[] = [
  /(^|\s)(duplo|triplo|quadruplo|dupla|kit|kits?)\b/gi,
  // Quantificador comercial: "com 100 unidades", "com 21 cx", "com 50 un"
  // — remove o quantificador, preservando a embalagem ("caixa", "pote").
  /\b(com\s+\d+\s+(unidades|cx\.?|un\.?|caixas|frascos|ampolas|bisnagas))\b/gi,
  // "c/ 21" solto (sem unidade depois) — apresentação comercial de caixa.
  /\bc\/\s*\d+\b/gi,
  /\b(uso\s+(humano|veterinário|veterinario))\b/gi,
];

// ─── Estágios individuais (testáveis isoladamente) ──────────────────────────

export function stageCase(s: string): string {
  return s.toLowerCase().trim();
}

export function stageAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function stagePunctuation(s: string): string {
  return s.replace(/[®™©]/g, "").replace(/[^a-z0-9\s]/g, " ");
}

export function stageWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function stageStopwords(s: string): string {
  return s
    .split(" ")
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .join(" ");
}

export function stagePlural(s: string): string {
  // Plural simples em "s" (ex.: "comprimidos" → "comprimido"). Regras de
  // plural irregulares (mães, pães) não se aplicam ao vocabulário de produto.
  if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) {
    const base = s.slice(0, -1);
    return base;
  }
  return s;
}

export function stageAbbreviations(s: string): string {
  return s
    .split(" ")
    .map((token) => ABBREVIATIONS[token] ?? token)
    .join(" ");
}

export function stagePackaging(s: string): string {
  return s
    .split(" ")
    .map((token) => PACKAGING[token] ?? token)
    .join(" ");
}

export function stageQuantityNoise(s: string): string {
  let out = s;
  for (const pattern of QUANTITY_PATTERNS) {
    const replaced = out.replace(pattern, " ");
    if (replaced !== out) {
      out = stageWhitespace(replaced);
    }
  }
  return out;
}

export function stageBrandNoise(s: string): string {
  return s
    .replace(/([®™©]+)/g, " ")
    .replace(/\b(r | tm | c )\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── API pública ─────────────────────────────────────────────────────────────

export interface NormalizeOptions {
  caseSensitive?: boolean;      // false → minúsculas (padrão)
  accents?: boolean;            // remove acentos (padrão true)
  punctuation?: boolean;        // remove pontuação (padrão true)
  stopwords?: boolean;          // remove conectivos (padrão false para compat)
  plural?: boolean;             // reduz plurais (padrão false)
  abbreviations?: boolean;      // expande abreviações (padrão false)
  packaging?: boolean;          // padroniza embalagens (padrão false)
  quantityNoise?: boolean;      // remove quantidades comerciais (padrão false)
  brandNoise?: boolean;         // remove ruído de marca (padrão true)
}

const DEFAULT_OPTIONS: NormalizeOptions = {
  caseSensitive: false,
  accents: true,
  punctuation: true,
  stopwords: false,
  plural: false,
  abbreviations: false,
  packaging: false,
  quantityNoise: false,
  brandNoise: true,
};

/**
 * Normalização compatível com o `normalizeText` histórico do matching:
 * minúsculas, sem acentos, sem marcas registradas, sem pontuação, espaços
 * normalizados. Usada por `productMatcher`, `fuzzy.ts` e consumidores antigos.
 */
export function normalizeText(text: string | null | undefined, opts: NormalizeOptions = {}): string {
  if (!text) return "";
  const options = { ...DEFAULT_OPTIONS, ...opts };
  let s = text;
  if (!options.caseSensitive) s = stageCase(s);
  if (options.brandNoise) s = stageBrandNoise(s);
  if (options.accents) s = stageAccents(s);
  // Abreviações e embalagens ANTES da remoção de pontuação — "c/", "cx.",
  // "un." precisam dos sinais para casar com o dicionário. Depois da
  // remoção de pontuação, aplica-se novamente para casar os tokens limpos
  // ("c/" → "c " → "caixa").
  if (options.abbreviations) s = stageAbbreviations(s);
  if (options.packaging) s = stagePackaging(s);
  if (options.punctuation) s = stagePunctuation(s);
  if (options.abbreviations) s = stageAbbreviations(s);
  if (options.packaging) s = stagePackaging(s);
  s = stageWhitespace(s);
  if (options.stopwords) s = stageStopwords(s);
  if (options.quantityNoise) s = stageQuantityNoise(s);
  if (options.plural) s = s.split(" ").map(stagePlural).join(" ").replace(/\s+/g, " ").trim();
  return stageWhitespace(s);
}

/**
 * Chave canônica de produto para comparação, detecção de duplicidade e
 * busca: pipeline COMPLETO (inclui stopwords, plural, abreviações,
 * embalagens e remoção de ruído comercial de quantidade).
 *
 * Ex.: "Amoxilina 500mg Cápsulas Caixa c/ 21" → "amoxilina 500 miligrama capsula 21"
 */
export function normalizeProductKey(text: string | null | undefined): string {
  if (!text) return "";
  const base = normalizeText(text, {
    caseSensitive: false,
    accents: true,
    punctuation: true,
    // A CHAVE preserva embalagem/apresentação e unidade (não são stopwords):
    // "cápsula", "frasco", "ml" carregam identidade técnica. Stopwords só
    // removem conectivos gramaticais e ruído comercial.
    stopwords: false,
    plural: true,
    abbreviations: true,
    packaging: true,
    quantityNoise: true,
    brandNoise: true,
  });
  return stageWhitespace(base);
}

/**
 * Normaliza texto antigo do db/_helpers (compatibilidade com
 * `normalizeName`): minúsculas, sem acentos, sem pontuação, espaços.
 */
export function normalizeNameLegacy(s: string | null | undefined): string {
  if (!s) return "";
  return normalizeText(s, { stopwords: false, plural: false, brandNoise: false });
}

/**
 * Diferença entre duas chaves canônicas (0 = idênticas, 1 = completamente
 * diferentes). Delega ao algoritmo canônico único do matching para evitar
 * terceira implementação de distância.
 */
export function keyDistance(a: string, b: string, similarityFn: (a: string, b: string) => number): number {
  const ka = normalizeProductKey(a);
  const kb = normalizeProductKey(b);
  if (!ka && !kb) return 0;
  if (!ka || !kb) return 1;
  if (ka === kb) return 0;
  return 1 - similarityFn(ka, kb);
}
