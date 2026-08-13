/**
 * emailQuotationFilterService: seleção de quais e-mails a sincronização IMAP
 * processa como pedidos de cotação.
 *
 * Um e-mail é aceito quando ATENDE AO MENOS UM dos critérios (OR):
 *   1. Remetente (nome ou endereço) contém um dos remetentes selecionados; OU
 *   2. Assunto contém uma das palavras-chave de cotação/proposta de preço.
 *
 * Critérios vêm de process.env (aplicados do banco no boot por
 * applyEmailConfigFromDb e a cada salvamento):
 *   EMAIL_FILTER_SENDERS — remetentes (nomes/endereços), separados por ";"
 *   EMAIL_FILTER_SUBJECT_KEYWORDS — palavras-chave de assunto, separadas por ";"
 *
 * Sem critérios configurados, todos os e-mails são aceitos (comportamento
 * legado). Os padrões de assunto cobrem as expressões usuais de pedidos de
 * cotação de órgãos públicos e empresas; a lista é editável pela interface.
 */
import type { FetchedEmail } from "./emailInboxService";
import { logger } from "../_core/logger";

/** Palavras-chave padrão de assunto (pedidos de cotação / propostas). */
const DEFAULT_SUBJECT_KEYWORDS = [
  "cotação",
  "cotaçao",
  "cotacao",
  "orçamento",
  "orcamento",
  "proposta de preço",
  "proposta de preco",
  "pedido de orçamento",
  "pedido de orcamento",
  "pedido de cotação",
  "pedido de cotacao",
  "convite para cotação",
  "solicitação de orçamento",
  "solicitacao de orcamento",
];

/** Remetentes conhecidos de órgãos/empresas que enviam pedidos de cotação. */
const DEFAULT_SENDERS: string[] = [];

export function getFilterSenders(): string[] {
  const env = process.env.EMAIL_FILTER_SENDERS;
  return parseList(env) ?? DEFAULT_SENDERS;
}

export function getFilterSubjectKeywords(): string[] {
  const env = process.env.EMAIL_FILTER_SUBJECT_KEYWORDS;
  return parseList(env) ?? DEFAULT_SUBJECT_KEYWORDS;
}

/**
 * undefined/não definida = usar os padrões (null); "" ou lista válida
 * = override explícito do usuário. A env é preenchida pelo boot com o
 * valor do banco (vazio quando o usuário limpou os critérios). */
function parseList(raw: string | undefined): string[] | null {
  if (raw === undefined) return null;
  const items = raw
    .split(/[;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : [];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos para comparação
}

/**
 * Decide se o e-mail deve ser processado como pedido de cotação.
 * Sem critérios configurados (nenhuma env e nenhuma lista padrão ativa),
 * aceita todos — isso só ocorre se as constantes padrão forem esvaziadas.
 */
export function matchesQuotationFilter(email: FetchedEmail): boolean {
  const senders = getFilterSenders();
  const keywords = getFilterSubjectKeywords();

  const fromName = normalize(email.from.name ?? "");
  const fromAddress = normalize(email.from.address ?? "");
  const subject = normalize(email.subject);

  const senderMatch =
    senders.length > 0 &&
    senders.some((s) => fromName.includes(s) || fromAddress.includes(s));

  const subjectMatch =
    keywords.length > 0 && keywords.some((k) => subject.includes(k));

  if (senderMatch || subjectMatch) return true;
  // Sem critérios configurados: mantém o comportamento legado (aceita tudo).
  return senders.length === 0 && keywords.length === 0;
}

/** Registra os critérios efetivos em log (chamado a cada salvamento). */
export function logFilterCriteria(): void {
  logger.info(
    `[EmailFilter] Critérios ativos — remetentes: ${getFilterSenders().length}, palavras-chave de assunto: ${getFilterSubjectKeywords().length}`,
  );
}
