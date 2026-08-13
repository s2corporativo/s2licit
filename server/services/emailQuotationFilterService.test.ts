import { describe, expect, it, beforeEach } from "vitest";
import { matchesQuotationFilter } from "./emailQuotationFilterService";
import type { FetchedEmail } from "./emailInboxService";

function email(opts: Partial<FetchedEmail>): FetchedEmail {
  return {
    messageId: "msg-1",
    from: { address: undefined, name: undefined },
    subject: "(sem assunto)",
    date: null,
    text: "",
    attachments: [],
    ...opts,
  };
}

beforeEach(() => {
  delete process.env.EMAIL_FILTER_SENDERS;
  delete process.env.EMAIL_FILTER_SUBJECT_KEYWORDS;
});

describe("matchesQuotationFilter", () => {
  it("aceita assunto com palavras-chave padrão", () => {
    expect(matchesQuotationFilter(email({ subject: "Cotação de Preços - Material Veterinário" }))).toBe(true);
    expect(matchesQuotationFilter(email({ subject: "Pedido de Orçamento - Medicamentos" }))).toBe(true);
    expect(matchesQuotationFilter(email({ subject: "Proposta de preço - Insumos" }))).toBe(true);
    expect(matchesQuotationFilter(email({ subject: "Solicitação de orçamento" }))).toBe(true);
  });

  it("aceita palavras-chave com e sem acentos e maiúsculas", () => {
    expect(matchesQuotationFilter(email({ subject: "COTACAO PARA FORNECEDORES" }))).toBe(true);
    expect(matchesQuotationFilter(email({ subject: "orcamento de medicamentos" }))).toBe(true);
  });

  it("rejeita assunto sem relação com cotação", () => {
    expect(matchesQuotationFilter(email({ subject: "Relatório mensal de vendas" }))).toBe(false);
    expect(matchesQuotationFilter(email({ subject: "Reunião agendada para amanhã" }))).toBe(false);
    expect(matchesQuotationFilter(email({ subject: "(sem assunto)" }))).toBe(false);
  });

  it("aceita remetente selecionado mesmo sem keyword no assunto", () => {
    process.env.EMAIL_FILTER_SENDERS = "Funarbe; Comdec; compras@mg.gov.br";
    expect(matchesQuotationFilter(email({ subject: "Assunto genérico", from: { name: "Funarbe" } }))).toBe(true);
    expect(matchesQuotationFilter(email({ subject: "Qualquer coisa", from: { address: "alguem@comdec.org" } }))).toBe(true);
    expect(matchesQuotationFilter(email({ subject: "Mensagem", from: { address: "compras@mg.gov.br" } }))).toBe(true);
    expect(matchesQuotationFilter(email({ subject: "Mensagem", from: { name: "Outro Fornecedor" } }))).toBe(false);
  });

  it("env vazia é override explícito: sem remetentes e sem keywords, aceita tudo (legado)", () => {
    process.env.EMAIL_FILTER_SENDERS = "";
    process.env.EMAIL_FILTER_SUBJECT_KEYWORDS = "";
    expect(matchesQuotationFilter(email({ subject: "Qualquer assunto" }))).toBe(true);
    expect(matchesQuotationFilter(email({ subject: "Relatório mensal" }))).toBe(true);
  });

  it("remetente selecionado com assunto sem keyword é aceito; remetente não selecionado não", () => {
    process.env.EMAIL_FILTER_SENDERS = "Funarbe";
    process.env.EMAIL_FILTER_SUBJECT_KEYWORDS = "";
    expect(matchesQuotationFilter(email({ subject: "Assunto genérico", from: { name: "Funarbe" } }))).toBe(true);
    expect(matchesQuotationFilter(email({ subject: "Assunto genérico", from: { name: "Outro Fornecedor" } }))).toBe(false);
  });
});
