/**
 * Logger estruturado do servidor.
 *
 * Em produção emite UMA linha JSON por evento ({ts, level, scope, msg, ...}),
 * pronta para ser coletada por qualquer agregador (Loki, CloudWatch, jq no
 * journalctl). Em desenvolvimento emite texto legível.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const isProd = process.env.NODE_ENV === "production";
let processHandlersInstalled = false;
let shuttingDown = false;

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

function emit(level: Level, scope: string | null, args: unknown[]): void {
  if (LEVEL_RANK[level] < minLevel()) return;
  const parts: string[] = [];
  let fields: Record<string, unknown> = {};
  for (const arg of args) {
    const serialized = serializeArg(arg);
    if (serialized.text !== undefined) parts.push(serialized.text);
    if (serialized.fields) fields = { ...fields, ...serialized.fields };
  }
  const msg = parts.join(" ");
  if (isProd) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      ...(scope ? { scope } : {}),
      msg,
      ...fields,
    });
    if (level === "warn" || level === "error") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
    return;
  }
  const prefix = scope ? `[${scope}] ` : "";
  const extra = Object.keys(fields).length ? [fields] : [];
  console[level === "debug" ? "log" : level](`${prefix}${msg}`, ...extra);
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

async function gracefulProcessShutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[Process] ${signal} recebido — encerramento controlado.`);

  const cleanup = async () => {
    try {
      const [{ flushIntegrationTelemetry }, { closeEmailTransports }] = await Promise.all([
        import("../integrations/core/externalHttpClient"),
        import("../services/emailSenderService"),
      ]);
      closeEmailTransports();
      await flushIntegrationTelemetry();
    } catch (error) {
      logger.warn("[Process] Falha durante cleanup de shutdown.", error);
    }
  };

  // O orquestrador precisa recuperar o processo mesmo se DB/SMTP estiverem
  // indisponíveis. Cleanup auxiliar recebe orçamento máximo de 4 segundos.
  await Promise.race([
    cleanup(),
    new Promise<void>((resolve) => setTimeout(resolve, 4_000)),
  ]);
  process.exit(0);
}

/**
 * Handlers de último recurso. Registrados apenas uma vez para evitar listeners
 * duplicados em testes/hot reload.
 */
export function installProcessErrorHandlers(): void {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;

  process.on("unhandledRejection", (reason) => {
    logger.error(
      "[Process] Promise rejeitada sem tratamento",
      reason instanceof Error ? reason : new Error(String(reason)),
    );
  });
  process.on("uncaughtException", (error) => {
    logger.error("[Process] Exceção não capturada — encerrando", error);
    // Estado indefinido: não tentar cleanup complexo depois de uncaughtException.
    process.exit(1);
  });
  process.on("SIGTERM", () => {
    void gracefulProcessShutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void gracefulProcessShutdown("SIGINT");
  });
}
