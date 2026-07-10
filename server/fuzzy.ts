/**
 * Módulo de similaridade de strings para reconhecimento fuzzy de produtos.
 * Implementa Jaro-Winkler distance, normalização e matching inteligente.
 */

/**
 * Normaliza string para comparação: maiúsculas, sem acentos, sem espaços extras.
 */
export function normalizeStr(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calcula a distância de Jaro entre duas strings.
 * Retorna valor entre 0 (completamente diferentes) e 1 (idênticas).
 */
export function jaroDistance(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  if (matchWindow < 0) return 0;

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
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
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
  );
}

/**
 * Calcula a similaridade de Jaro-Winkler entre duas strings.
 * Dá peso extra a prefixos comuns (até 4 caracteres).
 * Retorna valor entre 0 e 1.
 */
export function jaroWinkler(s1: string, s2: string, prefixScale = 0.1): number {
  const jaro = jaroDistance(s1, s2);
  if (jaro < 0.7) return jaro; // Não aplica bônus de prefixo se Jaro < 0.7

  let prefixLen = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  while (prefixLen < maxPrefix && s1[prefixLen] === s2[prefixLen]) {
    prefixLen++;
  }

  return jaro + prefixLen * prefixScale * (1 - jaro);
}

/**
 * Calcula a similaridade entre duas strings normalizadas.
 * Retorna valor entre 0 e 1.
 */
export function stringSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return jaroWinkler(na, nb);
}

/**
 * Verifica se dois valores não-vazios são iguais após normalização.
 */
export function exactMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  return na.length > 0 && nb.length > 0 && na === nb;
}

export type FuzzyMatchResult = {
  matched: boolean;
  similarity: number;
  matchedBy: "exact_ean" | "exact_mapa" | "fuzzy_name_ean" | "fuzzy_name_mapa" | "exact_name" | "fuzzy_name_concentration" | "fuzzy_name_presentation" | null;
};

/**
 * Verifica se dois produtos são o mesmo produto usando lógica combinada:
 * - Nome com similaridade >85% E (EAN ou MAPA coincidente) → match forte
 * - Nome exato E (concentração ou apresentação coincidente) → match técnico
 * - Nome exato sozinho → match fraco (apenas se não há características)
 */
export function isSameProduct(
  input: {
    name: string;
    ean?: string | null;
    codigoMapa?: string | null;
    concentration?: string | null;
    presentation?: string | null;
  },
  candidate: {
    name: string;
    ean?: string | null;
    codigoMapa?: string | null;
    concentration?: string | null;
    presentation?: string | null;
  }
): FuzzyMatchResult {
  const nameSim = stringSimilarity(input.name, candidate.name);

  // EAN exato (prioridade máxima)
  if (input.ean && candidate.ean && exactMatch(input.ean, candidate.ean)) {
    return { matched: true, similarity: 1, matchedBy: "exact_ean" };
  }

  // MAPA exato
  if (input.codigoMapa && candidate.codigoMapa && exactMatch(input.codigoMapa, candidate.codigoMapa)) {
    return { matched: true, similarity: 1, matchedBy: "exact_mapa" };
  }

  // Nome fuzzy >85% + EAN coincidente
  if (nameSim >= 0.85 && input.ean && candidate.ean && exactMatch(input.ean, candidate.ean)) {
    return { matched: true, similarity: nameSim, matchedBy: "fuzzy_name_ean" };
  }

  // Nome fuzzy >85% + MAPA coincidente
  if (nameSim >= 0.85 && input.codigoMapa && candidate.codigoMapa && exactMatch(input.codigoMapa, candidate.codigoMapa)) {
    return { matched: true, similarity: nameSim, matchedBy: "fuzzy_name_mapa" };
  }

  // Nome exato + concentração coincidente
  if (nameSim >= 0.95 && input.concentration && candidate.concentration && exactMatch(input.concentration, candidate.concentration)) {
    return { matched: true, similarity: nameSim, matchedBy: "fuzzy_name_concentration" };
  }

  // Nome exato + apresentação coincidente
  if (nameSim >= 0.95 && input.presentation && candidate.presentation && exactMatch(input.presentation, candidate.presentation)) {
    return { matched: true, similarity: nameSim, matchedBy: "fuzzy_name_presentation" };
  }

  // Nome exato sozinho (sem características para comparar)
  if (nameSim >= 0.98 && !input.ean && !input.codigoMapa && !input.concentration && !input.presentation) {
    return { matched: true, similarity: nameSim, matchedBy: "exact_name" };
  }

  return { matched: false, similarity: nameSim, matchedBy: null };
}
