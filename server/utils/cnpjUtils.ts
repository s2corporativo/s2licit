/**
 * cnpjUtils.ts
 * Validação determinística de dígitos verificadores de CNPJ (algoritmo
 * oficial da Receita Federal — mod 11). Não consulta APIs externas e não
 * consome créditos de IA.
 *
 * Fonte do algoritmo: documentação pública de validação de CNPJ
 * (https://www.gov.br/receitafederal — validação do campo CNPJ).
 */
const PESOS_PRIMEIRO = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_SEGUNDO = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function digitoVerificador(base: number[], pesos: number[]): number {
  const soma = base.reduce((acc, v, i) => acc + v * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Valida os dígitos verificadores de um CNPJ de 14 dígitos (sem máscara).
 * Rejeita CNPJs conhecidos inválidos (todos os dígitos iguais).
 */
export function validateCnpjDigits(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const base = digits.slice(0, 12).split("").map(Number);
  const d1 = digitoVerificador(base, PESOS_PRIMEIRO);
  if (d1 !== Number(digits[12])) return false;
  const base2 = [...base, d1];
  const d2 = digitoVerificador(base2, PESOS_SEGUNDO);
  return d2 === Number(digits[13]);
}

/** Formata um CNPJ de 14 dígitos em XX.XXX.XXX/XXXX-XX. */
export function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "").slice(0, 14);
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
