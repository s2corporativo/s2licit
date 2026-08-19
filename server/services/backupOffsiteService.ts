import { spawn } from "node:child_process";

export interface OffsiteCopyResult {
  attempted: boolean;
  success: boolean;
  error?: string;
}

/**
 * Executa um comando de cópia externa configurado pelo administrador.
 * BACKUP_OFFSITE_COMMAND pode usar $BACKUP_FILE, por exemplo com rclone/restic.
 * O shell é intencional aqui porque o comando é configuração privilegiada de
 * infraestrutura, nunca input de usuário/tRPC.
 */
export function copyBackupOffsite(file: string): Promise<OffsiteCopyResult> {
  const command = process.env.BACKUP_OFFSITE_COMMAND?.trim();
  if (!command) return Promise.resolve({ attempted: false, success: false });
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], {
      env: { ...process.env, BACKUP_FILE: file },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (err) => resolve({ attempted: true, success: false, error: err.message }));
    child.on("close", (code) => resolve(
      code === 0
        ? { attempted: true, success: true }
        : { attempted: true, success: false, error: `Comando externo saiu com código ${code}: ${stderr.trim()}` },
    ));
  });
}
