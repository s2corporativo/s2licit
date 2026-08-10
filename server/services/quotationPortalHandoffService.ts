import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { proposalItems, proposals } from "../../drizzle/schema";
import { priceQuotationItems } from "./emailQuotationResponseService";

/**
 * Fecha o ciclo entre a fila de cotações e o Agente de Propostas: transforma
 * uma cotação já precificada (itens confirmados, com custo) em uma proposta
 * (`proposals` + `proposalItems`) pronta para o robô de portal preencher —
 * reaproveitando o mecanismo já existente em `propostaAgentRouter`/
 * `executarAgenteProposta`, sem duplicar a lógica de preenchimento.
 *
 * Idempotente: uma cotação só gera UMA proposta (vínculo em
 * `proposals.emailQuotationId`); chamadas repetidas devolvem a mesma.
 */

export interface PrepareProposalResult {
  proposalId: number;
  created: boolean;
  itemCount: number;
  total: number;
}

export async function prepareProposalFromQuotation(
  quotationId: number,
): Promise<PrepareProposalResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  const [existing] = await db
    .select({ id: proposals.id, totalValue: proposals.totalValue })
    .from(proposals)
    .where(eq(proposals.emailQuotationId, quotationId))
    .limit(1);
  if (existing) {
    const items = await db
      .select({ id: proposalItems.id })
      .from(proposalItems)
      .where(eq(proposalItems.proposalId, existing.id));
    return {
      proposalId: existing.id,
      created: false,
      itemCount: items.length,
      total: Number(existing.totalValue ?? 0),
    };
  }

  const priced = await priceQuotationItems(quotationId);

  const [inserted] = await db.insert(proposals).values({
    title: priced.quotation.subject?.slice(0, 256) || `Cotação ${quotationId}`,
    orgName: priced.quotation.orgao ?? undefined,
    origem: "cotacao",
    emailQuotationId: quotationId,
    totalValue: String(priced.subtotal.toFixed(2)),
    notes: priced.quotation.subject
      ? `Gerada a partir da cotação recebida: ${priced.quotation.subject}`
      : `Gerada a partir da cotação #${quotationId}`,
  });
  const proposalId = (inserted as { insertId?: number }).insertId;
  if (!proposalId) throw new Error("Não foi possível criar a proposta a partir da cotação.");

  await db.insert(proposalItems).values(
    priced.items.map((item, index) => ({
      proposalId,
      productId: item.produtoMatchId,
      itemNumber: index + 1,
      productName: item.descricao,
      unit: item.unidade ?? "UN",
      unitPrice: String(item.custoUnitario.toFixed(2)),
      costPrice: String(item.custoUnitario.toFixed(2)),
      suggestedPrice: String(item.unitPrice.toFixed(2)),
      quantity: Math.max(1, Math.round(item.quantidade)),
      totalPrice: String(item.totalPrice.toFixed(2)),
      sortOrder: index + 1,
    })),
  );

  return {
    proposalId,
    created: true,
    itemCount: priced.items.length,
    total: priced.subtotal,
  };
}
