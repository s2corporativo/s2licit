import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".yml", ".yaml", ".env"]);
const findings = [];
const assignment = /\b([A-Z0-9_]*(?:API_KEY|SECRET|PASSWORD|TOKEN)[A-Z0-9_]*)\s*[:=]\s*["']([^"']{8,})["']/gi;
const privateKey = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g;
const allowedExamples = /^(?:change-me|example|placeholder|your[-_]|test[-_]|dev[-_])/i;

function scan(path) {
  const content = readFileSync(path, "utf8");
  for (const match of content.matchAll(assignment)) {
    if (
      allowedExamples.test(match[2]) ||
      match[2].includes("${") ||
      /^(?:[#.\[]|input\b)/i.test(match[2])
    ) continue;
    const line = content.slice(0, match.index).split("\n").length;
    findings.push(`${relative(root, path)}:${line} (${match[1]})`);
  }
  for (const match of content.matchAll(privateKey)) {
    const line = content.slice(0, match.index).split("\n").length;
    findings.push(`${relative(root, path)}:${line} (PRIVATE_KEY)`);
  }
}

function walk(directory) {
  for (const name of readdirSync(directory)) {
    if (ignoredDirectories.has(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (extensions.has(extname(name)) || name.startsWith(".env")) {
      scan(path);
    }
  }
}

walk(root);

if (findings.length > 0) {
  console.error(`Possíveis segredos literais:\n${findings.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("Nenhum segredo literal encontrado nos arquivos versionáveis.");
}
