import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const MIGRATION_LOCK = "s2licit_production_migrations";
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";
const MYSQL_IDENTIFIER_MAX_LENGTH = 64;
const IDENTIFIER_HASH_LENGTH = 12;
const IGNORABLE_ERROR_NUMBERS = new Set([1050, 1060, 1061, 1826]);
const IGNORABLE_ERROR_CODES = new Set([
  "ER_TABLE_EXISTS_ERROR",
  "ER_DUP_FIELDNAME",
  "ER_DUP_KEYNAME",
  "ER_FK_DUP_NAME",
]);

export function splitMigrationStatements(sql) {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map(statement => statement.trim())
    .filter(Boolean);
}

export function shortenMysqlIdentifier(identifier) {
  if (identifier.length <= MYSQL_IDENTIFIER_MAX_LENGTH) return identifier;

  const digest = createHash("sha256")
    .update(identifier)
    .digest("hex")
    .slice(0, IDENTIFIER_HASH_LENGTH);
  const prefixLength = MYSQL_IDENTIFIER_MAX_LENGTH - IDENTIFIER_HASH_LENGTH - 1;
  return `${identifier.slice(0, prefixLength)}_${digest}`;
}

/**
 * O Drizzle pode gerar nomes de constraints/índices acima do limite de 64
 * caracteres do MySQL. Encurta somente identificadores estruturais, mantendo
 * tabelas, colunas e o conteúdo da instrução intactos.
 */
export function normalizeMysqlIdentifiers(statement) {
  const patterns = [
    /(\b(?:ADD\s+)?CONSTRAINT\s+)`([^`]+)`/gi,
    /(\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+)`([^`]+)`/gi,
    /(\bADD\s+(?:UNIQUE\s+)?(?:INDEX|KEY)\s+)`([^`]+)`/gi,
    /(\b(?:UNIQUE\s+)?KEY\s+)`([^`]+)`/gi,
  ];

  return patterns.reduce(
    (sql, pattern) =>
      sql.replace(pattern, (_match, prefix, identifier) => {
        return `${prefix}\`${shortenMysqlIdentifier(identifier)}\``;
      }),
    statement,
  );
}

export function isIgnorableMigrationError(error) {
  const errno = Number(error?.errno);
  const code = typeof error?.code === "string" ? error.code : "";
  return IGNORABLE_ERROR_NUMBERS.has(errno) || IGNORABLE_ERROR_CODES.has(code);
}

function describeError(error) {
  if (!(error instanceof Error)) return String(error);
  const code = typeof error.code === "string" ? ` ${error.code}` : "";
  const errno = Number.isFinite(Number(error.errno)) ? `/${Number(error.errno)}` : "";
  return `${error.message}${code}${errno}`;
}

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`hash\` VARCHAR(128) NOT NULL,
      \`created_at\` BIGINT NOT NULL,
      PRIMARY KEY (\`id\`)
    )
  `);
}

async function readAppliedMigrations(connection) {
  const [rows] = await connection.query(
    "SELECT hash, created_at FROM `__drizzle_migrations` ORDER BY created_at ASC",
  );
  return rows.map(row => ({
    hash: String(row.hash),
    createdAt: Number(row.created_at),
  }));
}

function migrationFile(rootDir, tag) {
  if (!/^\d{4}_[A-Za-z0-9_]+$/.test(tag)) {
    throw new Error(`Tag de migração inválida: ${tag}`);
  }
  return path.join(rootDir, "drizzle", `${tag}.sql`);
}

async function applyMigration(connection, migration, index) {
  const statements = splitMigrationStatements(migration.sql);
  console.log(`[Migration] ${migration.tag}: ${statements.length} comando(s).`);

  for (let statementIndex = 0; statementIndex < statements.length; statementIndex += 1) {
    const originalStatement = statements[statementIndex];
    const statement = normalizeMysqlIdentifiers(originalStatement);

    if (statement !== originalStatement) {
      console.log(
        `[Migration] ${migration.tag} #${statementIndex + 1}: identificador MySQL normalizado.`,
      );
    }

    try {
      await connection.query(statement);
    } catch (error) {
      if (isIgnorableMigrationError(error)) {
        console.log(
          `[Migration] ${migration.tag} #${statementIndex + 1}: objeto legado já existe; mantendo.`,
        );
        continue;
      }

      const prefix = statement.replace(/\s+/g, " ").slice(0, 180);
      throw new Error(
        `Falha na migração ${migration.tag}, comando ${statementIndex + 1}/${statements.length}: ` +
          `${describeError(error)}. SQL: ${prefix}`,
        { cause: error },
      );
    }
  }

  await connection.execute(
    "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
    [migration.hash, migration.createdAt],
  );
  console.log(`[Migration] ${migration.tag} registrada (${index + 1}).`);
}

export async function runProductionMigrations({ databaseUrl = process.env.DATABASE_URL } = {}) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória para executar as migrações.");
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const journalPath = path.join(rootDir, "drizzle", "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const entries = [...(journal.entries ?? [])].sort((a, b) => a.idx - b.idx);

  const connection = await mysql.createConnection(databaseUrl);
  let lockAcquired = false;

  try {
    const [lockRows] = await connection.execute("SELECT GET_LOCK(?, 90) AS acquired", [MIGRATION_LOCK]);
    lockAcquired = Number(lockRows?.[0]?.acquired ?? 0) === 1;
    if (!lockAcquired) {
      throw new Error("Não foi possível obter a trava exclusiva das migrações em 90 segundos.");
    }

    await ensureMigrationTable(connection);
    const applied = await readAppliedMigrations(connection);
    const hashes = new Set(applied.map(item => item.hash));
    const timestamps = new Map(applied.map(item => [item.createdAt, item.hash]));

    if (applied.length === 0) {
      console.log(
        "[Migration] Histórico vazio detectado. Reconciliando o schema legado sem remover dados.",
      );
    }

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const filePath = migrationFile(rootDir, entry.tag);
      const sql = await readFile(filePath, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      const createdAt = Number(entry.when);

      if (hashes.has(hash)) {
        console.log(`[Migration] ${entry.tag}: já aplicada.`);
        continue;
      }

      const recordedHash = timestamps.get(createdAt);
      if (recordedHash && recordedHash !== hash) {
        throw new Error(
          `Conflito no histórico da migração ${entry.tag}: o timestamp ${createdAt} já está ` +
            "registrado com outro hash. A execução foi interrompida para proteger os dados.",
        );
      }

      await applyMigration(
        connection,
        { tag: entry.tag, sql, hash, createdAt },
        index,
      );
      hashes.add(hash);
      timestamps.set(createdAt, hash);
    }

    console.log(`[Migration] Schema atualizado: ${entries.length} migração(ões) reconhecida(s).`);
  } finally {
    if (lockAcquired) {
      await connection.execute("SELECT RELEASE_LOCK(?)", [MIGRATION_LOCK]).catch(() => undefined);
    }
    await connection.end();
  }
}

const executedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (executedDirectly) {
  runProductionMigrations().catch(error => {
    console.error("[Migration] Falha fatal:", describeError(error));
    process.exitCode = 1;
  });
}
