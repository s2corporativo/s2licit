import cron from "node-cron";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { getDb } from "../db";
import { certidoes, emailQuotations, scraperConfigs } from "../../drizzle/schema";
import { isImapConfigured } from "./emailInboxService";
import { syncEmailQuotations } from "./emailQuotationSyncService";
import { classificarValidade } from "../routers/certidoes";
import { notifyOwner } from "../_core/notification";
import { enviarWhatsapp, isWhatsappConfigured } from "./whatsappService";
import { executarScraper } from "./scraperEngine";
import { runDatabaseBackup, cleanupOldBackups } from "./backupService";

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
const DEFAULT_SCRAPER_SCHEDULE_CRON = "* * * * *"; // verifica a cada minuto
const DEFAULT_BACKUP_CRON = "0 3 * * *"; // backup diário às 3h
const DEFAULT_BACKUP_KEEP_DAYS = 14;
const SCRAPER_TIMEZONE = "America/Sao_Paulo";
const ALERT_DAYS = 30; // certidões
const DEADLINE_DAYS = 3; // prazos de cotação

function enabled(flag: string | undefined, defaultOn: boolean): boolean {
  if (flag == null || flag === "") return defaultOn;
  return flag !== "false" && flag !== "0";
}

/**
 * Notifica falhas de jobs (notificação interna + WhatsApp quando configurado).
 * Cada canal é isolado em try/catch — um alerta nunca derruba o scheduler.
 * Desligável com FAILURE_ALERTS_ENABLED=false.
 */
async function notifyJobFailure(title: string, detail: string): Promise<void> {
  if (!enabled(process.env.FAILURE_ALERTS_ENABLED, true)) return;
  try {
    await notifyOwner({ title, content: detail });
  } catch (err) {
    console.error("[Scheduler] Falha ao enviar notificação de erro:", (err as Error).message);
  }
  if (isWhatsappConfigured()) {
    try {
      await enviarWhatsapp(`⚠️ ${title}\n\n${detail}`);
    } catch (err) {
      console.error("[Scheduler] Falha ao enviar WhatsApp de erro:", (err as Error).message);
    }
  }
}

let emailSyncRunning = false;

/** Roda a sincronização de e-mail uma vez, com log resumido e guarda de sobreposição. */
async function runEmailSync(): Promise<void> {
  if (emailSyncRunning) {
    console.warn("[Scheduler] Sincronização de e-mail anterior ainda em andamento — pulando este ciclo.");
    return;
  }
  emailSyncRunning = true;
  try {
    const result = await syncEmailQuotations({ limit: 50 });
    if (result.imported > 0 || result.errors.length > 0) {
      console.log(
        `[Scheduler] Cotações e-mail: ${result.imported} importadas, ${result.skipped} já existentes, ${result.errors.length} avisos.`,
      );
    }
  } catch (err) {
    console.error("[Scheduler] Falha na sincronização de e-mail:", (err as Error).message);
  } finally {
    emailSyncRunning = false;
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

  // Prazos de cotação — filtra no SQL: só pendentes com prazo definido
  try {
    const cotacoes = await db
      .select()
      .from(emailQuotations)
      .where(
        and(
          isNotNull(emailQuotations.prazoResposta),
          notInArray(emailQuotations.status, ["respondida", "descartada"]),
        ),
      );
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

/**
 * Dispara os scrapers de fornecedores cujo `scheduleTime` (HH:mm, horário de
 * Brasília) já passou hoje e que ainda não rodaram no dia. A comparação por
 * JANELA (scheduleTime <= agora, sem execução hoje) garante que um tick de
 * minuto perdido — event loop ocupado com scraping/LLM — não faça o
 * fornecedor pular o dia inteiro, como acontecia com a igualdade exata.
 * A proteção contra execução concorrente do mesmo fornecedor (ex.: clique
 * manual coincidindo com o horário agendado) vive em `executarScraper`
 * (scraperEngine.ts), não aqui.
 */
const scraperFiredOn = new Map<number, string>(); // configId → data (tz) do último disparo local

async function runScheduledScrapers(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: SCRAPER_TIMEZONE }),
  );
  const hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE });

  try {
    const ativos = await db.select({
      id: scraperConfigs.id,
      scheduleTime: scraperConfigs.scheduleTime,
      lastRunAt: scraperConfigs.lastRunAt,
    })
      .from(scraperConfigs)
      .where(eq(scraperConfigs.enabled, "yes"));

    for (const cfg of ativos) {
      if (!cfg.scheduleTime || cfg.scheduleTime > hhmm) continue;
      // Já rodou hoje (pelo banco ou por disparo local ainda em andamento)?
      const lastRunDay = cfg.lastRunAt
        ? new Date(cfg.lastRunAt).toLocaleDateString("en-CA", { timeZone: SCRAPER_TIMEZONE })
        : null;
      if (lastRunDay === hoje || scraperFiredOn.get(cfg.id) === hoje) continue;
      scraperFiredOn.set(cfg.id, hoje);

      executarScraper(cfg.id)
        .then((r) => {
          console.log(`[Scheduler] Scraper #${cfg.id}: ${r.success ? "sucesso" : "falhou"} (${r.productsScraped} produtos capturados).`);
          if (!r.success) {
            const detalhe = r.errors?.length ? `\nErros: ${r.errors.slice(0, 3).join("; ")}` : "";
            void notifyJobFailure(
              "Falha na captura agendada — Sistema S2",
              `A captura do fornecedor ${r.supplierName || `(config #${cfg.id})`} falhou.${detalhe}`,
            );
          }
        })
        .catch((err) => {
          console.error(`[Scheduler] Scraper #${cfg.id} falhou:`, (err as Error).message);
          void notifyJobFailure(
            "Falha na captura agendada — Sistema S2",
            `A captura do fornecedor (config #${cfg.id}) lançou erro: ${(err as Error).message}`,
          );
        });

      // Pequeno intervalo entre disparos para não sobrecarregar caso vários
      // fornecedores compartilhem o mesmo horário configurado.
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch (err) {
    console.error("[Scheduler] Falha ao verificar agendamentos de scraper:", (err as Error).message);
  }
}

/** Executa o backup do banco e aplica a retenção. */
export async function runBackupJob(): Promise<void> {
  const destDir = process.env.BACKUP_DIR || "backups";
  const keepDays = Number(process.env.BACKUP_KEEP_DAYS) || DEFAULT_BACKUP_KEEP_DAYS;
  const result = await runDatabaseBackup({ destDir });
  if (result.success) {
    const removidos = cleanupOldBackups(destDir, keepDays, Date.now());
    console.log(
      `[Scheduler] Backup concluído: ${result.file}` +
        (removidos > 0 ? ` (${removidos} backup(s) antigo(s) removido(s)).` : "."),
    );
  } else {
    console.error(`[Scheduler] Backup falhou: ${result.error}`);
    await notifyJobFailure(
      "Falha no backup automático — Sistema S2",
      `O backup diário do banco falhou: ${result.error ?? "erro desconhecido"}. ` +
        "Verifique o servidor — sem backup recente, um incidente pode causar perda de dados.",
    );
  }
}

/** Registra os jobs recorrentes. Chamado uma vez no boot. */
export function initScheduledJobs(): void {
  // 0. Jobs de IA que ficaram "executando" de um boot anterior → marcados como
  //    interrompidos (o runner morre junto com o processo).
  void import("../jobs/aiJobRunner")
    .then(({ recoverStaleAiJobs }) => recoverStaleAiJobs())
    .then((n) => {
      if (n > 0) console.warn(`[Scheduler] ${n} job(s) de IA interrompido(s) por restart foram marcados como erro.`);
    })
    .catch(() => undefined);

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

  // 3. Execução automática dos scrapers de fornecedores no horário configurado
  if (enabled(process.env.SCRAPER_SCHEDULE_ENABLED, true)) {
    const expr = process.env.SCRAPER_SCHEDULE_CRON || DEFAULT_SCRAPER_SCHEDULE_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, runScheduledScrapers, { timezone: SCRAPER_TIMEZONE });
      console.log(`[Scheduler] Execução automática de fornecedores agendada (verificação ${expr}, horário de Brasília).`);
    } else {
      console.warn(`[Scheduler] SCRAPER_SCHEDULE_CRON inválido: "${expr}" — agendamento automático de fornecedores desativado.`);
    }
  }

  // 4. Backup automático do banco (§16)
  if (enabled(process.env.BACKUP_ENABLED, true)) {
    const expr = process.env.BACKUP_CRON || DEFAULT_BACKUP_CRON;
    if (cron.validate(expr)) {
      cron.schedule(expr, () => { void runBackupJob(); });
      console.log(`[Scheduler] Backup automático do banco agendado (${expr}).`);
    } else {
      console.warn(`[Scheduler] BACKUP_CRON inválido: "${expr}" — backup automático desativado.`);
    }
  }
}
