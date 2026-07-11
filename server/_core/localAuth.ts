import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { credentialEncryptionService } from "../services/credentialEncryptionService";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

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

      // Mensagem idêntica para usuário inexistente e senha errada
      // (não revelar quais e-mails existem).
      if (!user?.passwordHash || !credentialEncryptionService.verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: "E-mail ou senha incorretos." });
        return;
      }

      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name ?? "",
        expiresInMs: SESSION_TTL_MS,
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

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
