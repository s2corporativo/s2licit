import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const LARGE_FILE_BYTES = 500 * 1024;
const TEXT_EXTENSIONS = new Set([
  ".bat", ".cjs", ".css", ".env", ".example", ".html", ".js", ".json",
  ".jsx", ".md", ".mjs", ".prisma", ".scss", ".sh", ".sql", ".ts",
  ".tsx", ".txt", ".yaml", ".yml",
]);
const AUDIT_IMPLEMENTATION = "scripts/repository-audit.mjs";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
}).split("\0").filter(Boolean).sort();

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || null,
  totals: {
    trackedFiles: trackedFiles.length,
    clientSourceFiles: 0,
    serverSourceFiles: 0,
    tests: 0,
    migrations: 0,
  },
  topLevelEntries: [],
  suspiciousNames: [],
  generatedArtifacts: [],
  zeroByteFiles: [],
  largeFiles: [],
  duplicateContentGroups: [],
  staleIdentityReferences: [],
  maintenanceMarkers: [],
  sourceDemoOrMockMarkers: [],
  allTrackedFiles: trackedFiles,
};

const topLevelEntries = new Set();
const hashes = new Map();

const suspiciousNamePattern = /(?:^|\/)(?:backup|copy|copia|old|obsolete|obsoleto|deprecated)(?:[._-]|\/)|\.(?:bak|old|orig|rej|tmp|temp|disabled|backup)$|~$/i;
const generatedPathPattern = /(?:^|\/)(?:graphify-out|coverage|dist|build|\.manus-logs|evidencias|artifacts)(?:\/|$)|(?:^|\/)Pasted_content_|(?:^|\/)repository-audit\.json$/i;

for (const file of trackedFiles) {
  topLevelEntries.add(file.split("/")[0]);

  if (/^client\/src\/.+\.(?:ts|tsx)$/.test(file)) report.totals.clientSourceFiles += 1;
  if (/^server\/.+\.ts$/.test(file)) report.totals.serverSourceFiles += 1;
  if (/(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(file)) report.totals.tests += 1;
  if (/^drizzle\/[^/]+\.sql$/.test(file)) report.totals.migrations += 1;

  if (suspiciousNamePattern.test(file)) report.suspiciousNames.push(file);
  if (generatedPathPattern.test(file)) report.generatedArtifacts.push(file);

  let stats;
  try {
    stats = statSync(file);
  } catch {
    continue;
  }

  if (stats.size === 0) report.zeroByteFiles.push(file);
  if (stats.size >= LARGE_FILE_BYTES) report.largeFiles.push({ file, bytes: stats.size });
  if (stats.size === 0 || stats.size > MAX_TEXT_BYTES) continue;

  const buffer = readFileSync(file);
  const hash = createHash("sha256").update(buffer).digest("hex");
  if (!hashes.has(hash)) hashes.set(hash, []);
  hashes.get(hash).push(file);

  const extension = extname(file).toLowerCase();
  if (buffer.includes(0) || (!TEXT_EXTENSIONS.has(extension) && !basename(file).startsWith(".env"))) continue;

  const text = buffer.toString("utf8");
  const isAuditImplementation = file === AUDIT_IMPLEMENTATION;

  if (!isAuditImplementation) {
    const staleRules = [
      ["identidade Verdelimp", /\bverdelimp\b/i],
      ["identidade Cuidar Vet", /\bcuidar\s+vet\b/i],
      ["artefato Manus", /\bmanus\b/i],
      ["proxy Forge legado", /\bforge\b/i],
    ];
    for (const [rule, pattern] of staleRules) {
      if (pattern.test(text)) report.staleIdentityReferences.push({ file, rule });
    }
  }

  if (!isAuditImplementation && /\b(?:TODO|FIXME|HACK)\b/.test(text)) {
    report.maintenanceMarkers.push(file);
  }
  if (/^(?:client\/src|server|shared)\//.test(file) && !/(?:^|\/)(?:__tests__|fixtures|mocks?|tests?)(?:\/|$)/i.test(file) && /\b(?:mock|fake|demo|simulad[oa]s?)\b/i.test(text)) {
    report.sourceDemoOrMockMarkers.push(file);
  }
}

report.topLevelEntries = [...topLevelEntries].sort();
report.duplicateContentGroups = [...hashes.values()]
  .filter((files) => files.length > 1)
  .map((files) => files.sort())
  .sort((left, right) => left[0].localeCompare(right[0]));

for (const key of ["suspiciousNames", "generatedArtifacts", "zeroByteFiles", "maintenanceMarkers", "sourceDemoOrMockMarkers"]) {
  report[key] = [...new Set(report[key])].sort();
}
report.staleIdentityReferences = [...new Map(
  report.staleIdentityReferences.map((item) => [`${item.file}\0${item.rule}`, item]),
).values()].sort((a, b) => a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));
report.largeFiles.sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file));

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
