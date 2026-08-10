import { and, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import {
  certidoes,
  contractAlerts,
  deliveries,
  emailQuotations,
  funilEventos,
  funilOportunidades,
  payables,
  postAwardContracts,
  proposals,
  purchaseOrders,
  salesInvoices,
  type EtapaFunil,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { logger } from "../_core/logger";

export const MACRO_ETAPAS = ["entrada", "analise", "proposta", "execucao", "concluida"] as const;
export type MacroEtapa = (typeof MACRO_ETAPAS)[number];

const FINAL_STAGES = new Set<EtapaFunil>(["perdida", "cancelada", "encerrada"]);
const STAGE_RANK: Record<EtapaFunil, number> = {
  nova: 0,
  triagem: 1,
  analise: 2,
  cotacao: 3,
  precificacao: 4,
  proposta: 5,
  enviada: 6,
  disputa: 7,
  habilitacao: 8,
  vencida: 9,
  contrato: 10,
  entrega: 11,
  faturamento: 12,
  recebimento: 13,
  encerrada: 14,
  perdida: 14,
  cancelada: 14,
};

export function macroEtapa(etapa: EtapaFunil): MacroEtapa {
  if (["nova", "triagem"].includes(etapa)) return "entrada";
  if (["analise", "cotacao", "precificacao"].includes(etapa)) return "analise";
  if (["proposta", "enviada", "disputa", "habilitacao"].includes(etapa)) return "proposta";
  if (["vencida", "contrato", "entrega", "faturamento", "recebimento"].includes(etapa)) return "execucao";
  return "concluida";
}

export function nextActionForStage(etapa: EtapaFunil): { code: string; label: string } | null {
  switch (etapa) {
    case "nova":
    case "triagem":
      return { code: "decidir", label: "Decidir GO / NO-GO" };
    case "analise":
      return { code: "analisar", label: "Analisar documentos e exigências" };
    case "cotacao":
      return { code: "cotacao", label: "Conferir custos e equivalências" };
    case "precificacao":
      return { code: "precificar", label: "Validar preço e margem" };
    case "proposta":
      return { code: "proposta", label: "Concluir proposta" };
    case "enviada":
      return { code: "sessao", label: "Acompanhar sessão / resultado" };
    case "disputa":
      return { code: "resultado", label: "Registrar resultado" };
    case "habilitacao":
      return { code: "habilitacao", label: "Concluir habilitação" };
    case "vencida":
      return { code: "contrato", label: "Registrar contrato / empenho" };
    case "contrato":
      return { code: "pedido", label: "Preparar compra e execução" };
    case "entrega":
      return { code: "entrega", label: "Acompanhar entrega" };
    case "faturamento":
      return { code: "faturamento", label: "Emitir ou acompanhar faturamento" };
    case "recebimento":
      return { code: "recebimento", label: "Confirmar recebimento e encerrar" };
    default:
      return null;
  }
}

async function advanceIfLater(
  opportunityId: number,
  current: EtapaFunil,
  target: EtapaFunil,
  reason: string,
): Promise<EtapaFunil> {
  if (FINAL_STAGES.has(current) || STAGE_RANK[target] <= STAGE_RANK[current]) return current;
  const db = await getDb();
  if (!db) return current;
  await db.update(funilOportunidades).set({ etapa: target }).where(eq(funilOportunidades.id, opportunityId));
  await db.insert(funilEventos).values({
    oportunidadeId: opportunityId,
    deEtapa: current,
    paraEtapa: target,
    justificativa: reason,
    usuario: "orquestrador",
  });
  return target;
}

function proposalTarget(status: string, hasLoss: boolean): EtapaFunil | null {
  switch (status) {
    case "draft": return "proposta";
    case "sent": return "enviada";
    case "order": return "contrato";
    case "in_transit": return "entrega";
    case "delivered": return "faturamento";
    case "cancelled": return hasLoss ? "perdida" : "cancelada";
    default: return null;
  }
}

/**
 * Reconcilia os estados paralelos já existentes com o Funil canônico.
 * É idempotente e só avança registros quando há vínculo inequívoco.
 */
export async function reconcileCanonicalWorkflow(): Promise<{ updated: number; checked: number }> {
  const db = await getDb();
  if (!db) return { updated: 0, checked: 0 };

  let updated = 0;
  let checked = 0;
  const opportunities = await db.select().from(funilOportunidades).limit(1000);
  const byId = new Map(opportunities.map((o) => [o.id, o]));
  const byOrigin = new Map(
    opportunities
      .filter((o) => o.origemId != null)
      .map((o) => [`${o.origemTipo}:${o.origemId}`, o]),
  );
  const byProcess = new Map(
    opportunities
      .filter((o) => Boolean(o.numeroProcesso?.trim()))
      .map((o) => [o.numeroProcesso!.trim().toLowerCase(), o]),
  );

  try {
    const rows = await db.select().from(proposals).limit(1000);
    for (const proposal of rows) {
      checked++;
      let opportunity = proposal.radarOpportunityId
        ? byOrigin.get(`pncp:${proposal.radarOpportunityId}`)
        : undefined;
      if (!opportunity && proposal.processNumber?.trim()) {
        opportunity = byProcess.get(proposal.processNumber.trim().toLowerCase());
      }
      if (!opportunity) continue;
      const target = proposalTarget(
        proposal.status,
        Boolean(proposal.lossReason?.trim()) || proposal.competitorValue != null,
      );
      if (!target) continue;

      if (target === "perdida" || target === "cancelada") {
        if (!FINAL_STAGES.has(opportunity.etapa)) {
          await db.update(funilOportunidades).set({ etapa: target }).where(eq(funilOportunidades.id, opportunity.id));
          await db.insert(funilEventos).values({
            oportunidadeId: opportunity.id,
            deEtapa: opportunity.etapa,
            paraEtapa: target,
            justificativa: `[SYNC:PROPOSTA #${proposal.id}] ${proposal.status}`,
            usuario: "orquestrador",
          });
          opportunity.etapa = target;
          updated++;
        }
      } else {
        const previous = opportunity.etapa;
        const next = await advanceIfLater(
          opportunity.id,
          previous,
          target,
          `[SYNC:PROPOSTA #${proposal.id}] status ${proposal.status}`,
        );
        if (next !== previous) {
          opportunity.etapa = next;
          updated++;
        }
      }
    }
  } catch (error) {
    logger.warn("[CanonicalWorkflow] Falha parcial ao reconciliar propostas", (error as Error).message);
  }

  const syncByFunil = async <T extends { funilId: number | null }>(
    rows: T[],
    resolveTarget: (row: T) => EtapaFunil | null,
    label: (row: T) => string,
  ) => {
    for (const row of rows) {
      checked++;
      if (!row.funilId) continue;
      const opportunity = byId.get(row.funilId);
      const target = resolveTarget(row);
      if (!opportunity || !target) continue;
      const previous = opportunity.etapa;
      const next = await advanceIfLater(opportunity.id, previous, target, label(row));
      if (next !== previous) {
        opportunity.etapa = next;
        updated++;
      }
    }
  };

  try {
    const rows = await db.select().from(purchaseOrders).limit(1000);
    await syncByFunil(
      rows,
      (row) => row.status === "recebido" ? "faturamento" : row.status === "cancelado" ? null : "entrega",
      (row) => `[SYNC:PEDIDO #${(row as any).id}] status ${(row as any).status}`,
    );
  } catch (error) {
    logger.warn("[CanonicalWorkflow] Falha parcial ao reconciliar pedidos", (error as Error).message);
  }

  try {
    const rows = await db.select().from(deliveries).limit(1000);
    await syncByFunil(
      rows,
      (row) => row.status === "entregue" ? "faturamento" : "entrega",
      (row) => `[SYNC:ENTREGA #${(row as any).id}] status ${(row as any).status}`,
    );
  } catch (error) {
    logger.warn("[CanonicalWorkflow] Falha parcial ao reconciliar entregas", (error as Error).message);
  }

  try {
    const rows = await db.select().from(salesInvoices).limit(1000);
    await syncByFunil(
      rows,
      (row) => row.status === "paga" ? "recebimento" : row.status === "cancelada" ? null : "faturamento",
      (row) => `[SYNC:NF #${(row as any).id}] status ${(row as any).status}`,
    );
  } catch (error) {
    logger.warn("[CanonicalWorkflow] Falha parcial ao reconciliar faturamento", (error as Error).message);
  }

  return { updated, checked };
}

export async function listCanonicalOpportunities() {
  await reconcileCanonicalWorkflow();
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(funilOportunidades).orderBy(desc(funilOportunidades.updatedAt)).limit(500);
  return rows.map((row) => ({
    ...row,
    macroEtapa: macroEtapa(row.etapa),
    proximaAcao: nextActionForStage(row.etapa),
  }));
}

export async function getCanonicalOpportunity(id: number) {
  await reconcileCanonicalWorkflow();
  const db = await getDb();
  if (!db) return null;
  const [opportunity] = await db.select().from(funilOportunidades).where(eq(funilOportunidades.id, id)).limit(1);
  if (!opportunity) return null;

  const events = await db
    .select()
    .from(funilEventos)
    .where(eq(funilEventos.oportunidadeId, id))
    .orderBy(desc(funilEventos.createdAt));
  const orders = await db.select().from(purchaseOrders).where(eq(purchaseOrders.funilId, id));
  const deliveryRows = await db.select().from(deliveries).where(eq(deliveries.funilId, id));
  const invoices = await db.select().from(salesInvoices).where(eq(salesInvoices.funilId, id));

  let relatedProposals: Array<typeof proposals.$inferSelect> = [];
  if (opportunity.origemTipo === "pncp" && opportunity.origemId) {
    relatedProposals = await db.select().from(proposals).where(eq(proposals.radarOpportunityId, opportunity.origemId));
  }
  if (relatedProposals.length === 0 && opportunity.numeroProcesso?.trim()) {
    relatedProposals = await db.select().from(proposals).where(eq(proposals.processNumber, opportunity.numeroProcesso));
  }

  return {
    opportunity: {
      ...opportunity,
      macroEtapa: macroEtapa(opportunity.etapa),
      proximaAcao: nextActionForStage(opportunity.etapa),
    },
    events,
    proposals: relatedProposals,
    orders,
    deliveries: deliveryRows,
    invoices,
  };
}

export async function canonicalSummary() {
  const rows = await listCanonicalOpportunities();
  const porMacro: Record<MacroEtapa, number> = { entrada: 0, analise: 0, proposta: 0, execucao: 0, concluida: 0 };
  let criticos = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const row of rows) {
    porMacro[row.macroEtapa]++;
    if (row.prazoEnvio && !FINAL_STAGES.has(row.etapa)) {
      const due = new Date(row.prazoEnvio);
      due.setHours(0, 0, 0, 0);
      if ((due.getTime() - today.getTime()) / 86_400_000 <= 3) criticos++;
    }
  }

  return {
    total: rows.length,
    abertas: rows.filter((row) => !FINAL_STAGES.has(row.etapa)).length,
    criticos,
    porMacro,
  };
}

export type UnifiedAgendaItem = {
  key: string;
  tipo: "oportunidade" | "sessao" | "cotacao" | "certidao" | "contrato" | "entrega" | "receber" | "pagar";
  titulo: string;
  detalhe: string;
  data: string;
  diasRestantes: number;
  urgencia: "vencido" | "hoje" | "urgente" | "proximo" | "futuro";
  link: string;
};

function daysUntil(value: Date | string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function urgency(days: number): UnifiedAgendaItem["urgencia"] {
  if (days < 0) return "vencido";
  if (days === 0) return "hoje";
  if (days <= 3) return "urgente";
  if (days <= 14) return "proximo";
  return "futuro";
}

export async function listUnifiedAgenda(): Promise<{ itens: UnifiedAgendaItem[]; resumo: { vencidos: number; hoje: number; semana: number } }> {
  await reconcileCanonicalWorkflow();
  const db = await getDb();
  if (!db) return { itens: [], resumo: { vencidos: 0, hoje: 0, semana: 0 } };
  const itens: UnifiedAgendaItem[] = [];

  const funnel = await db.select().from(funilOportunidades).limit(1000);
  const emailOrigins = new Set(funnel.filter((x) => x.origemTipo === "email" && x.origemId).map((x) => x.origemId!));
  for (const row of funnel) {
    if (FINAL_STAGES.has(row.etapa)) continue;
    if (row.prazoEnvio) {
      const dias = daysUntil(row.prazoEnvio);
      itens.push({
        key: `oportunidade-prazo-${row.id}`,
        tipo: "oportunidade",
        titulo: nextActionForStage(row.etapa)?.label ?? row.titulo,
        detalhe: `${row.titulo}${row.orgao ? ` · ${row.orgao}` : ""}`,
        data: new Date(row.prazoEnvio).toISOString(),
        diasRestantes: dias,
        urgencia: urgency(dias),
        link: `/oportunidades?oportunidade=${row.id}`,
      });
    }
    if (row.dataAbertura) {
      const dias = daysUntil(row.dataAbertura);
      if (dias >= -1 && dias <= 60) {
        itens.push({
          key: `sessao-${row.id}`,
          tipo: "sessao",
          titulo: `Sessão / abertura: ${row.titulo}`,
          detalhe: row.orgao ?? row.numeroProcesso ?? "",
          data: new Date(row.dataAbertura).toISOString(),
          diasRestantes: dias,
          urgencia: urgency(dias),
          link: `/oportunidades?oportunidade=${row.id}`,
        });
      }
    }
  }

  try {
    const quotes = await db.select().from(emailQuotations).where(isNotNull(emailQuotations.prazoResposta));
    for (const row of quotes) {
      if (!row.prazoResposta || row.status === "respondida" || row.status === "descartada" || emailOrigins.has(row.id)) continue;
      const dias = daysUntil(row.prazoResposta);
      itens.push({
        key: `cotacao-${row.id}`,
        tipo: "cotacao",
        titulo: `Responder cotação: ${row.orgao ?? row.subject ?? `#${row.id}`}`,
        detalhe: `${row.matchedItems}/${row.totalItems} itens vinculados`,
        data: new Date(row.prazoResposta).toISOString(),
        diasRestantes: dias,
        urgencia: urgency(dias),
        link: "/oportunidades?origem=cotacoes",
      });
    }
  } catch (error) {
    logger.warn("[CanonicalAgenda] Cotações indisponíveis", (error as Error).message);
  }

  try {
    const rows = await db.select().from(certidoes).where(eq(certidoes.ativa, true));
    for (const row of rows) {
      const dias = daysUntil(row.dataValidade);
      if (dias > 90) continue;
      itens.push({ key: `certidao-${row.id}`, tipo: "certidao", titulo: `Renovar certidão: ${row.tipo}`, detalhe: row.orgaoEmissor ?? "", data: new Date(row.dataValidade).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: "/documentos-habilitacao" });
    }
  } catch (error) {
    logger.warn("[CanonicalAgenda] Certidões indisponíveis", (error as Error).message);
  }

  try {
    const rows = await db.select().from(contractAlerts).where(eq(contractAlerts.status, "open"));
    for (const row of rows) {
      if (!row.dueDate) continue;
      const dias = daysUntil(row.dueDate);
      itens.push({ key: `contrato-alerta-${row.id}`, tipo: "contrato", titulo: row.title, detalhe: row.description ?? "", data: new Date(row.dueDate).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: "/execucao?tab=contratos" });
    }
  } catch (error) {
    logger.warn("[CanonicalAgenda] Alertas contratuais indisponíveis", (error as Error).message);
  }

  try {
    const rows = await db.select().from(postAwardContracts).where(and(isNotNull(postAwardContracts.endDate), ne(postAwardContracts.status, "closed")));
    for (const row of rows) {
      if (!row.endDate) continue;
      const dias = daysUntil(row.endDate);
      if (dias > 120) continue;
      itens.push({ key: `contrato-fim-${row.id}`, tipo: "contrato", titulo: `Vigência contratual: ${row.contractNumber}`, detalhe: row.objectDescription ?? "", data: new Date(row.endDate).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: "/execucao?tab=contratos" });
    }
  } catch (error) {
    logger.warn("[CanonicalAgenda] Contratos indisponíveis", (error as Error).message);
  }

  try {
    const rows = await db.select().from(deliveries).where(isNotNull(deliveries.previsao));
    for (const row of rows) {
      if (!row.previsao || row.status === "entregue") continue;
      const dias = daysUntil(row.previsao);
      itens.push({ key: `entrega-${row.id}`, tipo: "entrega", titulo: `Entrega: ${row.descricao}`, detalhe: [row.transportadora, row.rastreio].filter(Boolean).join(" · "), data: new Date(row.previsao).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: "/execucao?tab=entregas" });
    }
  } catch (error) {
    logger.warn("[CanonicalAgenda] Entregas indisponíveis", (error as Error).message);
  }

  try {
    const rows = await db.select().from(salesInvoices).where(isNull(salesInvoices.recebidoEm));
    for (const row of rows) {
      if (!row.vencimento || row.status === "cancelada") continue;
      const dias = daysUntil(row.vencimento);
      itens.push({ key: `receber-${row.id}`, tipo: "receber", titulo: `Receber NF ${row.numero}`, detalhe: row.orgao, data: new Date(row.vencimento).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: "/financeiro" });
    }
  } catch (error) {
    logger.warn("[CanonicalAgenda] Recebíveis indisponíveis", (error as Error).message);
  }

  try {
    const rows = await db.select().from(payables).where(isNull(payables.pagoEm));
    for (const row of rows) {
      const dias = daysUntil(row.vencimento);
      itens.push({ key: `pagar-${row.id}`, tipo: "pagar", titulo: `Pagar: ${row.descricao}`, detalhe: row.credor ?? row.categoria, data: new Date(row.vencimento).toISOString(), diasRestantes: dias, urgencia: urgency(dias), link: "/financeiro" });
    }
  } catch (error) {
    logger.warn("[CanonicalAgenda] Contas a pagar indisponíveis", (error as Error).message);
  }

  itens.sort((a, b) => a.diasRestantes - b.diasRestantes || a.titulo.localeCompare(b.titulo, "pt-BR"));
  return {
    itens,
    resumo: {
      vencidos: itens.filter((x) => x.diasRestantes < 0).length,
      hoje: itens.filter((x) => x.diasRestantes === 0).length,
      semana: itens.filter((x) => x.diasRestantes >= 0 && x.diasRestantes <= 7).length,
    },
  };
}
