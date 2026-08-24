import { spawn } from "node:child_process";

export interface OffsiteCopyResult {
  attempted: boolean;
  success: boolean;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_STDERR_CHARS = 4_000;

export function isOffsiteBackupConfigured(env = process.env): boolean {
  return Boolean(env.BACKUP_OFFSITE_COMMAND?.trim());
}

/**
 * Quando existe destino externo configurado, falhar a cópia é fatal por
 * padrão. O operador pode torná-la best-effort explicitamente com
 * BACKUP_OFFSITE_REQUIRED=false.
 */
export function isOffsiteBackupRequired(env = process.env): boolean {
  if (!isOffsiteBackupConfigured(env)) return false;
  return env.BACKUP_OFFSITE_REQUIRED !== "false";
}

function timeoutMs(env = process.env): number {
  const value = Number(env.BACKUP_OFFSITE_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1_000 && value <= 60 * 60 * 1000
    ? value
    : DEFAULT_TIMEOUT_MS;
}

/**
 * Executa a cópia externa configurada pelo administrador. O comando pode usar
 * $BACKUP_FILE (ex.: rclone/restic). O shell é intencional porque essa string é
 * configuração privilegiada de infraestrutura, nunca input de usuário/tRPC.
 */
export function copyBackupOffsite(
  file: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OffsiteCopyResult> {
  const command = env.BACKUP_OFFSITE_COMMAND?.trim();
  if (!command) return Promise.resolve({ attempted: false, success: false });

  return new Promise((resolve) => {
    let settled = false;
    let stderr = "";
    const finish = (result: OffsiteCopyResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn("/bin/sh", ["-c", command], {
      env: { ...env, BACKUP_FILE: file },
      stdio: ["ignore", "ignore", "pipe"],
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        attempted: true,
        success: false,
        error: `Cópia externa excedeu ${timeoutMs(env)} ms`,
      });
    }, timeoutMs(env));

    child.stderr.on("data", (chunk) => {
      if (stderr.length >= MAX_STDERR_CHARS) return;
      stderr += String(chunk).slice(0, MAX_STDERR_CHARS - stderr.length);
    });
    child.on("error", (err) => finish({ attempted: true, success: false, error: err.message }));
    child.on("close", (code) => finish(
      code === 0
        ? { attempted: true, success: true }
        : {
            attempted: true,
            success: false,
            error: `Comando externo saiu com código ${code}: ${stderr.trim()}`,
          },
    ));
  });
}
