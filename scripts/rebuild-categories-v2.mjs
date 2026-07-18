/**
 * Rebuild strategic category hierarchy v2
 * Construção | Agro | Veterinário | Rações | Medicamentos Humanos
 *
 * ATENÇÃO: este script APAGA todas as categorias e desvincula todos os
 * produtos (products.categoryId = NULL). Ele NÃO recategoriza os produtos —
 * isso precisa ser feito depois (ex.: scripts/migrate-categories.mjs ou
 * reclassificação pela UI).
 *
 * SEGURANÇA: exige a flag --confirm para executar e, antes de apagar,
 * grava um dump JSON do vínculo atual productId→categoryId e da árvore de
 * categorias em scripts/backups/, permitindo restauração manual.
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
dotenv.config();

if (!process.argv.includes("--confirm")) {
  console.error("Este script apaga TODAS as categorias e desvincula TODOS os produtos.");
  console.error("Ele não recategoriza os produtos automaticamente.");
  console.error("\nPara executar de verdade: node scripts/rebuild-categories-v2.mjs --confirm");
  console.error("Recomendado antes: pnpm db:backup");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido. Abortando.");
  process.exit(1);
}

const db = await createConnection(process.env.DATABASE_URL);

// 0. Dump de segurança do estado atual (vínculos + árvore de categorias)
const [links] = await db.execute(
  "SELECT id, categoryId FROM products WHERE categoryId IS NOT NULL"
);
const [oldCategories] = await db.execute(
  "SELECT id, name, slug, parentId, sortOrder FROM categories"
);
const backupDir = path.join(process.cwd(), "scripts", "backups");
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFile = path.join(backupDir, `categories-backup-${stamp}.json`);
writeFileSync(
  backupFile,
  JSON.stringify({ createdAt: stamp, categories: oldCategories, productLinks: links }, null, 2)
);
console.log(`Backup salvo em ${backupFile} (${oldCategories.length} categorias, ${links.length} vínculos de produto)`);

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
console.log(`⚠️  Os produtos estão sem categoria. Recategorize-os e guarde o backup ${path.basename(backupFile)} até validar.`);
