import { eq } from "drizzle-orm";
import { users, type User } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "./env";
import { logger } from "./logger";

/**
 * Identidade do usuário sintético usado quando AUTH_DISABLED=true.
 *
 * O modo precisa de um usuário REAL na tabela `users`, não de um id inventado:
 * nove colunas do schema (`audit_logs.userId`, `capture_batches.createdByUserId`,
 * `agenticseek_buscas.userId`, entre outras) têm FOREIGN KEY para `users.id`.
 * Um id fictício como -1 faz o MySQL rejeitar o INSERT com errno 1452 — e como
 * esses fluxos gravam em duas tabelas sem transação, a linha de negócio já ficou
 * gravada quando o log de auditoria falha: o usuário vê HTTP 500, repete a ação
 * e duplica o registro, sem rastro nenhum na auditoria.
 *
 * O e-mail e o nome deixam explícito na auditoria que a ação veio do modo sem
 * autenticação — o rastro continua legível, apenas não identifica uma pessoa.
 */
export const AUTH_DISABLED_OPEN_ID = "auth-disabled-local";
export const AUTH_DISABLED_EMAIL = "auth-disabled@local.invalid";
export const AUTH_DISABLED_NAME = "[AUTH_DISABLED]";

let cachedUser: User | null = null;
let pending: Promise<User | null> | null = null;

async function loadOrCreate(): Promise<User | null> {
  const db = await getDb();
  if (!db) return null;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.openId, AUTH_DISABLED_OPEN_ID))
    .limit(1);
  if (existing[0]) return existing[0];

  await db.insert(users).values({
    openId: AUTH_DISABLED_OPEN_ID,
    email: AUTH_DISABLED_EMAIL,
    name: AUTH_DISABLED_NAME,
    role: "admin",
    loginMethod: "auth-disabled",
  });

  const created = await db
    .select()
    .from(users)
    .where(eq(users.openId, AUTH_DISABLED_OPEN_ID))
    .limit(1);
  return created[0] ?? null;
}

/**
 * Devolve (criando na primeira chamada) o usuário real do modo AUTH_DISABLED.
 * Chamadas concorrentes compartilham a mesma promise para não tentar dois
 * INSERTs — `openId` é UNIQUE e o segundo falharia.
 */
export async function getAuthDisabledUser(): Promise<User | null> {
  if (!ENV.authDisabled) return null;
  if (cachedUser) return cachedUser;
  if (!pending) {
    pending = loadOrCreate()
      .then(user => {
        cachedUser = user;
        return user;
      })
      .catch(err => {
        logger.error("[AUTH_DISABLED] Falha ao preparar o usuário do modo sem autenticação:", err);
        return null;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}
