/**
 * Helpers puros (sem dependência de banco) usados pela camada de dados.
 * Extraídos de db.ts para reduzir o arquivo e permitir reutilização.
 */
import { levenshteinSimilarity } from "../matching/productMatcher";

/** Escapa caracteres especiais de LIKE (%, _, \). */
export function escapeLike(term: string): string {
  return term.replace(/[%_\\]/g, "\\$&");
}

/** Traduz mensagens de erro do MySQL para texto amigável. */
export function simplifyDbError(msg: string): string {
  if (msg.includes("Data too long")) {
    const match = msg.match(/column '(\w+)'/i);
    return match ? `Valor muito longo para o campo "${match[1]}"` : "Valor muito longo para um dos campos";
  }
  if (msg.includes("Incorrect decimal value") || msg.includes("Out of range")) {
    return "Valor numérico inválido no campo de preço";
  }
  if (msg.includes("Cannot add or update a child row") || msg.includes("foreign key")) {
    return "Referência inválida: fornecedor ou categoria não encontrada";
  }
  if (msg.includes("Duplicate entry")) {
    return "Produto duplicado (já existe com o mesmo código)";
  }
  return msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
}

// Normalização canônica: Fonte Única em shared/normalize (6ª implementação
// divergente consolidada — a comparação é simétrica, então minúsculas do
// engine canônico produzem o mesmo resultado booleano/numérico das
// implementações históricas em maiúsculas/minúsculas).
import { normalizeText } from "../../shared/normalize";

/** Normaliza para comparação: minúsculas, sem acento, espaços colapsados. */
export function normalize(s: string | null | undefined): string {
  return normalizeText(s);
}

/** Verifica se dois valores normalizados são iguais e não-vazios. */
export function matches(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return na.length > 0 && nb.length > 0 && na === nb;
}

/** Normaliza nome para similaridade: minúsculas, sem acento, só alfanumérico. */
export function normalizeName(s: string): string {
  return normalizeText(s);
}

/**
 * Similaridade 0-1 entre dois nomes normalizados (Levenshtein).
 * Delega para matching/productMatcher.ts#levenshteinSimilarity — este
 * arquivo tinha sua própria cópia do mesmo algoritmo (mais uma entre as
 * várias implementações divergentes de fuzzy matching encontradas no
 * sistema). Fórmula idêntica (1 - distância/tamanho), verificado sem
 * mudança de comportamento para os mesmos argumentos.
 */
export const similarity = levenshteinSimilarity;
