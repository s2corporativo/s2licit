import { and, asc, eq, inArray, or } from "drizzle-orm";
import { auditLogs, emailQuotationItems, emailQuotations } from "../../drizzle/schema";
import { getDb } from "../db";
import { calculateSalePrice } from "./pricingSafety";
import { getQuotationDecisionSummary } from "./quotationDecisionService";
import { getEmailQuotationWithItems } from "./emailQuotationSyncService";
import { getQuotationItemSalePrices } from "./quotationItemPricingService";

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type TimelineEvent = {
  key: string;
  at: Date | null;
  kind: "received" | "extracted" | "match" | "pricing" | "proposal" | "status" | "deadline" | "result" | "audit";
  title: string;
  detail: string;
  status: "done" | "current" | "future" | "warning";
};

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    AUTO_MATCH_CONFIRMED: "Match confirmado automaticamente",
    AUTO_MATCH_CORRECTED: "Match automático corrigido",
    QUOTATION_FEEDBACK: "Decisão do operador registrada",
    QUOTATION_SALE_PRICE_MANUAL: "Preço de venda ajustado",
    QUOTATION_SALE_PRICE_AUTO: "Preço de venda voltou ao automático",
    QUOTATION_PRICE_REFRESH_REQUESTED: "Atualização de preços solicitada",
    QUOTATION_BULK_ACTION: "Ação em lote executada",
  };
  return labels[action] ?? action.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export async function getQuotationTimeline(quotationId: number) {
  const db = await getDb();
  const data = await getEmailQuotationWithItems(quotationId);
  if (!data) throw new Error("Cotação não encontrada.");

  const q = data.quotation as any;
  const items = data.items as any[];
  const matched = items.filter((item) => item.produtoMatchId != null).length;
  const confirmed = items.filter((item) => item.matchConfirmado).length;
  const priced = items.filter((item) => num(item.precoSugerido ?? item.productPrice) != null).length;
  const events: TimelineEvent[] = [];

  events.push({
    key: "received",
    at: q.receivedAt ?? q.createdAt ?? null,
    kind: "received",
    title: "Cotação recebida",
    detail: `${q.orgao ?? q.fromName ?? "Origem não identificada"} · ${q.subject ?? `Cotação #${quotationId}`}`,
    status: "done",
  });
  events.push({
    key: "extracted",
    at: q.createdAt ?? q.receivedAt ?? null,
    kind: "extracted",
    title: "Itens extraídos",
    detail: `${items.length} item(ns) · origem ${q.sourceType ?? "não informada"}${q.sourceFilename ? ` · ${q.sourceFilename}` : ""}`,
    status: items.length ? "done" : "warning",
  });
  events.push({
    key: "match",
    at: items.map((item) => item.updatedAt ?? item.createdAt).filter(Boolean).sort().at(-1) ?? q.updatedAt ?? null,
    kind: "match",
    title: "Matching de produtos",
    detail: `${matched}/${items.length} com produto · ${confirmed}/${items.length} confirmados`,
    status: confirmed === items.length && items.length > 0 ? "done" : "current",
  });
  events.push({
    key: "pricing",
    at: q.updatedAt ?? null,
    kind: "pricing",
    title: "Formação de preço",
    detail: `${priced}/${items.length} item(ns) com custo disponível`,
    status: priced === items.length && items.length > 0 ? "done" : "current",
  });

  if (q.prazoResposta) {
    const deadline = new Date(q.prazoResposta);
    events.push({
      key: "deadline",
      at: deadline,
      kind: "deadline",
      title: "Prazo da cotação",
      detail: deadline.getTime() < Date.now() && q.status !== "respondida" ? "Prazo vencido sem resposta registrada" : "Prazo operacional para resposta",
      status: deadline.getTime() < Date.now() && q.status !== "respondida" ? "warning" : "future",
    });
  }

  if (q.status) {
    events.push({
      key: "status",
      at: q.updatedAt ?? null,
      kind: "status",
      title: `Status atual: ${q.status}`,
      detail: q.status === "respondida" ? "Proposta/resposta registrada como enviada" : "Situação operacional atual da cotação",
      status: q.status === "respondida" ? "done" : "current",
    });
  }

  if (q.resultado) {
    events.push({
      key: "result",
      at: q.resultadoEm ?? q.updatedAt ?? null,
      kind: "result",
      title: q.resultado === "ganhou" ? "Cotação ganha" : q.resultado === "perdeu" ? "Cotação perdida" : `Resultado: ${q.resultado}`,
      detail: q.valorVencedor ? `Valor vencedor: R$ ${Number(q.valorVencedor).toFixed(2)}` : "Resultado comercial registrado",
      status: "done",
    });
  }

  if (db) {
    const itemIds = items.map((item) => Number(item.id)).filter(Number.isFinite);
    const clauses = [and(eq(auditLogs.entity, "email_quotations"), eq(auditLogs.entityId, quotationId))];
    if (itemIds.length) clauses.push(and(eq(auditLogs.entity, "email_quotation_items"), inArray(auditLogs.entityId, itemIds)));
    const logs = await db
      .select({ id: auditLogs.id, action: auditLogs.action, summary: auditLogs.summary, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(or(...clauses))
      .orderBy(asc(auditLogs.createdAt))
      .limit(300);
    for (const log of logs) {
      events.push({
        key: `audit-${log.id}`,
        at: log.createdAt,
        kind: "audit",
        title: actionLabel(log.action),
        detail: log.summary ?? "Evento registrado na trilha de auditoria",
        status: "done",
      });
    }
  }

  const unique = new Map<string, TimelineEvent>();
  for (const event of events) unique.set(event.key, event);
  return [...unique.values()].sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return new Date(a.at).getTime() - new Date(b.at).getTime();
  });
}

type HistoricalMargin = {
  itemId: number;
  productId: number | null;
  cost: string | null;
  result: string | null;
};

export async function getSmartMarginSuggestions(quotationId: number) {
  const db = await getDb();
  const summary = await getQuotationDecisionSummary(quotationId);
  if (!db) {
    return {
      items: summary.items.map((item) => ({
        itemId: item.itemId,
        productId: item.productId,
        productName: item.productName,
        currentCost: item.cost,
        minMarginPercent: item.minMarginPercent,
        recommendedMarginPercent: item.minMarginPercent,
        recommendedSale: item.cost == null ? null : Number(calculateSalePrice({ cost: item.cost, marginPercent: item.minMarginPercent }).toFixed(2)),
        lowSale: null,
        highSale: null,
        winningSamples: 0,
        historicalSamples: 0,
        rationale: ["Sem histórico suficiente; usada a margem mínima de proteção."],
      })),
    };
  }

  const productIds = [...new Set(summary.items.map((item) => item.productId).filter((id): id is number => id != null))];
  const history: HistoricalMargin[] = productIds.length
    ? await db
        .select({
          itemId: emailQuotationItems.id,
          productId: emailQuotationItems.produtoMatchId,
          cost: emailQuotationItems.precoSugerido,
          result: emailQuotations.resultado,
        })
        .from(emailQuotationItems)
        .innerJoin(emailQuotations, eq(emailQuotationItems.quotationId, emailQuotations.id))
        .where(and(inArray(emailQuotationItems.produtoMatchId, productIds), eq(emailQuotationItems.matchConfirmado, true)))
        .limit(3000)
    : [];
  const salePrices = await getQuotationItemSalePrices(history.map((row) => row.itemId));

  const marginsByProduct = new Map<number, { all: number[]; wins: number[] }>();
  for (const row of history) {
    if (!row.productId) continue;
    const cost = num(row.cost);
    const sale = num(salePrices.get(row.itemId));
    if (cost == null || sale == null || sale <= 0 || cost < 0 || cost >= sale) continue;
    const margin = ((sale - cost) / sale) * 100;
    const bucket = marginsByProduct.get(row.productId) ?? { all: [], wins: [] };
    bucket.all.push(margin);
    if (row.result === "ganhou") bucket.wins.push(margin);
    marginsByProduct.set(row.productId, bucket);
  }

  return {
    items: summary.items.map((item) => {
      const bucket = item.productId ? marginsByProduct.get(item.productId) : undefined;
      const winningMedian = median(bucket?.wins ?? []);
      const historicalMedian = median(bucket?.all ?? []);
      const baseline = winningMedian ?? historicalMedian ?? item.minMarginPercent;
      const recommendedMargin = clamp(Math.max(item.minMarginPercent, baseline), 0, 60);
      const lowMargin = clamp(Math.max(item.minMarginPercent, recommendedMargin - 3), 0, 60);
      const highMargin = clamp(recommendedMargin + 5, 0, 65);
      const currentCost = item.cost;
      const rationale = [
        winningMedian != null ? `Mediana de margem em ${bucket?.wins.length ?? 0} vitória(s): ${winningMedian.toFixed(1)}%.` : null,
        winningMedian == null && historicalMedian != null ? `Mediana histórica do produto: ${historicalMedian.toFixed(1)}%.` : null,
        `Proteção mínima: ${item.minMarginPercent.toFixed(1)}%.`,
        item.priceFreshness === "stale" || item.priceFreshness === "unknown" ? "Custo precisa ser atualizado antes de usar a recomendação como referência final." : null,
      ].filter((value): value is string => Boolean(value));
      return {
        itemId: item.itemId,
        productId: item.productId,
        productName: item.productName,
        description: item.descricao,
        currentCost,
        currentSale: item.sale,
        currentMarginPercent: item.marginPercent,
        minMarginPercent: item.minMarginPercent,
        recommendedMarginPercent: Number(recommendedMargin.toFixed(1)),
        recommendedSale: currentCost == null ? null : Number(calculateSalePrice({ cost: currentCost, marginPercent: recommendedMargin }).toFixed(2)),
        lowSale: currentCost == null ? null : Number(calculateSalePrice({ cost: currentCost, marginPercent: lowMargin }).toFixed(2)),
        highSale: currentCost == null ? null : Number(calculateSalePrice({ cost: currentCost, marginPercent: highMargin }).toFixed(2)),
        winningSamples: bucket?.wins.length ?? 0,
        historicalSamples: bucket?.all.length ?? 0,
        priceFreshness: item.priceFreshness,
        risk: item.risk,
        rationale,
      };
    }),
  };
}
