import { sql } from "drizzle-orm";
import { logger } from "../_core/logger";
import { getDb } from "../db";
import { reconcileCanonicalWorkflow } from "./canonicalOpportunityService";

const DEFAULT_INTERVAL_MINUTES = 5;
const FIRST_RUN_DELAY_MS = 30_000;
const GLOBAL_TIMER_KEY = "__s2CanonicalAutonomyTimer";
const GLOBAL_FIRST_RUN_KEY = "__s2CanonicalAutonomyFirstRun";

type GlobalWithTimers = typeof globalThis & {
  [GLOBAL_TIMER_KEY]?: NodeJS.Timeout;
  [GLOBAL_FIRST_RUN_KEY]?: NodeJS.Timeout;
};

function enabled(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  const flag = process.env.CANONICAL_RECONCILE_ENABLED;
  return flag !== "false" && flag !== "0";
}

async function schemaReady(): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    await db.execute(sql`SELECT id FROM funil_oportunidades LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

export async function runCanonicalAutonomyOnce(): Promise<void> {
  if (!(await schemaReady())) {
    logger.info("[CanonicalAutonomy] Schema ainda não está pronto; ciclo adiado.");
    return;
  }

  try {
    const result = await reconcileCanonicalWorkflow();
    if (result.skippedBecauseLocked) {
      logger.info("[CanonicalAutonomy] Outro processo já executa a reconciliação; ciclo ignorado.");
      return;
    }
    if (result.updated > 0) {
      logger.info(
        `[CanonicalAutonomy] ${result.updated} estado(s) reconciliado(s) em ${result.checked} registro(s) verificados.`,
      );
    }
  } catch (error) {
    logger.error("[CanonicalAutonomy] Falha na reconciliação automática", error);
  }
}

/**
 * Compatibilidade de boot: o agendamento ainda pode ser registrado durante a
 * composição dos routers, mas nenhum acesso a tabelas ocorre antes do probe de
 * prontidão. O reconciliador possui lock distribuído MySQL, então múltiplos pods
 * podem registrar o timer sem executar o mesmo ciclo em paralelo.
 */
export function initCanonicalAutonomy(): void {
  if (!enabled()) return;
  const globalState = globalThis as GlobalWithTimers;
  if (globalState[GLOBAL_TIMER_KEY]) return;

  const requested = Number(
    process.env.CANONICAL_RECONCILE_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES,
  );
  const minutes = Number.isFinite(requested)
    ? Math.max(1, Math.min(Math.trunc(requested), 60))
    : DEFAULT_INTERVAL_MINUTES;
  const intervalMs = minutes * 60_000;

  const firstRun = setTimeout(() => {
    void runCanonicalAutonomyOnce();
  }, FIRST_RUN_DELAY_MS);
  firstRun.unref?.();
  globalState[GLOBAL_FIRST_RUN_KEY] = firstRun;

  const timer = setInterval(() => {
    void runCanonicalAutonomyOnce();
  }, intervalMs);
  timer.unref?.();
  globalState[GLOBAL_TIMER_KEY] = timer;

  logger.info(
    `[CanonicalAutonomy] Reconciliação automática registrada a cada ${minutes} minuto(s), protegida por readiness + lock distribuído.`,
  );
}
