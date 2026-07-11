/**
 * Utilitários de parsing numérico com suporte a formato brasileiro (pt-BR).
 */

/**
 * Converte um preço em string (formato pt-BR ou US) ou número para number.
 *
 * Regras:
 * - Número puro: retornado diretamente (null se não-finito).
 * - Prefixo "R$" e espaços são removidos.
 * - Se contém vírgula, ela é o separador decimal: remove todos os pontos
 *   (milhar) e troca a vírgula por ponto. Ex.: "1.234,56" → 1234.56
 * - Se contém apenas pontos: um único ponto seguido de 1-2 dígitos é
 *   interpretado como decimal ("1234.56" → 1234.56, "1.2" → 1.2);
 *   caso contrário os pontos são separadores de milhar ("1.234" → 1234,
 *   "1.234.567" → 1234567).
 * - Retorna null quando não parseável.
 */
export function parsePrecoBR(valor: string | number): number | null {
  // Número puro
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }

  if (typeof valor !== "string") return null;

  // Remove prefixo "R$", espaços e demais caracteres não numéricos
  // (mantém dígitos, pontos, vírgulas e sinal negativo)
  const limpo = valor.replace(/[^\d.,-]/g, "").trim();
  if (!limpo || !/\d/.test(limpo)) return null;

  let normalizado: string;

  if (limpo.includes(",")) {
    // Vírgula é o separador decimal: remove pontos de milhar
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (limpo.includes(".")) {
    const partes = limpo.split(".");
    const unicoPonto = partes.length === 2;
    const digitosDepois = partes[partes.length - 1].length;

    if (unicoPonto && digitosDepois >= 1 && digitosDepois <= 2) {
      // Um ponto com 1-2 dígitos depois → decimal (formato US): "1234.56"
      normalizado = limpo;
    } else {
      // Vários pontos ou grupo final com 3+ dígitos → separador de milhar: "1.234"
      normalizado = limpo.replace(/\./g, "");
    }
  } else {
    normalizado = limpo;
  }

  const num = parseFloat(normalizado);
  return Number.isFinite(num) ? num : null;
}
