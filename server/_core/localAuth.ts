import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { credentialEncryptionService } from "../services/credentialEncryptionService";
import { recordAudit, requestOrigin } from "../services/auditService";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

/**
 * Política de bloqueio de conta (§16): após MAX_FAILED_LOGINS tentativas
 * inválidas consecutivas, a conta fica bloqueada por LOCKOUT_MS. O contador
 * zera em qualquer login bem-sucedido.
 */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutos

/** Estado do bloqueio após uma tentativa inválida (função pura, testável). */
export function nextLockoutState(
  currentFailed: number,
  now: number,
): { failedLoginAttempts: number; lockedUntil: Date | null } {
  const failed = (currentFailed ?? 0) + 1;
  if (failed >= MAX_FAILED_LOGINS) {
    // Bloqueia e reinicia o contador para a próxima janela.
    return { failedLoginAttempts: 0, lockedUntil: new Date(now + LOCKOUT_MS) };
  }
  return { failedLoginAttempts: failed, lockedUntil: null };
}

/** A conta está bloqueada agora? (função pura, testável). */
export function isAccountLocked(lockedUntil: Date | null | undefined, now: number): boolean {
  return lockedUntil != null && new Date(lockedUntil).getTime() > now;
}

/**
 * Autenticação local por e-mail e senha.
 *
 * Substitui o OAuth da plataforma Manus como modo padrão de login. A sessão
 * emitida é o mesmo JWT httpOnly usado pelo fluxo OAuth (sdk.signSession),
 * então o restante do sistema (context, protectedProcedure) não muda.
 */

const LOCAL_OPEN_ID_PREFIX = "local:";

/**
 * Garante que a coluna users.passwordHash exista. O histórico de migrações
 * do projeto tem três esquemas paralelos e nem todo ambiente os executa;
 * este guard torna o login local independente desse estado.
 */
export async function ensurePasswordColumn(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [rows] = await db.execute(
    sql`SELECT COUNT(*) as total FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'passwordHash'`
  );
  const total = Number((rows as any)[0]?.total ?? 0);
  if (total === 0) {
    await db.execute(sql`ALTER TABLE users ADD COLUMN passwordHash VARCHAR(255) NULL`);
    console.log("[LocalAuth] Coluna users.passwordHash criada.");
  }
}

/**
 * Cria (ou atualiza a senha de) o administrador inicial a partir de
 * ADMIN_EMAIL/ADMIN_PASSWORD. Chamado uma vez no boot.
 */
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
    console.log(`[LocalAuth] Usuário administrador criado: ${email}`);
  } else if (!existing[0].passwordHash) {
    await db
      .update(users)
      .set({ passwordHash, role: "admin", loginMethod: "local" })
      .where(eq(users.id, existing[0].id));
    console.log(`[LocalAuth] Senha definida para o administrador existente: ${email}`);
  } else if (!credentialEncryptionService.verifyPassword(ENV.adminPassword, existing[0].passwordHash)) {
    // ADMIN_PASSWORD do ambiente é a fonte de verdade: se mudou, sincroniza.
    // (Sistema de uso interno single-user — trocar a senha = trocar o env e reiniciar.)
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, existing[0].id));
    console.log(`[LocalAuth] Senha do administrador sincronizada com ADMIN_PASSWORD: ${email}`);
  }
}

function readBody(req: Request): { email?: string; password?: string; name?: string } {
  const body = req.body ?? {};
  return {
    email: typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    name: typeof body.name === "string" ? body.name.trim() : undefined,
  };
}

export function registerLocalAuthRoutes(app: Express) {
  // POST /api/auth/login — protegido pelo authRateLimiter (10/min por IP)
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = readBody(req);
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

      // Conta bloqueada por tentativas inválidas: nega antes de verificar a senha.
      if (user && isAccountLocked(user.lockedUntil, now)) {
        const retryAfter = Math.ceil((new Date(user.lockedUntil!).getTime() - now) / 1000);
        res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
        await recordAudit({
          userId: user.id, action: "login_bloqueado", entity: "auth", entityId: user.id,
          origin: "login", summary: `Login negado — conta bloqueada até ${new Date(user.lockedUntil!).toISOString()}`,
          ...origin,
        });
        res.status(429).json({ error: "Conta temporariamente bloqueada por tentativas inválidas. Tente novamente mais tarde." });
        return;
      }

      // Mensagem idêntica para usuário inexistente e senha errada
      // (não revelar quais e-mails existem).
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

      // Sucesso: zera o contador de tentativas e desbloqueia.
      await db.update(users)
        .set({ lastSignedIn: new Date(), failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(users.id, user.id));

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name ?? "",
        expiresInMs: SESSION_TTL_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

      await recordAudit({
        userId: user.id, action: "login_sucesso", entity: "auth", entityId: user.id,
        origin: "login", summary: `Login bem-sucedido (${user.role})`, ...origin,
      });

      res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch (err) {
      console.error("[LocalAuth] Falha no login:", err);
      res.status(500).json({ error: "Erro interno ao processar o login." });
    }
  });
}
