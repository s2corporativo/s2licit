import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { proposalItems, proposals } from "../../drizzle/schema";
import { priceQuotationItems } from "./emailQuotationResponseService";
import { preserveProposalQuantity } from "./quotationQuantityService";

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
  const existing = await findExistingProposal(quotationId);
  if (existing) return existing;

  const priced = await priceQuotationItems(quotationId);

  try {
    return await insertProposalFromPriced(quotationId, priced);
  } catch (err) {
    // Corrida: duas requisições viram "não existe" ao mesmo tempo e as duas
    // tentam criar. O índice único em emailQuotationId rejeita a segunda —
    // ela não falha, apenas devolve a proposta que a primeira acabou de criar.
    if (isDuplicateKeyError(err)) {
      const created = await findExistingProposal(quotationId);
      if (created) return created;
    }
    throw err;
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  const code = (err as { code?: string; errno?: number })?.code;
  return code === "ER_DUP_ENTRY" || code === "ER_DUP_KEY";
}

/**
 * Busca a proposta já existente para a cotação (usada tanto no caminho
 * normal quanto na recuperação de uma corrida entre requisições simultâneas).
 */
async function findExistingProposal(quotationId: number): Promise<PrepareProposalResult | null> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const [existing] = await db
    .select({ id: proposals.id, totalValue: proposals.totalValue })
    .from(proposals)
    .where(eq(proposals.emailQuotationId, quotationId))
    .limit(1);
  if (!existing) return null;
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

async function insertProposalFromPriced(
  quotationId: number,
  priced: Awaited<ReturnType<typeof priceQuotationItems>>,
): Promise<PrepareProposalResult> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");

  // Quantidade é dado material da cotação. Este handoff preserva exatamente o
  // solicitado e nunca aplica round/ceil silencioso. Conversão para embalagem
  // comercial deve ocorrer em etapa explícita e auditável do portal.
  const normalizedItems = priced.items.map((item) => {
    const quantity = preserveProposalQuantity(item.quantidade);
    const totalPrice = Number((item.unitPrice * quantity).toFixed(2));
    return { ...item, quantity, totalPrice };
  });
  const total = Number(normalizedItems.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2));

  // Cabeçalho + itens na MESMA transação: se a inserção dos itens falhar, o
  // cabeçalho não fica órfão no banco (o índice único em emailQuotationId
  // impediria uma nova tentativa de recriar a proposta completa depois).
  const proposalId = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(proposals).values({
      title: priced.quotation.subject?.slice(0, 256) || `Cotação ${quotationId}`,
      orgName: priced.quotation.orgao ?? undefined,
      origem: "cotacao",
      emailQuotationId: quotationId,
      totalValue: String(total.toFixed(2)),
      notes: priced.quotation.subject
        ? `Gerada a partir da cotação recebida: ${priced.quotation.subject}`
        : `Gerada a partir da cotação #${quotationId}`,
    });
    const id = (inserted as { insertId?: number }).insertId;
    if (!id) throw new Error("Não foi possível criar a proposta a partir da cotação.");

    await tx.insert(proposalItems).values(
      normalizedItems.map((item, index) => ({
        proposalId: id,
        productId: item.produtoMatchId,
        itemNumber: index + 1,
        productName: item.descricao,
        unit: item.unidade ?? "UN",
        unitPrice: String(item.custoUnitario.toFixed(2)),
        costPrice: String(item.custoUnitario.toFixed(2)),
        suggestedPrice: String(item.unitPrice.toFixed(2)),
        quantity: item.quantity,
        totalPrice: String(item.totalPrice.toFixed(2)),
        sortOrder: index + 1,
        supplierId: item.supplierId,
        supplierName: item.supplierName,
      })),
    );
    return id;
  });

  return {
    proposalId,
    created: true,
    itemCount: normalizedItems.length,
    total,
  };
}
