/**
 * Normalização de células de planilha para texto.
 *
 * Planilhas entregam valores tipados: uma coluna de preço volta como número,
 * uma data como Date e um EAN como número inteiro. Os fluxos de importação
 * tratam todas as colunas como texto, então a conversão é feita num único
 * lugar — usado tanto na leitura no cliente quanto na validação no servidor.
 *
 * Números fracionários viram vírgula decimal (pt-BR) porque `parsePrecoBR`
 * interpreta "1234.567" como separador de milhar (1234567), enquanto
 * "1234,567" é lido corretamente como 1234.567.
 */
export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    if (Number.isInteger(value)) return String(value);
    const texto = String(value);
    // Notação científica ("1e-7") não sobrevive ao parse de preço.
    const decimal = /e/i.test(texto)
      ? value.toFixed(10).replace(/0+$/, "").replace(/\.$/, "")
      : texto;
    return decimal.replace(".", ",");
  }

  if (typeof value === "boolean") return value ? "true" : "false";

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    // Datas de planilha chegam em UTC; formatar no fuso local deslocaria o dia.
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(value);
  }

  return String(value);
}
