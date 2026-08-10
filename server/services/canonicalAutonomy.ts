import { logger } from "../_core/logger";
import { reconcileCanonicalWorkflow } from "./canonicalOpportunityService";

const DEFAULT_INTERVAL_MINUTES = 5;
const GLOBAL_KEY = "__s2CanonicalAutonomyTimer";

type GlobalWithTimer = typeof globalThis & { [GLOBAL_KEY]?: NodeJS.Timeout };

function enabled(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  const flag = process.env.CANONICAL_RECONCILE_ENABLED;
  return flag !== "false" && flag !== "0";
}

async function run(): Promise<void> {
  try {
    const result = await reconcileCanonicalWorkflow();
    if (result.updated > 0) {
      logger.info(`[CanonicalAutonomy] ${result.updated} estado(s) reconciliado(s) em ${result.checked} registro(s) verificados.`);
    }
  } catch (error) {
    logger.error("[CanonicalAutonomy] Falha na reconciliação automática:", (error as Error).message);
  }
}

/**
 * Ativa a reconciliação interna do ciclo de oportunidade sem depender de
 * navegação, clique do usuário ou GitHub. Idempotente por processo e segura
 * para ser chamada mais de uma vez durante o boot/hot reload.
 */
export function initCanonicalAutonomy(): void {
  if (!enabled()) return;
  const globalState = globalThis as GlobalWithTimer;
  if (globalState[GLOBAL_KEY]) return;

  const requested = Number(process.env.CANONICAL_RECONCILE_INTERVAL_MINUTES ?? DEFAULT_INTERVAL_MINUTES);
  const minutes = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 60)) : DEFAULT_INTERVAL_MINUTES;
  const intervalMs = minutes * 60_000;

  const firstRun = setTimeout(() => { void run(); }, 10_000);
  firstRun.unref?.();

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  globalState[GLOBAL_KEY] = timer;
  logger.info(`[CanonicalAutonomy] Reconciliação automática ativa a cada ${minutes} minuto(s).`);
}
