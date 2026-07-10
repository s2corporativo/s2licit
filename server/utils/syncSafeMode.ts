/**
 * syncSafeMode.ts
 * Utilitários para execução segura de jobs de sincronização.
 *
 * Garante:
 * - Lock: evita execuções simultâneas do mesmo job
 * - Retry: tenta novamente em caso de falha transitória (ECONNRESET, timeout)
 * - Checkpoint: registra progresso para retomada parcial
 * - Indicadores: sync_last_run, sync_success_count, sync_error_count, sync_last_error
 * - Isolamento: se a sync quebrar, o sistema continua carregando normalmente
 */

export interface SyncIndicators {
  sync_last_run: string | null;
  sync_success_count: number;
  sync_error_count: number;
  sync_last_error: string | null;
  sync_last_result: string | null;
  is_running: boolean;
}

export interface SyncCheckpoint {
  jobName: string;
  lastProcessedKey: string | null;
  processedCount: number;
  startedAt: string;
  updatedAt: string;
}

/**
 * Cria um gerenciador de sync seguro para um job específico.
 * Uso: const sync = createSyncManager("LicitacoesJob");
 */
export function createSyncManager(jobName: string) {
  const indicators: SyncIndicators = {
    sync_last_run: null,
    sync_success_count: 0,
    sync_error_count: 0,
    sync_last_error: null,
    sync_last_result: null,
    is_running: false,
  };

  let checkpoint: SyncCheckpoint | null = null;

  function getIndicators(): SyncIndicators {
    return { ...indicators };
  }

  function getCheckpoint(): SyncCheckpoint | null {
    return checkpoint ? { ...checkpoint } : null;
  }

  function updateCheckpoint(lastProcessedKey: string, processedCount: number): void {
    if (!checkpoint) {
      checkpoint = {
        jobName,
        lastProcessedKey,
        processedCount,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } else {
      checkpoint.lastProcessedKey = lastProcessedKey;
      checkpoint.processedCount = processedCount;
      checkpoint.updatedAt = new Date().toISOString();
    }
  }

  function clearCheckpoint(): void {
    checkpoint = null;
  }

  /**
   * Executa a função fn com lock, retry e registro de indicadores.
   * Se fn lançar exceção, registra o erro e retorna sem propagar.
   * O sistema nunca quebra por causa de um job de sync.
   *
   * @param fn Função assíncrona a executar
   * @param options.maxRetries Número máximo de tentativas (padrão: 2)
   * @param options.retryDelayMs Delay base entre tentativas em ms (padrão: 2000)
   * @param options.isTransientError Função que decide se um erro merece retry
   */
  async function runSafe<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      retryDelayMs?: number;
      isTransientError?: (err: any) => boolean;
    } = {}
  ): Promise<T | null> {
    const {
      maxRetries = 2,
      retryDelayMs = 2_000,
      isTransientError = defaultIsTransientError,
    } = options;

    // Lock: evitar execução simultânea
    if (indicators.is_running) {
      console.log(`[${jobName}] Já em execução — ignorando disparo duplicado`);
      return null;
    }

    indicators.is_running = true;
    indicators.sync_last_run = new Date().toISOString();

    let lastError: any = null;
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      try {
        const result = await fn();
        // Sucesso
        indicators.sync_success_count++;
        indicators.sync_last_error = null;
        indicators.sync_last_result = `Concluído com sucesso (tentativa ${attempt}/${maxRetries})`;
        indicators.is_running = false;
        clearCheckpoint();
        console.log(`[${jobName}] Sync concluída com sucesso (tentativa ${attempt}/${maxRetries})`);
        return result;
      } catch (err: any) {
        lastError = err;
        const msg = err?.message ?? String(err);
        console.warn(`[${jobName}] Tentativa ${attempt}/${maxRetries} falhou: ${msg}`);

        if (attempt < maxRetries && isTransientError(err)) {
          const waitMs = retryDelayMs * attempt;
          console.log(`[${jobName}] Aguardando ${waitMs}ms antes de nova tentativa...`);
          await sleep(waitMs);
          continue;
        }
        break;
      }
    }

    // Todas as tentativas falharam
    const errorMsg = lastError?.message ?? String(lastError);
    indicators.sync_error_count++;
    indicators.sync_last_error = errorMsg;
    indicators.sync_last_result = null;
    indicators.is_running = false;
    console.error(`[${jobName}] Sync falhou após ${attempt} tentativa(s): ${errorMsg}`);
    // NÃO propagar o erro — o sistema continua funcionando
    return null;
  }

  return {
    runSafe,
    getIndicators,
    getCheckpoint,
    updateCheckpoint,
    clearCheckpoint,
  };
}

/**
 * Determina se um erro é transitório (merece retry).
 * Erros de rede, timeout e conexão são transitórios.
 * Erros de validação ou lógica não são.
 */
function defaultIsTransientError(err: any): boolean {
  const msg = (err?.message ?? err?.code ?? "").toLowerCase();
  return (
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("socket") ||
    msg.includes("failed query") ||
    (err?.cause?.code === "ECONNRESET")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
