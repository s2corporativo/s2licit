import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { emailQuotationItems, emailQuotations } from "../../drizzle/schema";
import { buildQuotationResponse } from "./emailQuotationResponseService";
import { isSmtpConfigured, sendEmail } from "./emailSenderService";
import { ensureOpportunityFromQuotation } from "./opportunityWorkflowService";
import { storagePut } from "../storage";
import { logger } from "../_core/logger";

/**
 * Pipeline automático cotação→proposta.
 *
 * Depois que uma cotação entra na fila (via e-mail ou radar de portais), este
 * serviço:
 *   1. Auto-confirma itens com match determinístico (CATMAS/CATMAT, score 1)
 *      ou similaridade de nome acima do limiar de alta confiança — desde que
 *      haja preço de custo positivo. Cada confirmação automática fica marcada
 *      (matchAuto=true) para a trilha de auditoria.
 *   2. Se TODOS os itens da cotação ficarem confirmados e precificados, gera o
 *      PDF da proposta automaticamente e o armazena (propostaPdfUrl), pronto
 *      para revisão e envio em um clique.
 *   3. Opcionalmente (QUOTATION_AUTO_SEND_ENABLED=true, padrão DESLIGADO),
 *      envia a proposta por e-mail ao solicitante sem intervenção humana.
 *      O padrão do sistema permanece "geração automática, envio aprovado" —
 *      compatível com a governança já adotada (envio sujeito à aprovação).
 *
 * Tudo idempotente: cotações com proposta já gerada são puladas.
 */

const DEFAULT_AUTO_CONFIRM_THRESHOLD = 0.92;

export function autoConfirmThreshold(): number {
  const raw = Number(process.env.QUOTATION_AUTO_CONFIRM_THRESHOLD);
  if (Number.isFinite(raw) && raw >= 0.5 && raw <= 1) return raw;
  return DEFAULT_AUTO_CONFIRM_THRESHOLD;
}

export function isAutoPipelineEnabled(): boolean {
  const flag = process.env.QUOTATION_AUTO_PIPELINE_ENABLED;
  return flag == null || flag === "" || (flag !== "false" && flag !== "0");
}

export function isAutoSendEnabled(): boolean {
  return process.env.QUOTATION_AUTO_SEND_ENABLED === "true";
}

export interface AutoConfirmCandidate {
  matchConfirmado: boolean;
  matchMethod: string;
  matchScore: string | number | null;
  produtoMatchId: number | null;
  precoSugerido: string | number | null;
}

/**
 * Decide se um item pode ter o match confirmado automaticamente.
 * Exportada e pura para facilitar testes.
 *
 * Regras:
 *  - Já confirmado → não (nada a fazer).
 *  - Sem produto casado ou sem preço de custo positivo → não.
 *  - Match por código de catálogo (CATMAS/CATMAT) é determinístico → sim.
 *  - Match por nome exige score ≥ limiar de alta confiança → sim.
 *  - Match manual/nenhum nunca é auto-confirmado (decisão humana pendente).
 */
export function shouldAutoConfirm(
  item: AutoConfirmCandidate,
  threshold = autoConfirmThreshold(),
): boolean {
  if (item.matchConfirmado) return false;
  if (item.produtoMatchId == null) return false;
  const preco = Number(item.precoSugerido);
  if (!Number.isFinite(preco) || preco <= 0) return false;

  if (item.matchMethod === "catmas" || item.matchMethod === "catmat") return true;
  if (item.matchMethod === "nome") {
    const score = Number(item.matchScore);
    return Number.isFinite(score) && score >= threshold;
  }
  return false;
}

export interface AutoPipelineQuotationResult {
  quotationId: number;
  autoConfirmedItems: number;
  proposalGenerated: boolean;
  sent: boolean;
  blockedReason: string | null;
}

export interface AutoPipelineResult {
  enabled: boolean;
  processed: number;
  autoConfirmedItems: number;
  proposalsGenerated: number;
  sent: number;
  blocked: number;
  errors: string[];
  quotations: AutoPipelineQuotationResult[];
}

const AUTO_ACTOR = { name: "Pipeline automático S2" };

/** Processa uma única cotação: auto-confirma, gera a proposta e (opcional) envia. */
export async function runAutoPipelineForQuotation(
  quotationId: number,
): Promise<AutoPipelineQuotationResult> {
  const result: AutoPipelineQuotationResult = {
    quotationId,
    autoConfirmedItems: 0,
    proposalGenerated: false,
    sent: false,
    blockedReason: null,
  };

  const db = await getDb();
  if (!db) {
    result.blockedReason = "Banco de dados indisponível.";
    return result;
  }

  const [quotation] = await db
    .select()
    .from(emailQuotations)
    .where(eq(emailQuotations.id, quotationId))
    .limit(1);
  if (!quotation) {
    result.blockedReason = "Cotação não encontrada.";
    return result;
  }
  if (quotation.propostaGeradaEm != null) {
    result.blockedReason = "Proposta já gerada anteriormente.";
    return result;
  }
  if (quotation.status !== "revisao") {
    result.blockedReason = `Status "${quotation.status}" fora do pipeline (esperado: revisao).`;
    return result;
  }

  const items = await db
    .select()
    .from(emailQuotationItems)
    .where(eq(emailQuotationItems.quotationId, quotationId));
  if (items.length === 0) {
    result.blockedReason = "Cotação sem itens extraídos.";
    return result;
  }

  // 1. Auto-confirmação dos matches de alta confiança
  const threshold = autoConfirmThreshold();
  for (const item of items) {
    if (!shouldAutoConfirm(item, threshold)) continue;
    await db
      .update(emailQuotationItems)
      .set({ matchConfirmado: true, matchAuto: true })
      .where(eq(emailQuotationItems.id, item.id));
    item.matchConfirmado = true;
    result.autoConfirmedItems++;
  }

  // 2. Todos confirmados e com preço? Senão, a cotação fica para revisão humana.
  const pendentes = items.filter(
    (item) => item.produtoMatchId == null || item.matchConfirmado !== true,
  );
  if (pendentes.length > 0) {
    result.blockedReason = `${pendentes.length} item(ns) aguardando revisão humana (match ausente ou abaixo do limiar).`;
    return result;
  }
  const semPreco = items.filter((item) => {
    const preco = Number(item.precoSugerido);
    return !Number.isFinite(preco) || preco <= 0;
  });
  if (semPreco.length > 0) {
    result.blockedReason = `${semPreco.length} item(ns) sem preço de custo positivo.`;
    return result;
  }

  // 3. Geração da proposta (mesmo caminho validado do fluxo manual)
  const response = await buildQuotationResponse(quotationId);
  const pdfBuffer = Buffer.from(response.pdfBase64, "base64");
  const stored = await storagePut(
    `propostas/auto/orcamento-${quotationId}.pdf`,
    pdfBuffer,
    "application/pdf",
  );

  await db
    .update(emailQuotations)
    .set({
      propostaPdfUrl: stored.url,
      propostaGeradaEm: new Date(),
      propostaMargemPercent: String(response.marginPercent.toFixed(2)),
      valorProposto: String(response.total.toFixed(2)),
    })
    .where(eq(emailQuotations.id, quotationId));
  result.proposalGenerated = true;

  // Rastreabilidade: toda proposta gerada entra no funil de oportunidades.
  try {
    await ensureOpportunityFromQuotation(quotationId, AUTO_ACTOR);
  } catch (err) {
    logger.warn(
      `[AutoPipeline] Cotação ${quotationId}: proposta gerada, mas o funil não foi atualizado: ${(err as Error).message}`,
    );
  }

  // 4. Envio automático — só com a chave explicitamente ligada, SMTP
  //    configurado e remetente identificado (cotações de portal não têm e-mail).
  if (isAutoSendEnabled() && isSmtpConfigured() && quotation.fromAddress) {
    await sendEmail({
      to: quotation.fromAddress,
      subject: `Proposta comercial - ${quotation.subject ?? `Cotação ${quotationId}`}`,
      text:
        "Prezados,\n\nSegue em anexo nossa proposta comercial em resposta à solicitação de cotação.\n\nAtenciosamente.",
      attachments: [
        {
          filename: `orcamento-${quotationId}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    await db
      .update(emailQuotations)
      .set({ status: "respondida" })
      .where(eq(emailQuotations.id, quotationId));
    result.sent = true;
  }

  return result;
}

/**
 * Varre as cotações em revisão sem proposta gerada e roda o pipeline em cada
 * uma. Chamado pelo agendador após cada sincronização (e-mail e portais) e
 * disponível sob demanda via tRPC.
 */
export async function runAutoPipelineForPending(options?: {
  limit?: number;
}): Promise<AutoPipelineResult> {
  const result: AutoPipelineResult = {
    enabled: isAutoPipelineEnabled(),
    processed: 0,
    autoConfirmedItems: 0,
    proposalsGenerated: 0,
    sent: 0,
    blocked: 0,
    errors: [],
    quotations: [],
  };
  if (!result.enabled) return result;

  const db = await getDb();
  if (!db) {
    result.errors.push("Banco de dados indisponível.");
    return result;
  }

  const pending = await db
    .select({ id: emailQuotations.id })
    .from(emailQuotations)
    .where(and(eq(emailQuotations.status, "revisao"), isNull(emailQuotations.propostaGeradaEm)))
    .limit(options?.limit ?? 50);

  for (const row of pending) {
    result.processed++;
    try {
      const one = await runAutoPipelineForQuotation(row.id);
      result.autoConfirmedItems += one.autoConfirmedItems;
      if (one.proposalGenerated) result.proposalsGenerated++;
      if (one.sent) result.sent++;
      if (one.blockedReason) result.blocked++;
      result.quotations.push(one);
    } catch (err) {
      result.errors.push(`Cotação ${row.id}: ${(err as Error).message}`);
    }
  }

  if (result.proposalsGenerated > 0 || result.errors.length > 0) {
    logger.info(
      `[AutoPipeline] ${result.processed} cotação(ões) avaliadas, ` +
        `${result.autoConfirmedItems} match(es) auto-confirmados, ` +
        `${result.proposalsGenerated} proposta(s) geradas, ${result.sent} enviada(s), ` +
        `${result.blocked} aguardando revisão humana, ${result.errors.length} erro(s).`,
    );
  }

  return result;
}
