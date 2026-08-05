/**
 * Utilitários de formatação com suporte a formato brasileiro (pt-BR).
 */

/**
 * Formata data para o padrão brasileiro (DD/MM/YYYY).
 */
export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formata número como moeda brasileira (R$ 1.234,56).
 * Retorna "—" para valores nulos ou inválidos.
 */
export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : parseFloat(value as string);
  if (isNaN(n)) return String(value);
  return `R$ ${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
