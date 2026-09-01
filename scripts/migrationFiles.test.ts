import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DRIZZLE_DIR = path.resolve(__dirname, "..", "drizzle");
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

/**
 * `pnpm db:push` chamava `drizzle-kit migrate` (drizzle-orm/mysql2/migrator)
 * e morria sempre em 14/29 migrations, sem imprimir mensagem — o spinner do
 * CLI engole o erro. Causa raiz, reproduzida chamando o migrator do
 * drizzle-orm diretamente: `0014_drop_orphan_tables.sql` termina com
 * `--> statement-breakpoint` seguido só de espaço em branco. O migrator do
 * drizzle-orm, ao contrário do runner de produção (`splitMigrationStatements`
 * em scripts/migrate-production.mjs, que filtra vazios), executa o pedaço
 * final vazio como statement e o MySQL rejeita com ER_EMPTY_QUERY.
 *
 * A correção foi trocar `db:push` para chamar o runner de produção, que já
 * tolera isso — não editar `0014...sql` (uma migration com histórico real
 * de aplicação; alterar seu conteúdo muda o hash SHA-256 que o runner de
 * produção usa para detectar drift e dispararia um erro fatal de "drift
 * detectado" no próximo deploy de qualquer banco que já a tenha aplicado).
 * Este teste impede que uma migration NOVA reintroduza o mesmo defeito —
 * ele quebraria de novo qualquer ferramenta que não filtre vazios.
 */
/**
 * `0014_drop_orphan_tables.sql` já carrega esse defeito e não é seguro
 * corrigi-lo no próprio arquivo: `scripts/migrate-production.mjs` grava o
 * hash SHA-256 do conteúdo de cada migration já aplicada e recusa com erro
 * fatal ("drift detectado") qualquer banco onde esse hash não bater mais no
 * próximo deploy — exatamente a proteção contra reescrever histórico que o
 * próprio script documenta. Sem confirmação de que nenhum banco real já
 * aplicou esta migration, editá-la é mais arriscado que documentar a exceção
 * aqui. `pnpm db:push` deixou de depender do migrator sensível a isso (ver
 * package.json), então o defeito não afeta mais nenhum fluxo em uso.
 */
const KNOWN_PRE_EXISTING_OFFENDERS = new Set(["0014_drop_orphan_tables.sql"]);

describe("arquivos de migration — sem statement vazio ao final", () => {
  const migrationFiles = readdirSync(DRIZZLE_DIR)
    .filter(f => /^\d{4}_.+\.sql$/.test(f))
    .filter(f => !KNOWN_PRE_EXISTING_OFFENDERS.has(f));

  it("encontra migrations para verificar", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it.each(migrationFiles)("%s não termina em breakpoint seguido só de espaço em branco", file => {
    const sql = readFileSync(path.join(DRIZZLE_DIR, file), "utf8");
    const parts = sql.split(STATEMENT_BREAKPOINT);
    const last = parts[parts.length - 1].trim();
    expect(last).not.toBe("");
  });

  it("0014_drop_orphan_tables.sql segue com o statement vazio conhecido (não editar — ver comentário acima)", () => {
    const sql = readFileSync(path.join(DRIZZLE_DIR, "0014_drop_orphan_tables.sql"), "utf8");
    const parts = sql.split(STATEMENT_BREAKPOINT);
    expect(parts[parts.length - 1].trim()).toBe("");
  });
});
