import { drizzle } from "drizzle-orm/mysql2";
import mysql2 from "mysql2/promise";
import { logger } from "../_core/logger";

let _db: ReturnType<typeof drizzle> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Retorna instância do banco com pool de conexões MySQL2.
 * Pool evita ECONNRESET em produção com carga concorrente.
 */
export async function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) {
    // Em produção, banco ausente é erro de configuração — falhar ruidosamente
    // é melhor do que servir "catálogo vazio" como se fosse sucesso.
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL não configurada — banco de dados indisponível");
    }
    return null;
  }
  try {
    const pool = mysql2.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
      connectTimeout: 10000,
    });
    _db = drizzle(pool) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.info("[Database] Pool de conexões iniciado (limit=10)");
  } catch (error) {
    logger.warn("[Database] Falha ao criar pool:", error);
    _db = null;
  }
  return _db;
}

/** @deprecated Pool gerencia reconexões automaticamente — mantido por compatibilidade */
export function resetDb() {
  _db = null;
}
