import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  funilEventos,
  funilOportunidades,
  products,
  proposalItems,
  proposalTemplates,
  proposals,
  requestingOrgs,
  suppliers,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { editalProposalKeys } from "../db/editalProposalKeys";
import { calculateSalePrice } from "./pricingSafety";
import { transitionOpportunityInTransaction } from "./opportunityStateService";

export type ReviewedEditalProcess = {
  numero: string;
  modalidade: string;
  orgao: string;
  objeto: string;
};

export type ReviewedEditalItem = {
  itemNumero: number;
  itemDescricao: string;
  itemUnidade: string;
  itemQuantidade: number;
  productId: number | null;
  productName: string | null;
  productPrice: string | null;
  productSupplier: string | null;
  productConcentration: string | null;
  productPresentation: string | null;
  itemPrecoUnitario?: number | null;
  itemPrecoTotal?: number | null;
};

export type CreateProposalFromEditalInput = {
  processo: ReviewedEditalProcess;
  marginPercent: number;
  templateId?: number;
  itens: ReviewedEditalItem[];
  actor: string;
};

export type CreateProposalFromEditalResult = {
  proposalId: number;
  addedCount: number;
  opportunityId: number;
  reusedOpportunity: boolean;
  reusedProposal: boolean;
};

type ProductSnapshot = {
  id: number;
  name: string;
  isActive: "yes" | "no";
  price: string | null;
  activeIngredient: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  unit: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  mapa: string | null;
  supplierName: string | null;
};

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function insertId(result: unknown): number {
  if (Array.isArray(result)) {
    const first = result[0];
    if (first && typeof first === "object" && "insertId" in first) {
      return Number((first as { insertId?: number }).insertId ?? 0);
    }
  }
  return 0;
}

function normalizeRequired(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${field} não informado.` });
  }
  return normalized.slice(0, max);
}

function roundMoney(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

export function editalProposalDedupeKey(processNumber: string, orgName: string): string {
  return createHash("sha256")
    .update(`${processNumber.trim().toLocaleLowerCase("pt-BR")}||${orgName.trim().toLocaleLowerCase("pt-BR")}`)
    .digest("hex");
}

function validateItemInput(item: ReviewedEditalItem): void {
  if (!Number.isInteger(item.itemNumero) || item.itemNumero <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Número de item inválido." });
  }
  if (!item.productId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Item ${item.itemNumero}: produto não confirmado.`,
    });
  }
  if (!Number.isFinite(item.itemQuantidade) || item.itemQuantidade <= 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Item ${item.itemNumero}: quantidade inválida.`,
    });
  }
}

async function loadCanonicalProducts(productIds: number[]): Promise<Map<number, ProductSnapshot>> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      isActive: products.isActive,
      price: products.price,
      activeIngredient: products.activeIngredient,
      manufacturer: products.manufacturer,
      concentration: products.concentration,
      presentation: products.presentation,
      unit: products.unit,
      imageUrl: products.imageUrl,
      productUrl: products.productUrl,
      mapa: products.mapa,
      supplierName: suppliers.name,
    })
    .from(products)
    .leftJoin(suppliers, eq(products.supplierId, suppliers.id))
    .where(inArray(products.id, uniqueIds));

  return new Map(rows.map((row) => [row.id, row]));
}

async function resolveOrCreateRequestingOrg(
  tx: Transaction,
  orgName: string,
): Promise<number> {
  const [existing] = await tx
    .select({ id: requestingOrgs.id })
    .from(requestingOrgs)
    .where(eq(requestingOrgs.name, orgName))
    .limit(1);
  if (existing) return existing.id;

  const result = await tx.insert(requestingOrgs).values({ name: orgName });
  const id = insertId(result);
  if (!id) throw new Error("Falha ao cadastrar órgão requisitante.");
  return id;
}

async function resolveOpportunity(
  tx: Transaction,
  processo: ReviewedEditalProcess,
  actor: string,
): Promise<{ id: number; etapa: typeof funilOportunidades.$inferSelect["etapa"]; reused: boolean }> {
  const processNumber = processo.numero.trim();
  const orgName = processo.orgao.trim().slice(0, 256);

  if (processNumber && orgName) {
    const matches = await tx
      .select({ id: funilOportunidades.id, etapa: funilOportunidades.etapa })
      .from(funilOportunidades)
      .where(
        and(
          eq(funilOportunidades.numeroProcesso, processNumber),
          eq(funilOportunidades.orgao, orgName),
        ),
      )
      .limit(2);
    if (matches.length > 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Há mais de uma oportunidade para o mesmo processo/órgão. Resolva a duplicidade antes de criar a proposta.",
      });
    }
    if (matches.length === 1) return { ...matches[0], reused: true };
  }

  const result = await tx.insert(funilOportunidades).values({
    titulo: `${processo.modalidade} — ${processo.numero}`.slice(0, 512),
    orgao: orgName || null,
    modalidade: processo.modalidade.trim().slice(0, 128) || null,
    numeroProcesso: processNumber || null,
    objeto: processo.objeto.trim() || null,
    origemTipo: "edital",
    etapa: "precificacao",
    responsavel: actor.slice(0, 128),
  });
  const id = insertId(result);
  if (!id) throw new Error("Falha ao criar oportunidade para o edital.");

  await tx.insert(funilEventos).values([
    {
      oportunidadeId: id,
      deEtapa: null,
      paraEtapa: "triagem",
      justificativa: "Criada a partir de edital revisado",
      usuario: actor,
    },
    {
      oportunidadeId: id,
      deEtapa: "triagem",
      paraEtapa: "analise",
      justificativa: "[DECISAO:GO] Edital, matches, quantidades e custos revisados pelo operador",
      usuario: actor,
    },
    {
      oportunidadeId: id,
      deEtapa: "analise",
      paraEtapa: "precificacao",
      justificativa: "Itens e custos revisados para proposta",
      usuario: actor,
    },
  ]);
  return { id, etapa: "precificacao", reused: false };
}

async function normalizeExistingOpportunityForProposal(
  tx: Transaction,
  opportunity: { id: number; etapa: typeof funilOportunidades.$inferSelect["etapa"] },
  actor: string,
): Promise<"precificacao"> {
  if (opportunity.etapa === "nova" || opportunity.etapa === "triagem") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "A oportunidade ainda exige decisão GO/NO-GO antes da proposta.",
    });
  }
  if (["proposta", "enviada", "disputa", "habilitacao", "vencida", "contrato", "entrega", "faturamento", "recebimento", "encerrada"].includes(opportunity.etapa)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `A oportunidade já está em ${opportunity.etapa}; não é seguro criar uma nova proposta automaticamente.`,
    });
  }
  if (opportunity.etapa === "perdida" || opportunity.etapa === "cancelada") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `A oportunidade está ${opportunity.etapa}.`,
    });
  }
  if (opportunity.etapa === "precificacao") return "precificacao";

  const changed = await transitionOpportunityInTransaction(tx, {
    opportunityId: opportunity.id,
    from: opportunity.etapa,
    to: "precificacao",
    reason: "Edital e custos revisados para criação da proposta",
    actor,
  });
  if (!changed) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A oportunidade foi alterada concorrentemente durante a revisão.",
    });
  }
  return "precificacao";
}

async function reserveEditalProposalKey(
  tx: Transaction,
  dedupeKey: string,
): Promise<number | null> {
  // ON DUPLICATE KEY UPDATE adquire o lock da chave já existente. Se outra
  // transação estiver criando a proposta, esta instrução espera o commit dela;
  // o SELECT seguinte então enxerga o proposalId concluído.
  await tx.execute(sql`
    INSERT INTO edital_proposal_keys (dedupeKey)
    VALUES (${dedupeKey})
    ON DUPLICATE KEY UPDATE dedupeKey = VALUES(dedupeKey)
  `);
  const [reservation] = await tx
    .select({ proposalId: editalProposalKeys.proposalId })
    .from(editalProposalKeys)
    .where(eq(editalProposalKeys.dedupeKey, dedupeKey))
    .limit(1);
  if (!reservation) throw new Error("Falha ao reservar chave de idempotência do edital.");
  return reservation.proposalId ?? null;
}

async function completeEditalProposalKey(
  tx: Transaction,
  dedupeKey: string,
  proposalId: number,
): Promise<void> {
  await tx
    .update(editalProposalKeys)
    .set({ proposalId, completedAt: new Date() })
    .where(eq(editalProposalKeys.dedupeKey, dedupeKey));
}

export async function createProposalFromReviewedEdital(
  input: CreateProposalFromEditalInput,
): Promise<CreateProposalFromEditalResult> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  if (input.itens.length === 0 || input.itens.length > 1000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Quantidade de itens fora do limite permitido." });
  }
  input.itens.forEach(validateItemInput);

  const productMap = await loadCanonicalProducts(input.itens.map((item) => item.productId!));
  const errors: string[] = [];
  const normalizedItems = input.itens.map((item) => {
    const product = productMap.get(item.productId!);
    if (!product) {
      errors.push(`item ${item.itemNumero}: produto não encontrado`);
      return null;
    }
    const cost = Number(product.price);
    if (product.isActive !== "yes") errors.push(`item ${item.itemNumero}: produto inativo`);
    if (!Number.isFinite(cost) || cost <= 0) errors.push(`item ${item.itemNumero}: custo inválido`);
    if (errors.length > 20) return null;

    const salePrice = calculateSalePrice({ cost, marginPercent: input.marginPercent });
    return {
      source: item,
      product,
      cost,
      salePrice,
      totalSale: salePrice * item.itemQuantidade,
    };
  });
  if (errors.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Proposta bloqueada: ${errors.slice(0, 10).join("; ")}${errors.length > 10 ? ` (+${errors.length - 10})` : ""}`,
    });
  }

  const canonicalItems = normalizedItems.filter((item): item is NonNullable<typeof item> => item != null);
  const processNumber = normalizeRequired(input.processo.numero, "Número do processo", 128);
  const orgName = normalizeRequired(input.processo.orgao, "Órgão", 256);
  const modality = normalizeRequired(input.processo.modalidade, "Modalidade", 128);
  const title = `${modality} — ${processNumber}`.slice(0, 256);
  const totalValue = canonicalItems.reduce((sum, item) => sum + item.totalSale, 0);
  const dedupeKey = editalProposalDedupeKey(processNumber, orgName);

  let template: typeof proposalTemplates.$inferSelect | null = null;
  if (input.templateId) {
    const [found] = await db
      .select()
      .from(proposalTemplates)
      .where(eq(proposalTemplates.id, input.templateId))
      .limit(1);
    if (!found) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Template de proposta não encontrado." });
    }
    template = found;
  }

  return db.transaction(async (tx) => {
    const reservedProposalId = await reserveEditalProposalKey(tx, dedupeKey);
    if (reservedProposalId) {
      const opportunity = await resolveOpportunity(tx, input.processo, input.actor);
      return {
        proposalId: reservedProposalId,
        addedCount: 0,
        opportunityId: opportunity.id,
        reusedOpportunity: true,
        reusedProposal: true,
      };
    }

    const existingProposals = await tx
      .select({ id: proposals.id })
      .from(proposals)
      .where(and(eq(proposals.processNumber, processNumber), eq(proposals.orgName, orgName)))
      .limit(2);
    if (existingProposals.length > 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Há propostas duplicadas para este processo/órgão. Resolva a duplicidade antes de continuar.",
      });
    }

    const opportunity = await resolveOpportunity(tx, input.processo, input.actor);
    if (existingProposals.length === 1) {
      await completeEditalProposalKey(tx, dedupeKey, existingProposals[0].id);
      return {
        proposalId: existingProposals[0].id,
        addedCount: 0,
        opportunityId: opportunity.id,
        reusedOpportunity: opportunity.reused,
        reusedProposal: true,
      };
    }

    if (opportunity.reused) {
      await normalizeExistingOpportunityForProposal(tx, opportunity, input.actor);
    }

    const orgId = await resolveOrCreateRequestingOrg(tx, orgName);
    const result = await tx.insert(proposals).values({
      processNumber,
      orgId,
      orgName,
      title,
      notes: input.processo.objeto.trim() || null,
      status: "draft",
      origem: "edital",
      validityDays: template?.validityDays ?? 30,
      paymentTerms: template?.paymentTerms ?? null,
      deliveryTerms: template?.deliveryDays != null ? `${template.deliveryDays} dias` : null,
      totalValue: roundMoney(totalValue),
    });
    const proposalId = insertId(result);
    if (!proposalId) throw new Error("Falha ao criar proposta.");

    await tx.insert(proposalItems).values(
      canonicalItems.map(({ source, product, cost, salePrice }, index) => ({
        proposalId,
        productId: product.id,
        itemNumber: index + 1,
        sortOrder: index + 1,
        productName: product.name,
        activeIngredient: product.activeIngredient,
        manufacturer: product.manufacturer,
        concentration: product.concentration,
        presentation: product.presentation,
        unit: product.unit ?? source.itemUnidade,
        supplierName: product.supplierName,
        unitPrice: roundMoney(cost),
        costPrice: roundMoney(cost),
        editalRefPrice:
          source.itemPrecoUnitario != null ? roundMoney(source.itemPrecoUnitario) : null,
        suggestedPrice: roundMoney(salePrice),
        quantity: Math.trunc(source.itemQuantidade),
        totalPrice: roundMoney(salePrice * source.itemQuantidade),
        notes: `Item ${source.itemNumero}: ${source.itemDescricao}`.slice(0, 4000),
        registroMapa: product.mapa,
        imageUrl: product.imageUrl,
        productUrl: product.productUrl,
      })),
    );

    const changed = await transitionOpportunityInTransaction(tx, {
      opportunityId: opportunity.id,
      from: "precificacao",
      to: "proposta",
      reason: `Proposta #${proposalId} criada a partir do edital revisado`,
      actor: input.actor,
    });
    if (!changed) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A oportunidade foi alterada concorrentemente durante a criação da proposta.",
      });
    }

    await completeEditalProposalKey(tx, dedupeKey, proposalId);

    return {
      proposalId,
      addedCount: canonicalItems.length,
      opportunityId: opportunity.id,
      reusedOpportunity: opportunity.reused,
      reusedProposal: false,
    };
  });
}
