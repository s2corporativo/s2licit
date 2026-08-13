/**
 * Relatório diário consolidado (07:00, horário de Brasília).
 *
 * Envio automático por e-mail (SMTP configurado) consolidando, em um único
 * e-mail matinal, os três escopos monitorados do sistema:
 *
 * 1. Canal de e-mail de cotações — fila por status, prazos vencidos e itens
 *    sem correspondência no catálogo (os gargalos reais do fluxo central).
 * 2. Scrapers de fornecedores — resultado da última rodada de cada um.
 * 3. Portal PNPC/Comprasnet — pregões eletrônicos (Lei 14.133) publicados
 *    ontem; a API pública oficial de dados abertos do Compras.gov.br.
 *
 * Desligável com DAILY_REPORT_ENABLED=false. Atrasado com
 * DAILY_REPORT_HOUR_HHMM no formato "HH:MM".
 */
import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { emailQuotations } from "../../drizzle/schema";
import { scraperConfigs } from "../../drizzle/schema";
import { isSmtpConfigured, sendEmail } from "./emailSenderService";
import { logger } from "../_core/logger";

export interface DailyReportResult {
  sent: boolean;
  smtpConfigured: boolean;
  summary: string;
  errors: string[];
}

interface ScrapersSection {
  rows: string[];
  failedCount: number;
}

async function buildEmailSection(): Promise<string> {
  const db = await getDb();
  if (!db) return "Banco indisponível — consulta do canal de e-mail não realizada.";
  const now = new Date();

  let statusCounts: Array<{ status: string; n: number }> = [];
  let deadlines: Array<{ n: number }> = [];
  let unmatched: Array<{ n: number }> = [];
  let processingErrors: Array<{ quotationId: number; error: string | null }> = [];
  try {
    statusCounts = await db
      .select({ status: emailQuotations.status, n: sql<number>`count(*)` })
      .from(emailQuotations)
      .groupBy(emailQuotations.status);
    deadlines = await db
      .select({ n: sql<number>`count(*)` })
      .from(emailQuotations)
      .where(
        and(
          eq(emailQuotations.status, "revisao"),
          isNull(emailQuotations.propostaGeradaEm),
          isNotNull(emailQuotations.prazoResposta),
          lte(emailQuotations.prazoResposta, now),
        ),
      );
    unmatched = await db
      .select({ n: sql<number>`count(*)` })
      .from(emailQuotations)
      .where(
        and(
          isNull(emailQuotations.propostaGeradaEm),
          gt(emailQuotations.totalItems, emailQuotations.matchedItems),
        ),
      );
    processingErrors = await db
      .select({
        quotationId: emailQuotations.id,
        error: emailQuotations.errorMessage,
      })
      .from(emailQuotations)
      .where(
        and(
          isNotNull(emailQuotations.errorMessage),
          gt(emailQuotations.updatedAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
        ),
      )
      .orderBy(sql`${emailQuotations.updatedAt} desc`)
      .limit(5);
  } catch {
    // Colunas opcionais ausentes não derrubam o relatório.
    statusCounts = [];
  }

  const lines: string[] = ["CANAL DE E-MAIL DE COTACOES", "-------------------------"];
  if (statusCounts.length > 0) {
    lines.push(...statusCounts.map((c) => `  ${c.status}: ${c.n}`));
  } else {
    lines.push("  (sem cotações registradas)");
  }
  lines.push(`  Prazos de resposta vencidos: ${deadlines[0]?.n ?? 0}`);
  lines.push(`  Itens sem correspondência no catálogo: ${unmatched[0]?.n ?? 0}`);
  if (processingErrors.length > 0) {
    lines.push("  Últimos erros de processamento (7 dias):");
    for (const e of processingErrors) {
      lines.push(`    - cotação ${e.quotationId}: ${String(e.error ?? "").slice(0, 120)}`);
    }
  }
  return lines.join("\n");
}

async function buildScrapersSection(): Promise<ScrapersSection> {
  const section: ScrapersSection = { rows: [], failedCount: 0 };
  const db = await getDb();
  if (!db) {
    section.rows.push("  (banco indisponível)");
    return section;
  }
  const rows = await db
    .select({
      scraperType: scraperConfigs.scraperType,
      supplierId: scraperConfigs.supplierId,
      lastStatus: scraperConfigs.lastRunStatus,
      lastError: scraperConfigs.lastRunErrorMessage,
      updatedAt: scraperConfigs.updatedAt,
    })
    .from(scraperConfigs)
    .orderBy(scraperConfigs.id);

  const lines: string[] = ["SCRAPERS DE FORNECEDORES (última rodada)", "----------------------------------"];
  for (const r of rows) {
    const status = String(r.lastStatus ?? "nunca executado");
    const ok = status === "success";
    const stamp = r.updatedAt ? new Date(r.updatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
    lines.push(`  fornecedor ${r.supplierId} (${r.scraperType}): ${status} em ${stamp}`);
    if (!ok && r.lastError) {
      section.failedCount++;
      lines.push(`    erro: ${String(r.lastError).slice(0, 150)}`);
    }
  }
  if (rows.length === 0) lines.push("  (nenhum scraper cadastrado)");
  section.rows = lines;
  return section;
}

async function buildPnpcSection(): Promise<string> {
  const lines: string[] = ["PORTAL PNPC / COMPRASNET (pregões Lei 14.133)", "----------------------------------"];

  // Nota: a API histórica de dados abertos (dadosabertos.compras.gov.br/api/dados/v1/compras)
  // foi descontinuada (404) e a API de consulta pública do PNCP (pncp.gov.br/api/consulta/v1)
  // está fora do ar desde abr/2026, sem prazo de correção do governo federal. O bloco abaixo
  // usa a API pública remanescente e funcional (pncp/v1/orgaos) para validar a conectividade
  // com o portal oficial; a pesquisa de editais permanece manual no portal PNCP até a volta
  // dos serviços públicos de consulta em massa.
  try {
    const res = await fetch(
      "https://pncp.gov.br/api/pncp/v1/orgaos?uf=MG&pagina=1&tamanhoPagina=5",
      { signal: AbortSignal.timeout(25000), headers: { accept: "application/json" } },
    );
    if (!res.ok) {
      lines.push(`  API pública do PNCP retornou HTTP ${res.status}.`);
      lines.push("  Consultar editais manualmente em https://pncp.gov.br/app/editais");
      return lines.join("\n");
    }
    const json = (await res.json()) as Array<Record<string, unknown>>;
    if (Array.isArray(json) && json.length > 0) {
      lines.push(`  Portal PNCP (pncp.gov.br) acessível — ${json.length} órgão(s) de MG listados.`);
      for (const o of json.slice(0, 3)) {
        lines.push(`  - ${String(o["razaoSocial"] ?? o["nomeEntidade"] ?? "?")}`);
      }
    } else {
      lines.push("  Portal PNCP acessível (resposta vazia). Consultar editais em https://pncp.gov.br/app/editais");
    }
    lines.push("  Atenção: a API de consulta pública em massa do PNCP está fora do ar (gov.br ciente, sem prazo). " +
      "A busca de pregões segue sendo feita manualmente no portal oficial até o restabelecimento.");
    return lines.join("\n");
  } catch (err) {
    lines.push(`  Portal PNCP indisponível no momento: ${(err as Error).message}`);
    lines.push("  Consultar editais manualmente em https://pncp.gov.br/app/editais");
    return lines.join("\n");
  }
}

/** Envia o relatório diário; falha isolada, nunca derruba o agendador. */
export async function sendQuotationDailyReport(
  options?: { recipient?: string },
): Promise<DailyReportResult> {
  const result: DailyReportResult = {
    sent: false,
    smtpConfigured: isSmtpConfigured(),
    summary: "",
    errors: [],
  };

  if (!result.smtpConfigured) {
    result.errors.push("SMTP não configurado (SMTP_HOST/SMTP_USER/SMTP_PASSWORD) — relatório desativado.");
    return result;
  }

  const [emailPart, scrapers, pnpmcPart] = await Promise.all([
    buildEmailSection(),
    buildScrapersSection(),
    buildPnpcSection(),
  ]).catch((err) => {
    result.errors.push((err as Error).message);
    return [null, { rows: [], failedCount: 0 }, null] as [null, ScrapersSection, null];
  });

  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const lines = [
    `RELATÓRIO DIÁRIO S2 LICIT — ${hoje}`,
    "==================================",
    "",
    emailPart ?? "Canal de e-mail indisponível nesta execução.",
    "",
    (scrapers?.rows ?? []).join("\n"),
    "",
    pnpmcPart ?? "Portal PNPC indisponível nesta execução.",
    "",
    "Gerado automaticamente pelo S2 Licit às 07:00 (horário de Brasília).",
  ];
  result.summary = lines.join("\n");

  const recipient = options?.recipient || process.env.SMTP_FROM || process.env.SMTP_USER || "";
  if (!recipient) {
    result.errors.push("Nenhum destinatário definido para o relatório diário.");
    return result;
  }

  try {
    await sendEmail({
      to: recipient,
      subject: `Relatório diário S2 Licit — ${hoje}`,
      text: result.summary,
    });
    result.sent = true;
  } catch (err) {
    result.errors.push(`Falha ao enviar o relatório: ${(err as Error).message}`);
  }
  return result;
}

/** Wrapper seguro para o agendador. */
export async function sendQuotationDailyReportSafely(): Promise<void> {
  try {
    const r = await sendQuotationDailyReport();
    if (!r.sent) {
      logger.warn(`[DailyReport] Relatório não enviado: ${r.errors.join("; ")}`);
    } else {
      logger.info("[DailyReport] Relatório diário enviado.");
    }
  } catch (err) {
    logger.error("[DailyReport] Falha no relatório diário:", (err as Error).message);
  }
}
