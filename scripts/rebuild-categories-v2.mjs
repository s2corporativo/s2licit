/**
 * Rebuild strategic category hierarchy v2
 * Construção | Agro | Veterinário | Rações | Medicamentos Humanos
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

// 1. Disable FK checks, null out product categories, delete all categories, re-enable FK
await db.execute("SET FOREIGN_KEY_CHECKS = 0");
await db.execute("UPDATE products SET categoryId = NULL");
await db.execute("DELETE FROM categories");
await db.execute("SET FOREIGN_KEY_CHECKS = 1");
console.log("Cleared old categories (products categoryId set to NULL)");

// Helper to insert and return id
async function insert(name, parentId = null, sortOrder = 0) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const [r] = await db.execute(
    "INSERT INTO categories (name, slug, parentId, sortOrder) VALUES (?, ?, ?, ?)",
    [name, slug, parentId, sortOrder]
  );
  return r.insertId;
}

// ── 1. CONSTRUÇÃO ────────────────────────────────────────────────────────────
const construcao = await insert("Construção", null, 1);
await insert("Elétrica", construcao, 1);
await insert("Hidráulica", construcao, 2);
await insert("Ferragens", construcao, 3);
await insert("Pintura", construcao, 4);
await insert("Ferramentas", construcao, 5);
await insert("EPIs", construcao, 6);
await insert("Cordas e Lonas", construcao, 7);

// ── 2. AGRO ──────────────────────────────────────────────────────────────────
const agro = await insert("Agro", null, 2);
await insert("Ferramentas Agrícolas", agro, 1);
await insert("Máquinas e Equipamentos", agro, 2);
await insert("Sementes", agro, 3);
await insert("Cercas", agro, 4);
await insert("Irrigação", agro, 5);
await insert("Lonas e Sombrites", agro, 6);

// ── 3. VETERINÁRIO ───────────────────────────────────────────────────────────
const vet = await insert("Veterinário", null, 3);

const vetMed = await insert("Medicamentos", vet, 1);
await insert("Antibióticos", vetMed, 1);
await insert("Antiparasitários", vetMed, 2);
await insert("Dermatológicos", vetMed, 3);
await insert("Otológicos", vetMed, 4);
await insert("Reprodutivos", vetMed, 5);
await insert("Mastite", vetMed, 6);
await insert("Vitaminas e Suplementos", vetMed, 7);
await insert("Outros Medicamentos Vet.", vetMed, 8);

await insert("Insumos", vet, 2);
await insert("Equipamentos", vet, 3);

// ── 4. RAÇÕES ────────────────────────────────────────────────────────────────
const racoes = await insert("Rações", null, 4);
await insert("Bovinos", racoes, 1);
await insert("Equinos", racoes, 2);
await insert("Aves", racoes, 3);
await insert("Suínos", racoes, 4);
await insert("Cães", racoes, 5);
await insert("Gatos", racoes, 6);
await insert("Suplementação Mineral", racoes, 7);

// ── 5. MEDICAMENTOS HUMANOS ──────────────────────────────────────────────────
const medHum = await insert("Medicamentos Humanos", null, 5);
await insert("Isentos de Prescrição", medHum, 1);
await insert("Sob Prescrição", medHum, 2);
await insert("Suplementos", medHum, 3);
await insert("Insumos e Materiais", medHum, 4);

await db.end();
console.log("✅ Strategic category hierarchy rebuilt successfully!");
