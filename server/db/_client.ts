import { drizzle } from "drizzle-orm/mysql2";
import mysql2, { type Pool } from "mysql2/promise";
import { logger } from "../_core/logger";

let _db: ReturnType<typeof drizzle> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
let _pool: Pool | null = null;

/**
 * Retorna instância do banco com pool de conexões MySQL2.
 * Pool evita ECONNRESET em produção com carga concorrente.
 */
export async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL não configurada — banco de dados indisponível");
    }
    return null;
  }
  try {
    _pool = mysql2.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
      connectTimeout: 10000,
    });
    _db = drizzle(_pool) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.info("[Database] Pool de conexões iniciado (limit=10)");
  } catch (error) {
    logger.warn("[Database] Falha ao criar pool:", error);
    _db = null;
    _pool = null;
  }
  return _db;
}

async function ensurePool(): Promise<Pool | null> {
  if (_pool) return _pool;
  await getDb();
  return _pool;
}

/**
 * Executa uma tarefa protegida por MySQL GET_LOCK usando a MESMA conexão até
 * RELEASE_LOCK. O lock coordena múltiplos processos/replicas sem Redis e é
 * liberado pelo MySQL automaticamente se a conexão morrer.
 *
 * timeoutSeconds=0 faz aquisição não bloqueante: se outro worker já executa o
 * job, este ciclo é simplesmente ignorado.
 */
export async function withDatabaseAdvisoryLock<T>(
  name: string,
  task: () => Promise<T>,
  timeoutSeconds = 0,
): Promise<{ acquired: boolean; result?: T }> {
  const pool = await ensurePool();
  if (!pool) {
    // Em desenvolvimento sem banco, não fingimos coordenação distribuída.
    return { acquired: false };
  }
  const lockName = `s2:${name}`.slice(0, 64);
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query("SELECT GET_LOCK(?, ?) AS acquired", [
      lockName,
      Math.max(0, timeoutSeconds),
    ]);
    const acquired = Number((rows as Array<{ acquired?: number }>)[0]?.acquired ?? 0) === 1;
    if (!acquired) return { acquired: false };

    try {
      return { acquired: true, result: await task() };
    } finally {
      await connection.query("SELECT RELEASE_LOCK(?) AS released", [lockName]).catch(() => undefined);
    }
  } finally {
    connection.release();
  }
}

/** @deprecated Pool gerencia reconexões automaticamente — mantido por compatibilidade */
export function resetDb() {
  const pool = _pool;
  _db = null;
  _pool = null;
  if (pool) void pool.end().catch(() => undefined);
}
