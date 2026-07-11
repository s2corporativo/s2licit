/**
 * Encryption utilities for sensitive data (passwords, credentials)
 * Uses AES-256-GCM with a key derived from ENCRYPTION_KEY env variable.
 *
 * MIGRATION: registros gravados com a versão base64 anterior são detectados
 * automaticamente e descriptografados de forma retrocompatível.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const ALGO = "aes-256-gcm";
const SALT = "s2-scraper-salt-v1";

function getDerivedKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (secret && secret.length >= 16) {
    return scryptSync(secret, SALT, 32);
  }
  // Fallback: JWT_SECRET. Sem nenhum dos dois é erro — criptografar com
  // chave previsível equivale a texto plano para quem tiver o dump do banco.
  const fallback = process.env.JWT_SECRET;
  if (fallback && fallback.length >= 16) {
    return scryptSync(fallback, SALT, 32);
  }
  throw new Error(
    "ENCRYPTION_KEY (ou JWT_SECRET) não definida — impossível criptografar credenciais com segurança. " +
      "Gere uma com: openssl rand -base64 48"
  );
}

/**
 * Detecta se o valor é um legado em base64 puro (formato anterior).
 * O novo formato tem a estrutura: <iv_hex>:<tag_hex>:<data_hex>
 */
function isLegacyBase64(value: string): boolean {
  return !value.includes(":") || value.split(":").length !== 3;
}

/**
 * Encripta uma string usando AES-256-GCM.
 * Formato de saída: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptPassword(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(12); // 96-bit IV recomendado para GCM
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decripta uma string encriptada com AES-256-GCM.
 * Suporta retrocompatibilidade com valores legados em base64 puro.
 */
export function decryptPassword(encrypted: string): string {
  // Compatibilidade retroativa: valores gravados com base64 simples
  if (isLegacyBase64(encrypted)) {
    try {
      return Buffer.from(encrypted, "base64").toString("utf-8");
    } catch {
      return encrypted;
    }
  }

  try {
    const [ivHex, tagHex, dataHex] = encrypted.split(":");
    const key = getDerivedKey();
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data).toString("utf-8") + decipher.final("utf-8");
  } catch {
    throw new Error("Falha ao decriptar credencial. Verifique ENCRYPTION_KEY e re-salve as credenciais.");
  }
}

/**
 * Compara duas strings de forma segura contra timing attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
