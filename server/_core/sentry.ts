/**
 * Rastreamento de erros (Sentry) — no-op sem SENTRY_DSN.
 *
 * Sem a variável, initSentry() não inicializa nada e reportError() retorna
 * imediatamente: comportamento do servidor inalterado. Com DSN configurado,
 * todo logger.error() (tRPC, jobs agendados, process handlers) é replicado
 * para o painel do Sentry — um único ponto de integração, sem tocar cada
 * chamada.
 *
 * LGPD: sendDefaultPii desativado — IP, cookies e headers de identificação
 * não são enviados. Falha no envio nunca derruba o fluxo original.
 */
import * as Sentry from "@sentry/node";

let enabled = false;

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  enabled = true;
}

export function sentryEnabled(): boolean {
  return enabled;
}

/** Encaminha um erro já registrado no logger. Nunca lança. */
export function reportError(message: string, err?: unknown): void {
  if (!enabled) return;
  try {
    if (err instanceof Error) {
      Sentry.captureException(err, { extra: { message } });
    } else if (err !== undefined) {
      Sentry.captureMessage(message, { level: "error", extra: { err } });
    } else {
      Sentry.captureMessage(message, "error");
    }
  } catch {
    // Telemetria jamais interrompe o caminho principal.
  }
}

/** Somente para testes: restaura o estado desligado. */
export function _resetForTests(): void {
  enabled = false;
}
