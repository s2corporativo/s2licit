/**
 * Helpers puros (sem dependência de banco) usados pela camada de dados.
 * Extraídos de db.ts para reduzir o arquivo e permitir reutilização.
 */

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

/** Normaliza para comparação: maiúsculas, sem acento, espaços colapsados. */
export function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Verifica se dois valores normalizados são iguais e não-vazios. */
export function matches(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return na.length > 0 && nb.length > 0 && na === nb;
}

/** Normaliza nome para similaridade: minúsculas, sem acento, só alfanumérico. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distância de Levenshtein entre duas strings. */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Similaridade 0-1 entre dois nomes normalizados. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}
