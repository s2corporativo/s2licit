import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default-insecure-key-change-in-production-32-chars";

if (ENCRYPTION_KEY.length < 32) {
  console.warn("[Security] ENCRYPTION_KEY is too short. Using default insecure key. Set ENCRYPTION_KEY env var.");
}

export class CredentialEncryptionService {
  private key: Buffer;

  constructor() {
    // Ensure key is exactly 32 bytes
    const keyBuffer = Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
    this.key = keyBuffer;
  }

  /**
   * Encrypt a credential string
   */
  encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

      let encrypted = cipher.update(plaintext, "utf8", "hex");
      encrypted += cipher.final("hex");

      // Combine IV + encrypted data
      const combined = iv.toString("hex") + ":" + encrypted;
      return combined;
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Decrypt a credential string
   */
  decrypt(encrypted: string): string {
    try {
      const [ivHex, encryptedHex] = encrypted.split(":");
      if (!ivHex || !encryptedHex) {
        throw new Error("Invalid encrypted format");
      }

      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);

      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Hash a password for verification (one-way)
   */
  hashPassword(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  /**
   * Verify a password against its hash
   */
  verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  /**
   * Generate a random API key
   */
  generateApiKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Generate a random session token
   */
  generateSessionToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }
}

export const credentialEncryptionService = new CredentialEncryptionService();
