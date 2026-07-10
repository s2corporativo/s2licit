/**
 * normalizer.ts
 * Funções de normalização de nomes de produtos para melhorar busca e matching.
 * Não depende de IA — é determinístico e rápido.
 */

// Termos irrelevantes para remoção durante normalização
const STOP_WORDS = new Set([
  // Artigos e preposições
  "de", "da", "do", "das", "dos", "com", "para", "por", "em", "e", "a", "o",
  "as", "os", "um", "uma", "uns", "umas", "ao", "aos", "na", "no", "nas", "nos",
  // Termos genéricos de produto
  "produto", "item", "material", "insumo", "kit", "conjunto", "pacote",
  // Unidades de medida (serão normalizadas separadamente)
  "ml", "mg", "mcg", "g", "kg", "l", "lt", "litro", "litros", "grama", "gramas",
  "comprimido", "comprimidos", "capsula", "capsulas", "frasco", "frascos",
  "ampola", "ampolas", "bisnaga", "bisnagas", "sache", "saches", "envelope",
  "caixa", "cx", "unidade", "unidades", "un", "und",
  // Termos de embalagem
  "embalagem", "emb", "blister", "strip", "tubo",
]);

// Mapeamento de abreviações comuns para formas canônicas
const ABBREVIATION_MAP: Record<string, string> = {
  "inj": "injetavel",
  "injet": "injetavel",
  "sol": "solucao",
  "soln": "solucao",
  "susp": "suspensao",
  "comp": "comprimido",
  "cap": "capsula",
  "cps": "capsula",
  "fr": "frasco",
  "amp": "ampola",
  "bg": "bolsa",
  "crem": "creme",
  "pom": "pomada",
  "ung": "ungüento",
  "gel": "gel",
  "lot": "locao",
  "xpe": "xarope",
  "xar": "xarope",
  "elx": "elixir",
  "col": "colirio",
  "spray": "spray",
  "aer": "aerossol",
  "neb": "nebulizacao",
  "iv": "intravenoso",
  "im": "intramuscular",
  "sc": "subcutaneo",
  "vo": "oral",
  "vet": "veterinario",
  "hum": "humano",
};

/**
 * Remove acentos e caracteres especiais de uma string.
 */
function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normaliza uma concentração para forma canônica.
 * Ex: "500 mg" → "500mg", "10%" → "10pct", "1:1000" → "1-1000"
 */
function normalizeConcentration(str: string): string {
  return str
    .replace(/(\d+)\s*(mg|mcg|g|kg|ml|l|ui|iu|%)/gi, (_, num, unit) => `${num}${unit.toLowerCase()}`)
    .replace(/(\d+)\s*:\s*(\d+)/g, "$1-$2");
}

/**
 * Normaliza o nome de um produto para uso em busca e matching.
 *
 * @param name Nome original do produto
 * @returns Nome normalizado (minúsculas, sem acentos, sem pontuação, sem stop words)
 */
export function normalizeProductName(name: string): string {
  if (!name || typeof name !== "string") return "";

  let normalized = name.toLowerCase();

  // Remove acentos
  normalized = removeAccents(normalized);

  // Normaliza concentrações antes de remover pontuação
  normalized = normalizeConcentration(normalized);

  // Remove pontuação (mantém letras, números, espaços e hífen)
  normalized = normalized.replace(/[^a-z0-9\s\-]/g, " ");

  // Expande abreviações
  normalized = normalized.split(/\s+/).map((token) => {
    return ABBREVIATION_MAP[token] ?? token;
  }).join(" ");

  // Remove stop words
  normalized = normalized.split(/\s+/).filter((token) => {
    return token.length > 1 && !STOP_WORDS.has(token);
  }).join(" ");

  // Remove espaços duplicados e trim
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Calcula a similaridade de Jaccard entre dois nomes normalizados.
 * Retorna um valor entre 0 (nenhuma similaridade) e 1 (idênticos).
 */
export function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  Array.from(setA).forEach((token) => {
    if (setB.has(token)) intersection++;
  });
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Extrai tokens de concentração de um nome normalizado.
 * Ex: "amoxicilina 500mg comprimido" → ["500mg"]
 */
export function extractConcentrationTokens(normalizedName: string): string[] {
  const matches = normalizedName.match(/\d+(?:\.\d+)?(?:mg|mcg|g|kg|ml|l|ui|iu|pct)/gi);
  return matches ? matches.map((m) => m.toLowerCase()) : [];
}

/**
 * Gera variações de busca para um nome normalizado.
 * Útil para indexação full-text.
 */
export function generateSearchVariants(normalizedName: string): string[] {
  const tokens = normalizedName.split(" ").filter(Boolean);
  const variants: string[] = [normalizedName];

  // Adiciona substrings de 2+ tokens consecutivos
  for (let i = 0; i < tokens.length - 1; i++) {
    variants.push(tokens.slice(i, i + 2).join(" "));
    if (i < tokens.length - 2) {
      variants.push(tokens.slice(i, i + 3).join(" "));
    }
  }

  return Array.from(new Set(variants));
}
