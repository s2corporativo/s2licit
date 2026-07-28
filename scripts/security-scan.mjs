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
const SAFE_CREDENTIAL_CONTEXT = /(?:^|\/)(?:\.github\/workflows|tests?|__tests__|fixtures|docs)(?:\/|$)|(?:^|\/)\.env[^/]*\.example$/i;

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
  if (/(?:^|\/)(?:uploads?|backups?|private-imports?|data)\//i.test(lower)) {
    add(file, "dados operacionais ou persistentes versionados");
  }
  if (/\.(?:db|sqlite|sqlite3)$/i.test(name)) add(file, "banco local versionado");
  if (/(?:dump|backup).+\.sql(?:\.gz)?$/i.test(name)) add(file, "dump de banco versionado");

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

  if (!SAFE_CREDENTIAL_CONTEXT.test(file) && /\b(?:mysql|postgres(?:ql)?)\:\/\/[^\s:@/]+:[^\s@/]+@/i.test(text)) {
    add(file, "URL de banco com credenciais embutidas");
  }

  if (!SAFE_CREDENTIAL_CONTEXT.test(file) && /(?:JWT_SECRET|ENCRYPTION_KEY|ANTHROPIC_API_KEY|GROQ_API_KEY|SMTP_PASSWORD|IMAP_PASSWORD)\s*=\s*["']?[A-Za-z0-9_+\/=.-]{12,}/.test(text)) {
    add(file, "segredo preenchido em código ou configuração rastreada");
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
