import mysql from "mysql2/promise";

export type DistributedJobResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

/**
 * MySQL named lock mantido em conexão dedicada durante todo o job.
 *
 * Não usa o pool do Drizzle porque GET_LOCK/RELEASE_LOCK são vinculados à
 * conexão; usar duas consultas do pool poderia adquirir e liberar em conexões
 * diferentes. Falha ao obter a trava NÃO executa o job sem proteção.
 */
export async function withDistributedJobLock<T>(
  name: string,
  task: () => Promise<T>,
): Promise<DistributedJobResult<T>> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para trava distribuída de jobs.");
  if (!name || name.length > 64) throw new Error("Nome de trava MySQL inválido.");

  const connection = await mysql.createConnection(databaseUrl);
  let acquired = false;
  try {
    const [rows] = await connection.execute("SELECT GET_LOCK(?, 0) AS acquired", [name]);
    const first = Array.isArray(rows) ? rows[0] : undefined;
    acquired = Boolean(
      first && typeof first === "object" && "acquired" in first && Number((first as { acquired?: number }).acquired) === 1,
    );
    if (!acquired) return { acquired: false };
    return { acquired: true, value: await task() };
  } finally {
    if (acquired) {
      await connection.execute("SELECT RELEASE_LOCK(?)", [name]).catch(() => undefined);
    }
    await connection.end().catch(() => undefined);
  }
}
