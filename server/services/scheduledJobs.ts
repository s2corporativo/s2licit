import cron from "node-cron";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { certidoes, emailQuotations } from "../../drizzle/schema";
import { isImapConfigured } from "./emailInboxService";
import { syncEmailQuotations } from "./emailQuotationSyncService";
import { classificarValidade } from "../routers/certidoes";
import { notifyOwner } from "../_core/notification";
import { enviarWhatsapp, isWhatsappConfigured } from "./whatsappService";

/**
 * Agendador central de jobs recorrentes.
 *
 * - Sincronização de cotações por e-mail (se IMAP configurado).
 * - Notificações proativas diárias (certidões vencendo, prazos de cotação).
 *
 * Tudo desligável por ambiente. As expressões cron podem ser sobrescritas.
 */

const DEFAULT_EMAIL_SYNC_CRON = "*/15 * * * *"; // a cada 15 min
const DEFAULT_ALERTS_CRON = "0 8 * * *"; // todo dia às 8h
const ALERT_DAYS = 30; // certidões
const DEADLINE_DAYS = 3; // prazos de cotação

function enabled(flag: string | undefined, defaultOn: boolean): boolean {
  if (flag == null || flag === "") return defaultOn;
  return flag !== "false" && flag !== "0";
}

/** Roda a sincronização de e-mail uma vez, com log resumido. */
async function runEmailSync(): Promise<void> {
  try {
    const result = await syncEmailQuotations({ limit: 50 });
    if (result.imported > 0 || result.errors.length > 0) {
      console.log(
        `[Scheduler] Cotações e-mail: ${result.imported} importadas, ${result.skipped} já existentes, ${result.errors.length} avisos.`,
      );
    }
  } catch (err) {
    console.error("[Scheduler] Falha na sincronização de e-mail:", (err as Error).message);
  }
}

/** Verifica certidões e prazos e notifica o dono se houver pendências. */
export async function runDailyAlerts(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const hoje = new Date();
  const linhas: string[] = [];

  // Certidões vencidas / vencendo
  try {
    const certs = await db.select().from(certidoes).where(eq(certidoes.ativa, true));
    const vencidas: string[] = [];
    const vencendo: string[] = [];
    for (const c of certs) {
      if (!c.dataValidade) continue;
      const status = classificarValidade(new Date(c.dataValidade), hoje, ALERT_DAYS);
      const dataFmt = new Date(c.dataValidade).toLocaleDateString("pt-BR");
      if (status === "vencida") vencidas.push(`${c.tipo} (venceu ${dataFmt})`);
      else if (status === "vence_em_breve") vencendo.push(`${c.tipo} (vence ${dataFmt})`);
    }
    if (vencidas.length) linhas.push(`Certidões VENCIDAS: ${vencidas.join("; ")}`);
    if (vencendo.length) linhas.push(`Certidões vencendo em ${ALERT_DAYS} dias: ${vencendo.join("; ")}`);
  } catch (err) {
    console.error("[Scheduler] Falha ao verificar certidões:", (err as Error).message);
  }

  // Prazos de cotação
  try {
    const cotacoes = await db.select().from(emailQuotations);
    const msPorDia = 24 * 60 * 60 * 1000;
    const vencidos: string[] = [];
    const proximos: string[] = [];
    for (const q of cotacoes) {
      if (!q.prazoResposta || q.status === "respondida" || q.status === "descartada") continue;
      const dias = Math.floor((new Date(q.prazoResposta).getTime() - hoje.getTime()) / msPorDia);
      const label = `${q.orgao ?? q.subject ?? `Cotação ${q.id}`}`;
      if (dias < 0) vencidos.push(label);
      else if (dias <= DEADLINE_DAYS) proximos.push(`${label} (${dias}d)`);
    }
    if (vencidos.length) linhas.push(`Cotações com prazo VENCIDO sem resposta: ${vencidos.join("; ")}`);
    if (proximos.length) linhas.push(`Cotações vencendo em ${DEADLINE_DAYS} dias: ${proximos.join("; ")}`);
  } catch (err) {
    console.error("[Scheduler] Falha ao verificar prazos:", (err as Error).message);
  }

  if (linhas.length > 0) {
    await notifyOwner({
      title: "Alertas do dia — Sistema S2",
      content: linhas.join("\n"),
    });
    if (isWhatsappConfigured()) {
      const enviado = await enviarWhatsapp(`📋 Alertas do dia — Sistema S2\n\n${linhas.join("\n")}`);
      if (enviado) console.log("[Scheduler] Alertas diários também enviados por WhatsApp.");
    }
    console.log(`[Scheduler] Alertas diários: ${linhas.length} pendência(s) notificada(s).`);
  }
}

/** Registra os jobs recorrentes. Chamado uma vez no boot. */
export function initScheduledJobs(): void {
  // 1. Sincronização de cotações por e-mail
  if (isImapConfigured() && enabled(process.env.EMAIL_SYNC_ENABLED, true)) {
    const expr = process.env.EMAIL_SYNC_CRON || DEFAULT_EMAIL_SYNC_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, runEmailSync);
      console.log(`[Scheduler] Sincronização de cotações por e-mail agendada (${expr}).`);
    } else {
      console.warn(`[Scheduler] EMAIL_SYNC_CRON inválido: "${expr}" — sincronização automática desativada.`);
    }
  }

  // 2. Alertas proativos diários
  if (enabled(process.env.ALERTS_ENABLED, true)) {
    const expr = process.env.ALERTS_CRON || DEFAULT_ALERTS_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, runDailyAlerts);
      console.log(`[Scheduler] Alertas diários agendados (${expr}).`);
    } else {
      console.warn(`[Scheduler] ALERTS_CRON inválido: "${expr}" — alertas diários desativados.`);
    }
  }
}
