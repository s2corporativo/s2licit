import crypto from "crypto";
import { getDb } from "../db";
import {
  supplierCredentials,
  supplierSessions,
  captureLogs,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const ENCRYPTION_ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-key-change-in-production";

/**
 * Encripta senha usando AES-256-CBC
 */
export function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

/**
 * Decripta senha
 */
export function decryptPassword(encryptedPassword: string): string {
  const parts = encryptedPassword.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encrypted = parts[1];
  const key = crypto.scryptSync(ENCRYPTION_KEY, "salt", 32);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Salva credenciais de fornecedor com segurança
 */
export async function saveSupplierCredentials(
  supplierId: number,
  authType: "username_password" | "api_key" | "oauth" | "session_token",
  credentials: {
    username?: string;
    password?: string;
    apiKey?: string;
    sessionToken?: string;
    notes?: string;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Verificar se já existe
  const existing = await db
    .select()
    .from(supplierCredentials)
    .where(eq(supplierCredentials.supplierId, supplierId))
    .limit(1);

  const encryptedPassword = credentials.password
    ? encryptPassword(credentials.password)
    : null;

  const data = {
    supplierId,
    authType,
    username: credentials.username || null,
    passwordEncrypted: encryptedPassword,
    apiKey: credentials.apiKey || null,
    sessionToken: credentials.sessionToken || null,
    notes: credentials.notes || null,
  };

  if (existing.length > 0) {
    await db
      .update(supplierCredentials)
      .set(data)
      .where(eq(supplierCredentials.supplierId, supplierId));
  } else {
    await db.insert(supplierCredentials).values(data);
  }
}

/**
 * Recupera credenciais (sem expor senha)
 */
export async function getSupplierCredentials(supplierId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const cred = await db
    .select()
    .from(supplierCredentials)
    .where(eq(supplierCredentials.supplierId, supplierId))
    .limit(1);

  if (cred.length === 0) return null;

  return {
    id: cred[0].id,
    authType: cred[0].authType,
    username: cred[0].username,
    apiKey: cred[0].apiKey,
    sessionToken: cred[0].sessionToken,
    notes: cred[0].notes,
    lastUsedAt: cred[0].lastUsedAt,
  };
}

/**
 * Recupera credenciais com senha descriptografada (apenas internamente)
 */
export async function getSupplierCredentialsWithPassword(supplierId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const cred = await db
    .select()
    .from(supplierCredentials)
    .where(eq(supplierCredentials.supplierId, supplierId))
    .limit(1);

  if (cred.length === 0) return null;

  return {
    id: cred[0].id,
    authType: cred[0].authType,
    username: cred[0].username,
    password: cred[0].passwordEncrypted
      ? decryptPassword(cred[0].passwordEncrypted)
      : null,
    apiKey: cred[0].apiKey,
    sessionToken: cred[0].sessionToken,
  };
}

/**
 * Cria ou atualiza sessão de fornecedor
 */
export async function createOrUpdateSession(
  supplierId: number,
  sessionData: {
    cookies?: Record<string, string>;
    sessionToken?: string;
    authHeader?: string;
    status: "active" | "expired" | "invalid" | "pending";
    expiresAt?: Date;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const existing = await db
    .select()
    .from(supplierSessions)
    .where(eq(supplierSessions.supplierId, supplierId))
    .limit(1);

  const data = {
    supplierId,
    cookies: sessionData.cookies ? JSON.stringify(sessionData.cookies) : null,
    sessionToken: sessionData.sessionToken || null,
    authHeader: sessionData.authHeader || null,
    status: sessionData.status,
    lastAuthAt: new Date(),
    expiresAt: sessionData.expiresAt || null,
  };

  if (existing.length > 0) {
    await db
      .update(supplierSessions)
      .set(data)
      .where(eq(supplierSessions.supplierId, supplierId));
  } else {
    await db.insert(supplierSessions).values(data);
  }
}

/**
 * Recupera sessão ativa de fornecedor
 */
export async function getActiveSession(supplierId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const session = await db
    .select()
    .from(supplierSessions)
    .where(eq(supplierSessions.supplierId, supplierId))
    .limit(1);

  if (session.length === 0) return null;

  const sess = session[0];

  // Verificar expiração
  if (sess.expiresAt && new Date() > sess.expiresAt) {
    await createOrUpdateSession(supplierId, {
      status: "expired",
    });
    return null;
  }

  return {
    id: sess.id,
    cookies: sess.cookies ? JSON.parse(sess.cookies) : {},
    sessionToken: sess.sessionToken,
    authHeader: sess.authHeader,
    status: sess.status,
    lastAuthAt: sess.lastAuthAt,
    expiresAt: sess.expiresAt,
  };
}

/**
 * Invalida sessão
 */
export async function invalidateSession(supplierId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db
    .update(supplierSessions)
    .set({ status: "invalid" })
    .where(eq(supplierSessions.supplierId, supplierId));
}

/**
 * Log de autenticação
 */
export async function logAuthAttempt(
  supplierId: number,
  success: boolean,
  message: string,
  errorDetails?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // Criar log de captura para registrar tentativa de autenticação
  await db.insert(captureLogs).values({
    supplierId,
    startedAt: new Date(),
    completedAt: new Date(),
    durationSeconds: 0,
    status: success ? "completed" : "failed",
    errorMessage: success ? `Auth: ${message}` : `Auth failed: ${message}. ${errorDetails || ""}`,
  });
}

/**
 * Atualiza último uso de credencial
 */
export async function updateCredentialLastUsed(supplierId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db
    .update(supplierCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(supplierCredentials.supplierId, supplierId));
}
