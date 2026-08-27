/**
 * Logger estruturado do servidor.
 *
 * Em produção emite UMA linha JSON por evento ({ts, level, scope, msg, ...}),
 * pronta para ser coletada por qualquer agregador (Loki, CloudWatch, jq no
 * journalctl). Em desenvolvimento emite texto legível.
 *
 * A assinatura é compatível com console.* (varargs): strings são concatenadas
 * na mensagem e objetos/Erros viram campos estruturados — nada é descartado.
 *
 * Uso: import { logger } from "../_core/logger";
 *      logger.info("[Scraper] Execução concluída", { total: 42 });
 *      const log = logger.child("Scheduler"); log.warn("tick atrasado");
 */

import { reportError } from "./sentry";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const isProd = process.env.NODE_ENV === "production";

function minLevel(): number {
  const conf = (process.env.LOG_LEVEL ?? "").toLowerCase() as Level;
  return LEVEL_RANK[conf] ?? LEVEL_RANK.info;
}

function serializeArg(arg: unknown): { text?: string; fields?: Record<string, unknown> } {
  if (arg instanceof Error) {
    return { fields: { err: { message: arg.message, stack: arg.stack, name: arg.name } } };
  }
  if (typeof arg === "object" && arg !== null) {
    return { fields: { data: arg } };
  }
  return { text: String(arg) };
}

function emit(level: Level, scope: string | null, args: unknown[]) {
  if (LEVEL_RANK[level] < minLevel()) return;
  const parts: string[] = [];
  let fields: Record<string, unknown> = {};
  for (const arg of args) {
    const s = serializeArg(arg);
    if (s.text !== undefined) parts.push(s.text);
    if (s.fields) fields = { ...fields, ...s.fields };
  }
  const msg = parts.join(" ");
  if (level === "error") {
    // Ponto único de telemetria: todo logger.error() vai ao Sentry quando
    // SENTRY_DSN está configurado (no-op caso contrário).
    reportError(msg, args.find(a => a instanceof Error));
  }
  if (isProd) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      ...(scope ? { scope } : {}),
      msg,
      ...fields,
    });
    // stdout para info/debug, stderr para warn/error — padrão de coleta docker
    if (level === "warn" || level === "error") process.stderr.write(line + "\n");
    else process.stdout.write(line + "\n");
  } else {
    const prefix = scope ? `[${scope}] ` : "";
    const extra = Object.keys(fields).length ? [fields] : [];
    console[level === "debug" ? "log" : level](`${prefix}${msg}`, ...extra);
  }
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (scope: string) => Logger;
}

function makeLogger(scope: string | null): Logger {
  return {
    debug: (...args) => emit("debug", scope, args),
    info: (...args) => emit("info", scope, args),
    warn: (...args) => emit("warn", scope, args),
    error: (...args) => emit("error", scope, args),
    child: (childScope: string) => makeLogger(childScope),
  };
}

export const logger = makeLogger(null);

/**
 * Handlers de último recurso: crash e rejeição não tratada ficam registrados
 * em formato estruturado antes de derrubar/continuar o processo.
 */
export function installProcessErrorHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    logger.error("[Process] Promise rejeitada sem tratamento", reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.on("uncaughtException", (err) => {
    logger.error("[Process] Exceção não capturada — encerrando", err);
    // Estado do processo é indefinido após uncaughtException: sair e deixar o
    // orquestrador (docker restart:always) subir de novo é o caminho seguro.
    process.exit(1);
  });
}
