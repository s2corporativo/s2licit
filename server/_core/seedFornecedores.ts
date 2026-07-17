import { getDb } from "../db";
import { suppliers } from "../../drizzle/schema";

/**
 * Fornecedores com scraper pronto em FORNECEDOR_CONFIGS (scraperEngine.ts),
 * semeados no boot para já aparecerem na tela "Agente de preços" sem cadastro
 * manual. Importante: o nome NORMALIZADO (sem acentos, sem espaços) bate com a
 * chave do preset — ex.: "Basso Pancotte" → "bassopancotte", "Magazine Médica"
 * → "magazinemedica" — o que permite ao modal sugerir o tipo automaticamente.
 *
 * As credenciais (login/senha) NÃO são semeadas: elas vão no cofre criptografado
 * (AES-256), preenchidas pelo administrador na própria tela. Aqui só criamos o
 * cadastro-base do fornecedor.
 */
export const FORNECEDORES_INICIAIS = [
  "Tambasa",
  "Bartofil",
  "Basso Pancotte",
  "Magazine Médica",
  "Utilidades Clínicas",
] as const;

/**
 * Dado os nomes de fornecedores já existentes, retorna quais dos iniciais ainda
 * faltam (comparação case-insensitive, aparando espaços). Pura e testável.
 */
export function fornecedoresFaltantes(existentes: string[]): string[] {
  const have = new Set(existentes.map((n) => (n ?? "").trim().toLowerCase()));
  return FORNECEDORES_INICIAIS.filter((n) => !have.has(n.toLowerCase()));
}

/**
 * Garante que os fornecedores iniciais existam na tabela `suppliers`.
 * Idempotente: só insere os que faltam. Defensivo — qualquer falha é logada e
 * não derruba o boot (o cadastro pode ser feito manualmente pela UI).
 */
export async function ensureFornecedoresIniciais(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const existentes = await db.select({ name: suppliers.name }).from(suppliers);
    const faltantes = fornecedoresFaltantes(existentes.map((s) => s.name));
    if (faltantes.length === 0) return;
    await db.insert(suppliers).values(faltantes.map((name) => ({ name })));
    console.log(`[Seed] Fornecedores iniciais cadastrados: ${faltantes.join(", ")}.`);
  } catch (err) {
    console.error("[Seed] Falha ao semear fornecedores iniciais:", err);
  }
}
