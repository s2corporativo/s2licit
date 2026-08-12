// Teste de decodificação das senhas dos scrapers com a chave atual.
// Implementação idêntica ao credentialEncryptionService (GCM 3 partes, CBC 2 partes).
import crypto from "crypto";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const secret = process.env.ENCRYPTION_KEY;
console.log("ENCRYPTION_KEY presente:", !!secret, "| len:", secret ? secret.length : 0);

function decrypt(encrypted) {
  const parts = encrypted.split(":");
  if (parts.length === 3) {
    // AES-256-GCM: iv:tag:data
    const [ivHex, tagHex, dataHex] = parts;
    const key = crypto.scryptSync(secret, "s2-scraper-salt-v1", 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(ivHex, "hex"), Buffer.from(tagHex, "hex"));
    return decipher.update(dataHex, "hex", "utf8") + decipher.final("utf8");
  }
  if (parts.length === 2) {
    // AES-256-CBC legado: iv:dados
    const [ivHex, dataHex] = parts;
    const key = Buffer.from(secret.padEnd(32, "0").slice(0, 32));
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from(ivHex, "hex"));
    return decipher.update(dataHex, "hex", "utf8") + decipher.final("utf8");
  }
  throw new Error("Formato inválido");
}

const [rows] = await conn.query(
  "SELECT id, scraperType, email, passwordHash FROM scraper_configs WHERE enabled='yes' ORDER BY id",
);
console.log(`=== ${rows.length} configs de scraper ===`);
for (const row of rows) {
  try {
    const d = decrypt(row.passwordHash);
    console.log(`#${row.id} ${row.scraperType} (${row.email}) → OK (senha decifrada, ${d.length} chars)`);
  } catch (e) {
    console.log(`#${row.id} ${row.scraperType} (${row.email}) → FALHA: ${e.message}`);
  }
}
await conn.end();
