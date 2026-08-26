import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { credentialEncryptionService } from "../services/credentialEncryptionService";
import { recordAudit, requestOrigin } from "../services/auditService";
import { verifyTotp } from "../services/totp";
import { decryptPassword } from "../utils/encryption";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { logger } from "./logger";

/**
 * Política de bloqueio de conta (§16): após MAX_FAILED_LOGINS tentativas
 * inválidas consecutivas, a conta fica bloqueada por LOCKOUT_MS. O contador
 * zera em qualquer login bem-sucedido.
 */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export function nextLockoutState(
  currentFailed: number,
  now: number,
): { failedLoginAttempts: number; lockedUntil: Date | null } {
  const failed = (currentFailed ?? 0) + 1;
  if (failed >= MAX_FAILED_LOGINS) {
    return { failedLoginAttempts: 0, lockedUntil: new Date(now + LOCKOUT_MS) };
  }
  return { failedLoginAttempts: failed, lockedUntil: null };
}

export function isAccountLocked(lockedUntil: Date | null | undefined, now: number): boolean {
  return lockedUntil != null && new Date(lockedUntil).getTime() > now;
}

const LOCAL_OPEN_ID_PREFIX = "local:";

/**
 * Valida a existência de users.passwordHash. Em produção, coluna ausente é
 * erro fatal de migration; não alteramos mais schema silenciosamente no boot.
 * Não há fallback de DDL; qualquer ausência exige migration versionada.
 */
export async function ensurePasswordColumn(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [rows] = await db.execute(
    sql`SELECT COUNT(*) as total FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'passwordHash'`
  );
  const total = Number((rows as any)[0]?.total ?? 0);
  if (total > 0) return;
  throw new Error("[LocalAuth] users.passwordHash ausente. Aplique uma migration versionada antes de iniciar a aplicação.");
}

/** Cria/atualiza o administrador inicial a partir do ambiente. */
export async function ensureAdminUser(): Promise<void> {
  if (!ENV.adminEmail || !ENV.adminPassword) return;
  const db = await getDb();
  if (!db) return;

  const email = ENV.adminEmail.trim().toLowerCase();
  const passwordHash = credentialEncryptionService.hashPassword(ENV.adminPassword);
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing.length === 0) {
    await db.insert(users).values({
      openId: `${LOCAL_OPEN_ID_PREFIX}${email}`,
      name: "Administrador",
      email,
      loginMethod: "local",
      passwordHash,
      role: "admin",
    });
    logger.info(`[LocalAuth] Usuário administrador criado: ${email}`);
  } else if (!existing[0].passwordHash) {
    await db.update(users)
      .set({ passwordHash, role: "admin", loginMethod: "local", failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, existing[0].id));
    logger.info(`[LocalAuth] Senha definida para o administrador existente: ${email}`);
  } else if (ENV.adminPasswordForceReset) {
    // Reset deliberado: só acontece com ADMIN_PASSWORD_FORCE_RESET=true.
    await db.update(users)
      .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, existing[0].id));
    logger.warn(
      `[LocalAuth] ADMIN_PASSWORD_FORCE_RESET=true — senha de ${email} redefinida pelo .env e conta desbloqueada. ` +
      "Volte a variável para false para que trocas feitas na interface não sejam desfeitas no próximo boot.",
    );
  } else if (!credentialEncryptionService.verifyPassword(ENV.adminPassword, existing[0].passwordHash)) {
    // NÃO sobrescrever: a senha em uso diverge do .env porque o administrador
    // a trocou pela tela de usuários. O comportamento anterior reescrevia o
    // hash a cada boot, desfazendo a troca em silêncio — o admin voltava a ser
    // barrado com a senha nova depois de qualquer restart/deploy e, ao insistir,
    // caía no bloqueio por tentativas inválidas.
    logger.info(
      `[LocalAuth] Senha de ${email} difere de ADMIN_PASSWORD e foi PRESERVADA (troca feita na interface). ` +
      "Para forçar a senha do .env, suba uma vez com ADMIN_PASSWORD_FORCE_RESET=true.",
    );
  }
}

function readBody(req: Request): { email?: string; password?: string; name?: string; token?: string } {
  const body = req.body ?? {};
  return {
    email: typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    name: typeof body.name === "string" ? body.name.trim() : undefined,
    token: typeof body.token === "string" ? body.token.trim() : undefined,
  };
}

export function registerLocalAuthRoutes(app: Express) {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, token } = readBody(req);
      if (!email || !password) {
        res.status(400).json({ error: "Informe e-mail e senha." });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Banco de dados indisponível." });
        return;
      }

      const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const user = found[0];
      const now = Date.now();
      const origin = requestOrigin(req);

      if (user && isAccountLocked(user.lockedUntil, now)) {
        const retryAfter = Math.ceil((new Date(user.lockedUntil!).getTime() - now) / 1000);
        res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
        await recordAudit({
          userId: user.id, action: "login_bloqueado", entity: "auth", entityId: user.id,
          origin: "login", summary: `Login negado — conta bloqueada até ${new Date(user.lockedUntil!).toISOString()}`,
          ...origin,
        });
        // Dizer quanto falta evita o ciclo "tento de novo → renovo a espera"
        // e distingue bloqueio de senha errada para quem está na tela.
        const minutos = Math.max(1, Math.ceil(retryAfter / 60));
        res.status(429).json({
          error:
            `Conta temporariamente bloqueada após ${MAX_FAILED_LOGINS} tentativas inválidas. ` +
            `Tente novamente em ${minutos} min, ou peça a um administrador para desbloquear.`,
          lockedForMinutes: minutos,
        });
        return;
      }

      if (user?.disabled) {
        await recordAudit({
          userId: user.id, action: "login_bloqueado", entity: "auth", entityId: user.id,
          origin: "login", summary: "Login negado — conta desativada", ...origin,
        });
        res.status(403).json({ error: "Esta conta está desativada. Contate o administrador." });
        return;
      }

      if (!user?.passwordHash || !credentialEncryptionService.verifyPassword(password, user.passwordHash)) {
        if (user) {
          const lock = nextLockoutState(user.failedLoginAttempts ?? 0, now);
          await db.update(users)
            .set({ failedLoginAttempts: lock.failedLoginAttempts, lockedUntil: lock.lockedUntil })
            .where(eq(users.id, user.id));
          await recordAudit({
            userId: user.id, action: "login_falha", entity: "auth", entityId: user.id, origin: "login",
            summary: lock.lockedUntil
              ? `Senha inválida — conta bloqueada por ${Math.round(LOCKOUT_MS / 60000)} min`
              : "Senha inválida",
            ...origin,
          });
        } else {
          await recordAudit({
            action: "login_falha", entity: "auth", origin: "login",
            summary: "Tentativa de login para e-mail inexistente", ...origin,
          });
        }
        res.status(401).json({ error: "E-mail ou senha incorretos." });
        return;
      }

      if (user.mfaEnabled) {
        if (!token) {
          res.status(401).json({ error: "Código de verificação (MFA) necessário.", mfaRequired: true });
          return;
        }
        let secret: string | null = null;
        try { secret = user.mfaSecret ? decryptPassword(user.mfaSecret) : null; }
        catch { secret = null; }
        if (!secret || !verifyTotp(secret, token, Date.now())) {
          const lock = nextLockoutState(user.failedLoginAttempts ?? 0, now);
          await db.update(users)
            .set({ failedLoginAttempts: lock.failedLoginAttempts, lockedUntil: lock.lockedUntil })
            .where(eq(users.id, user.id));
          await recordAudit({
            userId: user.id, action: "login_falha", entity: "auth", entityId: user.id,
            origin: "login", summary: "Código MFA inválido", ...origin,
          });
          res.status(401).json({ error: "Código de verificação inválido.", mfaRequired: true });
          return;
        }
      }

      await db.update(users)
        .set({ lastSignedIn: new Date(), failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(users.id, user.id));

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name ?? undefined,
        expiresInMs: SESSION_TTL_MS,
        sessionVersion: user.sessionVersion ?? 0,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      await recordAudit({
        userId: user.id, action: "login_sucesso", entity: "auth", entityId: user.id,
        origin: "login", summary: "Login local bem-sucedido", ...origin,
      });

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          mfaEnabled: user.mfaEnabled,
        },
      });
    } catch (error) {
      logger.error("[LocalAuth] Falha no login:", error);
      res.status(500).json({ error: "Falha interna de autenticação." });
    }
  });
}
