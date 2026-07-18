import crypto from "crypto";
import {
  encryptPassword as encryptGcm,
  decryptPassword as decryptGcm,
} from "../utils/encryption";

/**
 * Serviço unificado de criptografia de credenciais.
 *
 * Delegação para utils/encryption (AES-256-GCM, fonte única de verdade).
 * Mantém leitura retrocompatível de registros gravados pela implementação
 * anterior (AES-256-CBC, formato <iv_hex>:<dados_hex> com 2 partes).
 *
 * Hash de senha usa scrypt com salt aleatório por hash — o formato antigo
 * (SHA-256 puro, 64 hex chars) continua verificável para credenciais já
 * gravadas, mas todo novo hash sai no formato scrypt.
 */

const LEGACY_CBC_ALGORITHM = "aes-256-cbc";

function legacyCbcKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    // Sem chave não há como decriptar com segurança — falhar é melhor do que
    // usar uma chave conhecida publicamente no código-fonte.
    throw new Error(
      "ENCRYPTION_KEY não configurada — necessária para ler credenciais no formato legado"
    );
  }
  return Buffer.from(secret.padEnd(32, "0").slice(0, 32));
}

const SCRYPT_PREFIX = "scrypt";

export class CredentialEncryptionService {
  encrypt(plaintext: string): string {
    return encryptGcm(plaintext);
  }

  decrypt(encrypted: string): string {
    const parts = encrypted.split(":");

    // Formato atual AES-GCM: iv:tag:dados (3 partes)
    if (parts.length === 3) {
      return decryptGcm(encrypted);
    }

    // Formato legado AES-CBC: iv:dados (2 partes)
    if (parts.length === 2) {
      const [ivHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv(LEGACY_CBC_ALGORITHM, legacyCbcKey(), iv);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }

    throw new Error("Formato de credencial criptografada inválido");
  }

  /**
   * Hash de senha com scrypt e salt aleatório.
   * Formato: scrypt:<salt_hex>:<hash_hex>
   */
  hashPassword(password: string): string {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);
    return `${SCRYPT_PREFIX}:${salt.toString("hex")}:${hash.toString("hex")}`;
  }

  /**
   * Verifica senha contra hash scrypt (ou SHA-256 legado, para
   * registros anteriores à migração).
   */
  verifyPassword(password: string, stored: string): boolean {
    const parts = stored.split(":");

    if (parts.length === 3 && parts[0] === SCRYPT_PREFIX) {
      const salt = Buffer.from(parts[1], "hex");
      const expected = Buffer.from(parts[2], "hex");
      const actual = crypto.scryptSync(password, salt, expected.length);
      return crypto.timingSafeEqual(actual, expected);
    }

    // Legado: SHA-256 hex puro
    if (/^[0-9a-f]{64}$/i.test(stored)) {
      const actual = crypto.createHash("sha256").update(password).digest();
      const expected = Buffer.from(stored, "hex");
      return crypto.timingSafeEqual(actual, expected);
    }

    return false;
  }

  generateApiKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  generateSessionToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }
}

export const credentialEncryptionService = new CredentialEncryptionService();
