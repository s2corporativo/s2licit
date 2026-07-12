/**
 * extenso.ts — converte um valor monetário (R$) para texto por extenso em
 * português, no padrão exigido por editais (ex.: "mil duzentos e trinta e
 * quatro reais e cinquenta centavos"). Função pura e testável.
 */

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** Converte um inteiro de 0 a 999 em palavras. */
function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 10) partes.push(UNIDADES[resto]);
    else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

/** Converte um inteiro (>= 0) em palavras (até bilhões). */
export function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const escalas: Array<[number, string, string]> = [
    [1_000_000_000, "bilhão", "bilhões"],
    [1_000_000, "milhão", "milhões"],
    [1_000, "mil", "mil"],
  ];
  const segs: string[] = [];
  let resto = Math.floor(n);
  for (const [valor, sing, plur] of escalas) {
    const q = Math.floor(resto / valor);
    if (q > 0) {
      const nome = q === 1 ? sing : plur;
      // "mil" não leva "um" na frente (mil, não "um mil").
      const prefixo = valor === 1_000 && q === 1 ? "" : `${ate999(q)} `;
      segs.push(`${prefixo}${nome}`.trim());
      resto = resto % valor;
    }
  }
  const finalStr = resto > 0 ? ate999(resto) : "";
  if (segs.length === 0) return finalStr;
  if (!finalStr) return segs.join(" ");
  // "e" antes do último grupo só quando ele é < 100 ou centena redonda
  // (ex.: "mil e quinhentos", mas "mil duzentos e trinta e quatro").
  const conector = resto < 100 || resto % 100 === 0 ? " e " : " ";
  return segs.join(" ") + conector + finalStr;
}

/**
 * Valor monetário por extenso. Ex.: 1234.5 → "mil duzentos e trinta e quatro
 * reais e cinquenta centavos".
 */
export function valorPorExtenso(valor: number): string {
  if (!isFinite(valor)) return "";
  const negativo = valor < 0;
  const abs = Math.abs(valor);
  const reais = Math.floor(abs);
  const centavos = Math.round((abs - reais) * 100);

  const partes: string[] = [];
  if (reais > 0) {
    partes.push(`${inteiroPorExtenso(reais)} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) {
    partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  }
  if (partes.length === 0) return "zero real";
  const texto = partes.join(" e ");
  return negativo ? `menos ${texto}` : texto;
}
