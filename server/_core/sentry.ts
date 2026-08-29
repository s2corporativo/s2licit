/**
 * Rastreamento de erros (Sentry) — no-op sem SENTRY_DSN.
 *
 * Sem a variável, initSentry() não carrega nem inicializa nada e reportError()
 * retorna imediatamente: comportamento do servidor inalterado. Com DSN
 * configurado, todo logger.error() (tRPC, jobs agendados, process handlers) é
 * replicado para o painel do Sentry — um único ponto de integração, sem tocar
 * cada chamada.
 *
 * O `@sentry/node` é carregado por import DINÂMICO, só quando há DSN. Import
 * estático colocaria a biblioteca inteira no grafo de módulos do `logger` —
 * que o `sdk` importa — encarecendo o boot do servidor mesmo com o Sentry
 * desligado (o padrão hoje) e o carregamento do módulo nos testes.
 *
 * LGPD: sendDefaultPii desativado — IP, cookies e headers de identificação
 * não são enviados. Falha no envio nunca derruba o fluxo original.
 */
type SentryModule = typeof import("@sentry/node");

let sentry: SentryModule | null = null;

export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const mod = await import("@sentry/node");
  mod.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  sentry = mod;
}

export function sentryEnabled(): boolean {
  return sentry !== null;
}

/** Encaminha um erro já registrado no logger. Nunca lança. */
export function reportError(message: string, err?: unknown): void {
  if (!sentry) return;
  try {
    if (err instanceof Error) {
      sentry.captureException(err, { extra: { message } });
    } else if (err !== undefined) {
      sentry.captureMessage(message, { level: "error", extra: { err } });
    } else {
      sentry.captureMessage(message, "error");
    }
  } catch {
    // Telemetria jamais interrompe o caminho principal.
  }
}

/** Somente para testes: restaura o estado desligado. */
export function _resetForTests(): void {
  sentry = null;
}
