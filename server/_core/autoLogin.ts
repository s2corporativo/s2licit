import { eq } from "drizzle-orm";
import { users, type User } from "../../drizzle/schema";
import { getDb } from "../db";
import { logger } from "./logger";

/** openId fixo do usuário injetado quando o login está desativado. */
export const AUTO_LOGIN_OPEN_ID = "local:acesso-livre";

let cached: User | null = null;

/** Limpa o cache em memória (uso em testes). */
export function resetAutoLoginCache(): void {
  cached = null;
}

/**
 * Usuário padrão para o modo sem login (REQUIRE_LOGIN != "true"): toda
 * requisição sem sessão entra como este usuário, com perfil admin.
 *
 * Precisa ser uma linha real em `users` — auditoria, lotes de importação e
 * captura referenciam ctx.user.id. Criado sob demanda no primeiro acesso e
 * cacheado em memória; sem banco disponível, devolve null e o comportamento
 * volta ao de requisição não autenticada.
 */
export async function getAutoLoginUser(): Promise<User | null> {
  if (cached) return cached;

  const db = await getDb();
  if (!db) return null;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.openId, AUTO_LOGIN_OPEN_ID))
    .limit(1);

  if (existing.length > 0) {
    cached = existing[0];
    return cached;
  }

  try {
    await db.insert(users).values({
      openId: AUTO_LOGIN_OPEN_ID,
      name: "Acesso Livre",
      loginMethod: "none",
      role: "admin",
    });
    logger.info("[AutoLogin] Usuário de acesso livre criado (login desativado).");
  } catch {
    // Corrida entre requisições simultâneas: outra já inseriu a linha
    // (openId é único) — o select abaixo resolve para as duas.
  }

  const created = await db
    .select()
    .from(users)
    .where(eq(users.openId, AUTO_LOGIN_OPEN_ID))
    .limit(1);
  cached = created[0] ?? null;
  return cached;
}
