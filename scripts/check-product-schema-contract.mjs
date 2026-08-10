import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "drizzle", "schema.ts");
const source = await readFile(schemaPath, "utf8");

const legacyBlock = `supplierId: int("supplierId")\n      .notNull()\n      .references(() => suppliers.id, { onDelete: "cascade" }),`;
const canonicalBlock = `supplierId: int("supplierId")\n      .references(() => suppliers.id, { onDelete: "set null" }),`;

const legacyMatches = source.split(legacyBlock).length - 1;
const canonicalMatches = source.split(canonicalBlock).length - 1;
const fix = process.argv.includes("--fix");

if (canonicalMatches === 1 && legacyMatches === 0) {
  console.log("[schema-contract] products.supplierId = nullable + ON DELETE SET NULL ✓");
  process.exit(0);
}

if (legacyMatches === 1 && canonicalMatches === 0) {
  if (!fix) {
    console.error(
      "[schema-contract] ERRO: drizzle/schema.ts ainda declara products.supplierId como NOT NULL + CASCADE.\n" +
        "Execute `node scripts/check-product-schema-contract.mjs --fix` em um checkout real e revise o diff antes de gerar novas migrations.",
    );
    process.exit(1);
  }

  const next = source.replace(legacyBlock, canonicalBlock);
  if (next === source) {
    throw new Error("O patch de schema não alterou o arquivo");
  }
  await writeFile(schemaPath, next, "utf8");
  console.log("[schema-contract] products.supplierId corrigido para nullable + ON DELETE SET NULL.");
  process.exit(0);
}

console.error(
  `[schema-contract] ERRO: contrato inesperado em drizzle/schema.ts (legacy=${legacyMatches}, canonical=${canonicalMatches}). ` +
    "Nenhuma correção automática foi aplicada para evitar alteração ambígua.",
);
process.exit(1);
