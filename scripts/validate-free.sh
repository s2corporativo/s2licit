#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "[validacao] Docker não está instalado ou não está no PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[validacao] O Docker não está em execução ou o usuário não possui permissão." >&2
  exit 1
fi

REVISION="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
QUALITY_IMAGE="s2licit-validation-quality:${REVISION}"
RUNNER_IMAGE="s2licit-validation-runner:${REVISION}"
PRODUCTION_IMAGE="s2licit-production-check:${REVISION}"
NETWORK="s2licit-validation-${REVISION}-$$"
DB_CONTAINER="s2licit-validation-db-${REVISION}-$$"
CAPTURE_PREFLIGHT_FAILED=0

cleanup() {
  docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

fail_capture_preflight() {
  CAPTURE_PREFLIGHT_FAILED=1
  echo "[validacao][capture-core] $1" >&2
}

assert_scalar_equals() {
  local actual="$1"
  local expected="$2"
  local message="$3"

  if [ "$actual" != "$expected" ]; then
    echo "[validacao][capture-core] ${message}: esperado=${expected}, obtido=${actual}" >&2
    exit 1
  fi
}

query_scalar() {
  local sql="$1"
  docker exec "$DB_CONTAINER" \
    env MYSQL_PWD=root \
    mysql --batch --skip-column-names -uroot -D s2licit_validation -e "$sql" \
    | tr -d '\r\n'
}

echo "[1/8] Preflight dos artefatos de migração do Capture Core..."

if [ ! -f drizzle/0016_capture_core.sql ]; then
  fail_capture_preflight "drizzle/0016_capture_core.sql não existe."
fi

if ! grep -q '"tag"[[:space:]]*:[[:space:]]*"0016_capture_core"' drizzle/meta/_journal.json; then
  fail_capture_preflight "_journal.json não registra a migration 0016_capture_core."
fi

if [ ! -f drizzle/meta/0016_snapshot.json ]; then
  fail_capture_preflight \
    "drizzle/meta/0016_snapshot.json ainda não foi gerado pela versão do drizzle-kit do projeto. A validação continuará para revelar outros erros, mas o resultado final será bloqueado."
fi

echo "[2/8] Verificando TypeScript, lint, testes e build..."
docker build \
  --file Dockerfile.validate \
  --target quality \
  --tag "$QUALITY_IMAGE" \
  .

echo "[3/8] Preparando imagem de validação reutilizável..."
docker build \
  --file Dockerfile.validate \
  --target runner \
  --tag "$RUNNER_IMAGE" \
  .

echo "[4/8] Confirmando que a imagem de produção é construída..."
docker build --tag "$PRODUCTION_IMAGE" .

echo "[5/8] Iniciando MySQL temporário e isolado..."
docker network create "$NETWORK" >/dev/null
docker run -d \
  --name "$DB_CONTAINER" \
  --network "$NETWORK" \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=s2licit_validation \
  mysql:8.0 >/dev/null

for attempt in $(seq 1 40); do
  if docker exec "$DB_CONTAINER" \
    env MYSQL_PWD=root mysqladmin ping -h 127.0.0.1 -uroot --silent >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 40 ]; then
    echo "[validacao] O MySQL temporário não ficou pronto." >&2
    docker logs "$DB_CONTAINER" >&2 || true
    exit 1
  fi
  sleep 2
done

DATABASE_URL="mysql://root:root@${DB_CONTAINER}:3306/s2licit_validation"

echo "[6/8] Aplicando migrações duas vezes para validar idempotência..."
for pass in 1 2; do
  echo "[validacao] Migração — passagem ${pass}/2"
  docker run --rm \
    --network "$NETWORK" \
    -e DATABASE_URL="$DATABASE_URL" \
    "$RUNNER_IMAGE" \
    node scripts/migrate-production.mjs
done

echo "[7/8] Verificando invariantes estruturais do Capture Core no MySQL..."

capture_tables="$(query_scalar "
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = 's2licit_validation'
    AND table_name IN (
      'capture_jobs',
      'supplier_product_observations',
      'capture_job_events',
      'capture_ai_feedback',
      'capture_connector_health'
    );
")"
assert_scalar_equals "$capture_tables" "5" "tabelas do Capture Core incompletas"

active_key_unique="$(query_scalar "
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = 's2licit_validation'
    AND table_name = 'capture_jobs'
    AND index_name = 'uq_capture_jobs_active_key'
    AND non_unique = 0;
")"
if [ "$active_key_unique" -lt 1 ]; then
  echo "[validacao][capture-core] unique uq_capture_jobs_active_key não encontrado." >&2
  exit 1
fi

active_key_triggers="$(query_scalar "
  SELECT COUNT(*)
  FROM information_schema.triggers
  WHERE trigger_schema = 's2licit_validation'
    AND trigger_name IN ('capture_jobs_bi_active_key', 'capture_jobs_bu_active_key');
")"
assert_scalar_equals "$active_key_triggers" "2" "triggers de activeKey incompletos"

review_columns="$(query_scalar "
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = 's2licit_validation'
    AND table_name = 'supplier_product_observations'
    AND column_name IN ('reviewStatus', 'reviewedAt', 'reviewedByUserId');
")"
assert_scalar_equals "$review_columns" "3" "colunas de revisão incompletas"

review_index="$(query_scalar "
  SELECT COUNT(DISTINCT index_name)
  FROM information_schema.statistics
  WHERE table_schema = 's2licit_validation'
    AND table_name = 'supplier_product_observations'
    AND index_name = 'idx_observations_review_queue';
")"
assert_scalar_equals "$review_index" "1" "índice da fila de revisão ausente"

feedback_index="$(query_scalar "
  SELECT COUNT(DISTINCT index_name)
  FROM information_schema.statistics
  WHERE table_schema = 's2licit_validation'
    AND table_name = 'capture_ai_feedback'
    AND index_name = 'idx_capture_ai_feedback_lookup';
")"
assert_scalar_equals "$feedback_index" "1" "índice de memória supervisionada da IA ausente"

health_unique="$(query_scalar "
  SELECT COUNT(DISTINCT index_name)
  FROM information_schema.statistics
  WHERE table_schema = 's2licit_validation'
    AND table_name = 'capture_connector_health'
    AND index_name = 'uq_capture_connector_health_config'
    AND non_unique = 0;
")"
assert_scalar_equals "$health_unique" "1" "unique de saúde por configuração ausente"

echo "[8/8] Executando testes de integração que usam MySQL..."
docker run --rm \
  --network "$NETWORK" \
  -e DATABASE_URL="$DATABASE_URL" \
  "$RUNNER_IMAGE" \
  sh -lc '
    files=$(find server -type f -name "*.integration-db.test.ts" -print)
    if [ -n "$files" ]; then
      pnpm exec vitest run $files
    else
      echo "Nenhum teste de integração MySQL encontrado; etapa concluída."
    fi
  '

if [ "$CAPTURE_PREFLIGHT_FAILED" -ne 0 ]; then
  echo >&2
  printf '%s\n' \
    "============================================================" \
    "VALIDAÇÃO EXECUTÁVEL PASSOU, MAS O GATE DE ARTEFATOS FALHOU" \
    "Revisão: ${REVISION}" \
    "Gere/versione drizzle/meta/0016_snapshot.json antes de merge/deploy." \
    "============================================================" >&2
  exit 1
fi

echo
printf '%s\n' \
  "============================================================" \
  "VALIDAÇÃO GRATUITA CONCLUÍDA COM SUCESSO" \
  "Revisão: ${REVISION}" \
  "Capture Core: migration, índices e triggers verificados no MySQL." \
  "Nenhum minuto do GitHub Actions foi utilizado." \
  "============================================================"
