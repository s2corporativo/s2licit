import { readFile, writeFile } from "node:fs/promises";

// Migração pontual e idempotência controlada: falha se o código esperado mudar.
const file = "server/services/propostaAgent.ts";
const before = await readFile(file, "utf8");
const needle = "{ clickCount: 3 }";
const matches = before.split(needle).length - 1;

if (matches !== 4) {
  throw new Error(`Migração Puppeteer 25 esperava 4 ocorrências de ${needle}, encontrou ${matches}.`);
}

const after = before.replaceAll(needle, "{ count: 3 }");
await writeFile(file, after, "utf8");
console.log("Migração Puppeteer 25 aplicada: 4 opções clickCount -> count.");
