#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET="drizzle/meta/0016_snapshot.json"
REVISION="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
IMAGE="s2licit-capture-snapshot:${REVISION}"
CONTAINER="s2licit-capture-snapshot-${REVISION}-$$"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if ! command -v docker >/dev/null 2>&1; then
  echo "[snapshot] Docker não está instalado ou não está no PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[snapshot] O Docker não está em execução ou o usuário não possui permissão." >&2
  exit 1
fi

if [ -e "$TARGET" ]; then
  echo "[snapshot] $TARGET já existe. Remova-o explicitamente antes de regenerar." >&2
  exit 1
fi

if [ ! -f drizzle/meta/0015_snapshot.json ]; then
  echo "[snapshot] Snapshot anterior 0015 não encontrado." >&2
  exit 1
fi

if [ ! -f drizzle/0016_capture_core.sql ]; then
  echo "[snapshot] Migration manual drizzle/0016_capture_core.sql não encontrada." >&2
  exit 1
fi

if ! grep -q '"tag"[[:space:]]*:[[:space:]]*"0016_capture_core"' drizzle/meta/_journal.json; then
  echo "[snapshot] _journal.json não contém 0016_capture_core." >&2
  exit 1
fi

echo "[snapshot] Construindo ambiente com a versão travada do drizzle-kit..."
docker build \
  --file Dockerfile.validate \
  --target runner \
  --tag "$IMAGE" \
  .

docker create \
  --name "$CONTAINER" \
  -e DATABASE_URL="mysql://root:root@127.0.0.1:3306/s2licit_snapshot" \
  "$IMAGE" \
  sh -lc '
    set -Eeuo pipefail
    cd /app

    rm -f drizzle/meta/0016_snapshot.json
    rm -f drizzle/0016_capture_core.sql

    node --input-type=module <<"NODE"
import { readFile, writeFile } from "node:fs/promises";

const path = "drizzle/meta/_journal.json";
const journal = JSON.parse(await readFile(path, "utf8"));
const entries = Array.isArray(journal.entries) ? journal.entries : [];
const filtered = entries.filter((entry) => entry?.tag !== "0016_capture_core");

if (filtered.length !== entries.length - 1) {
  throw new Error("Esperava remover exatamente uma entrada 0016_capture_core do journal temporário.");
}

journal.entries = filtered;
await writeFile(path, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
NODE

    pnpm exec drizzle-kit generate --name capture_core

    test -f drizzle/meta/0016_snapshot.json

    node --input-type=module <<"NODE"
import { readFile } from "node:fs/promises";

const previous = JSON.parse(await readFile("drizzle/meta/0015_snapshot.json", "utf8"));
const generated = JSON.parse(await readFile("drizzle/meta/0016_snapshot.json", "utf8"));

if (generated.version !== previous.version) {
  throw new Error(`Versão do snapshot mudou inesperadamente: ${previous.version} -> ${generated.version}`);
}
if (generated.dialect !== "mysql") {
  throw new Error(`Dialect inesperado no snapshot: ${generated.dialect}`);
}
if (generated.prevId !== previous.id) {
  throw new Error(`prevId inválido: esperado ${previous.id}, recebido ${generated.prevId}`);
}

const expectedTables = [
  "capture_jobs",
  "supplier_product_observations",
  "capture_job_events",
  "capture_ai_feedback",
  "capture_connector_health",
];

for (const table of expectedTables) {
  if (!generated.tables?.[table]) {
    throw new Error(`Tabela ${table} ausente no snapshot gerado.`);
  }
}
NODE
  '

echo "[snapshot] Gerando snapshot dentro do container..."
docker start -a "$CONTAINER"

echo "[snapshot] Copiando somente o snapshot gerado; SQL/journal temporários são descartados..."
docker cp "$CONTAINER:/app/drizzle/meta/0016_snapshot.json" "$TARGET"

node --input-type=module <<'NODE'
import { readFile } from "node:fs/promises";

const previous = JSON.parse(await readFile("drizzle/meta/0015_snapshot.json", "utf8"));
const generated = JSON.parse(await readFile("drizzle/meta/0016_snapshot.json", "utf8"));

if (generated.prevId !== previous.id) {
  throw new Error("Snapshot copiado não referencia corretamente o 0015_snapshot.json.");
}

const expectedTables = [
  "capture_jobs",
  "supplier_product_observations",
  "capture_job_events",
  "capture_ai_feedback",
  "capture_connector_health",
];
for (const table of expectedTables) {
  if (!generated.tables?.[table]) {
    throw new Error(`Snapshot copiado está incompleto: ${table}.`);
  }
}
NODE

echo
printf '%s\n' \
  "============================================================" \
  "SNAPSHOT DO CAPTURE CORE GERADO" \
  "Arquivo: ${TARGET}" \
  "Origem: drizzle-kit do próprio projeto, executado em Docker isolado" \
  "A migration SQL e o journal reais não foram alterados pelo gerador." \
  "Próximo comando: bash scripts/validate-free.sh" \
  "============================================================"
