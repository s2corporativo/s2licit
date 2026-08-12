import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { emailQuotationItems, emailQuotations } from "../../drizzle/schema";
import { buildQuotationResponse } from "./emailQuotationResponseService";
import { isSmtpConfigured, sendEmail } from "./emailSenderService";
import { ensureOpportunityFromQuotation } from "./opportunityWorkflowService";
import { avaliarFrescorPrecos, type FrescorPreco } from "./priceFreshnessService";
import { recordAudit } from "./auditService";
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

const DEFAULT_AUTO_CONFIRM_THRESHOLD = 0.82;

export function autoConfirmThreshold(): number {
  const raw = Number(process.env.QUOTATION_AUTO_CONFIRM_THRESHOLD);
  if (Number.isFinite(raw) && raw >= 0.5 && raw <= 1) return raw;
  return DEFAULT_AUTO_CONFIRM_THRESHOLD;
}

/**
 * Limiar MÍNIMO de similaridade de nome para o match por nome sequer entrar
 * no catálogo de candidatos da revisão (abaixo disso, o item não recebe match
 * algum). Deve ficar abaixo do limiar de auto-confirmação — itens entre os
 * dois limiares aparecem na fila com o melhor candidato para confirmação humana.
 */
export function nameMatchThreshold(): number {
  const raw = Number(process.env.QUOTATION_NAME_MATCH_THRESHOLD);
  if (Number.isFinite(raw) && raw >= 0.4 && raw <= 0.9) return raw;
  return 0.68;
}

export function isAutoPipelineEnabled(): boolean {
  const flag = process.env.QUOTATION_AUTO_PIPELINE_ENABLED;
  return flag == null || flag === "" || (flag !== "false" && flag !== "0");
}

export function isAutoSendEnabled(): boolean {
  return process.env.QUOTATION_AUTO_SEND_ENABLED === "true";
}

/**
 * Filtra produtos com preço VENCIDO e QUE TÊM histórico de consulta datado —
 * pura e testável. Produto sem `consultadoEm` não entra aqui: a política do
 * pipeline automático é não bloquear preço estático (cadastro, NF-e), só o
 * que foi de fato consultado e ficou velho.
 */
export function staleMatchedProducts(frescor: FrescorPreco[]): FrescorPreco[] {
  return frescor.filter((f) => f.consultadoEm != null && f.vencido);
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

  // Claim atômico: reserva a cotação transicionando revisao→processando
  // SÓ SE ainda estiver em revisao. Evita que o agendador, uma chamada manual
  // e (em produção com mais de uma instância) outro processo processem a
  // mesma cotação em paralelo. Se 0 linhas foram afetadas, outra execução já
  // pegou esta cotação — não é erro, apenas não há nada a fazer aqui agora.
  const claim = await db
    .update(emailQuotations)
    .set({ status: "processando" })
    .where(and(eq(emailQuotations.id, quotationId), eq(emailQuotations.status, "revisao")));
  const claimedRows = (claim as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
  if (claimedRows !== 1) {
    result.blockedReason = "Cotação já está sendo processada por outra execução.";
    return result;
  }

  try {
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
      // Trilha de auditoria: base para calibrar o limiar (quantas confirmações
      // automáticas depois são corrigidas manualmente pelo operador).
      await recordAudit({
        action: "AUTO_MATCH_CONFIRMED",
        entity: "email_quotation_items",
        entityId: item.id,
        summary: `Match auto-confirmado (${item.matchMethod}, score ${item.matchScore ?? "—"})`,
        changes: { produtoMatchId: item.produtoMatchId, matchMethod: item.matchMethod, matchScore: item.matchScore },
      });
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

    // 3. Frescor do preço de custo — item cujo produto tem preço vencido
    //    (histórico de consulta mais velho que a validade configurada) segura a
    //    cotação na revisão humana. Produto sem histórico de consulta não é
    //    considerado vencido aqui: nesse caso o preço vem de cadastro estático
    //    (NF-e, planilha), não de uma consulta datada a revalidar.
    const matchedProductIds = items
      .map((item) => item.produtoMatchId)
      .filter((id): id is number => id != null);
    const frescor = await avaliarFrescorPrecos(matchedProductIds);
    const vencidos = staleMatchedProducts(frescor);
    if (vencidos.length > 0) {
      result.blockedReason =
        `${vencidos.length} produto(s) com preço vencido — revalide a consulta antes de gerar a proposta.`;
      return result;
    }

    // 4. Geração da proposta (mesmo caminho validado do fluxo manual, com
    //    margem por categoria quando houver regra ativa)
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
        status: "revisao",
        propostaPdfUrl: stored.url,
        propostaGeradaEm: new Date(),
        propostaMargemPercent: String(response.effectiveMarginPercent.toFixed(2)),
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

    // 5. Envio automático — só com a chave explicitamente ligada, SMTP
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
  } finally {
    // Libera o claim se a cotação não chegou a virar proposta (qualquer
    // bloqueio no meio do caminho) — senão ficaria travada em "processando"
    // para sempre, fora do alcance de qualquer nova tentativa.
    if (!result.proposalGenerated) {
      await db
        .update(emailQuotations)
        .set({ status: "revisao" })
        .where(and(eq(emailQuotations.id, quotationId), eq(emailQuotations.status, "processando")));
    }
  }
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
