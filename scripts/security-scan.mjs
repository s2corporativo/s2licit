import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  ".bat", ".cjs", ".css", ".env", ".example", ".html", ".js", ".json",
  ".jsx", ".md", ".mjs", ".scss", ".sh", ".sql", ".ts", ".tsx", ".txt",
  ".yaml", ".yml",
]);
const ALLOWED_ENV_FILES = new Set([
  ".env.example",
  ".env.production.example",
  ".env.vps.example",
]);
const SAFE_EXAMPLE_CONTEXT = /^(?:README\.md)$|(?:^|\/)(?:docs|tests?|__tests__|fixtures)(?:\/|$)|(?:^|\/)\.env[^/]*\.example$/i;
const SECRET_NAMES = [
  "JWT_SECRET",
  "ENCRYPTION_KEY",
  "ANTHROPIC_API_KEY",
  "GROQ_API_KEY",
  "SMTP_PASSWORD",
  "IMAP_PASSWORD",
].join("|");
const secretLiteralPattern = new RegExp(
  String.raw`["']?\b(?:${SECRET_NAMES})\b["']?\s*[:=]\s*(?:"([^"\r\n]{12,})"|'([^'\r\n]{12,})'|([A-Za-z0-9_+/.=-]{12,})(?=\s*(?:$|[,;#}])))`,
  "gmi",
);
const databaseUrlPattern = /\b(?:mysql|postgres(?:ql)?):\/\/[^\s"'`<>]+/gi;

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
}).split("\0").filter(Boolean).sort();

const findings = [];
function add(file, rule) {
  findings.push({ file, rule });
}

const prohibitedExtensions = new Set([
  ".cer", ".crt", ".der", ".key", ".kdbx", ".p12", ".pem", ".pfx",
]);
const privateKeyHeader = new RegExp(
  ["BEGIN", "(?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE", "KEY"].join("[ -]+"),
  "i",
);
const tokenRules = [
  ["token GitHub", /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}\b/],
  ["access key AWS", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["chave Google API", /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ["token Slack", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["token npm", /\bnpm_[A-Za-z0-9]{30,}\b/],
  ["chave Stripe live", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
  ["chave OpenAI/compatível", /\bsk-[A-Za-z0-9_-]{20,}\b/],
];

function isLocalEphemeralDatabaseUrl(value) {
  try {
    const url = new URL(value);
    const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const testCredentials =
      (url.username === "root" && url.password === "root") ||
      (url.username === "test" && url.password === "test");
    return localHost && testCredentials;
  } catch {
    return false;
  }
}

function isExpression(value) {
  return /\$\{|\$\{\{|\b(?:process\.env|secrets\.|vars\.|readSecret|decrypt|ENV\.)/i.test(value);
}

for (const file of trackedFiles) {
  const name = basename(file);
  const lower = file.toLowerCase();
  const extension = extname(name).toLowerCase();

  if ((name === ".env" || name.startsWith(".env.")) && !ALLOWED_ENV_FILES.has(name)) {
    add(file, "arquivo de ambiente real versionado");
  }
  if (prohibitedExtensions.has(extension)) add(file, "certificado ou chave privada versionada");
  if (/^(?:credentials?|service-account|secrets?)\.(?:json|ya?ml)$/i.test(name)) {
    add(file, "arquivo de credenciais versionado");
  }
  if (/(?:^|\/)(?:uploads?|backups?|private-imports?)\//i.test(lower) || /^data\//i.test(lower) || /^public\/uploads\//i.test(lower)) {
    add(file, "dados operacionais ou persistentes versionados");
  }
  if (/\.(?:db|sqlite|sqlite3)$/i.test(name)) add(file, "banco local versionado");
  if (/^(?:.*[-_.])?(?:dump|backup)(?:[-_.].*)?\.sql(?:\.gz)?$/i.test(name)) {
    add(file, "dump de banco versionado");
  }

  let stats;
  try {
    stats = statSync(file);
  } catch {
    continue;
  }
  if (stats.size === 0 || stats.size > MAX_TEXT_BYTES) continue;

  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;
  if (!TEXT_EXTENSIONS.has(extension) && !name.startsWith(".env")) continue;
  const text = buffer.toString("utf8");

  if (privateKeyHeader.test(text)) add(file, "cabeçalho de chave privada");
  for (const [rule, pattern] of tokenRules) {
    if (pattern.test(text)) add(file, rule);
  }

  for (const match of text.matchAll(databaseUrlPattern)) {
    const value = match[0].replace(/[),;]+$/, "");
    if (isExpression(value)) continue;
    if (SAFE_EXAMPLE_CONTEXT.test(file)) continue;
    if (isLocalEphemeralDatabaseUrl(value)) continue;
    add(file, "URL de banco com credenciais literais embutidas");
  }

  if (!SAFE_EXAMPLE_CONTEXT.test(file)) {
    for (const match of text.matchAll(secretLiteralPattern)) {
      const value = match[1] ?? match[2] ?? match[3] ?? "";
      if (!value || isExpression(value)) continue;
      add(file, "segredo literal preenchido em código ou configuração rastreada");
    }
  }
}

const unique = [...new Map(findings.map((item) => [`${item.file}\0${item.rule}`, item])).values()]
  .sort((a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));

if (unique.length > 0) {
  console.error("Varredura de segurança reprovada. Valores sensíveis não são exibidos:");
  for (const item of unique) console.error(`- ${item.file}: ${item.rule}`);
  process.exit(1);
}

console.log(`Varredura de segurança aprovada em ${trackedFiles.length} arquivo(s) rastreado(s).`);
