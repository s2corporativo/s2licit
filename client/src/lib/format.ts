/**
 * Formatadores pt-BR centralizados.
 * Use sempre estes helpers em vez de toFixed(2)/toLocaleString espalhados.
 */

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Formata um valor monetário em Real brasileiro (R$ 1.234,56).
 * Aceita number, string decimal vinda do banco ("1234.56"), null e undefined.
 * Valores nulos/ inválidos retornam "—".
 */
export function formatBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (typeof num !== "number" || Number.isNaN(num)) return "—";
  return brlFormatter.format(num);
}

/**
 * Formata uma data no padrão brasileiro (dd/mm/aaaa).
 * Aceita Date, string ISO, timestamp numérico, null e undefined.
 * Valores nulos/inválidos retornam "—".
 */
export function formatDateBR(d: Date | string | number | null | undefined): string {
  if (d === null || d === undefined || d === "") return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}
