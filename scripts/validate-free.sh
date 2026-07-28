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

cleanup() {
  docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "[1/6] Verificando TypeScript, lint, testes e build..."
docker build \
  --file Dockerfile.validate \
  --target quality \
  --tag "$QUALITY_IMAGE" \
  .

echo "[2/6] Preparando imagem de validação reutilizável..."
docker build \
  --file Dockerfile.validate \
  --target runner \
  --tag "$RUNNER_IMAGE" \
  .

echo "[3/6] Confirmando que a imagem de produção é construída..."
docker build --tag "$PRODUCTION_IMAGE" .

echo "[4/6] Iniciando MySQL temporário e isolado..."
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

echo "[5/6] Aplicando migrações duas vezes para validar idempotência..."
for pass in 1 2; do
  echo "[validacao] Migração — passagem ${pass}/2"
  docker run --rm \
    --network "$NETWORK" \
    -e DATABASE_URL="$DATABASE_URL" \
    "$RUNNER_IMAGE" \
    node scripts/migrate-production.mjs
done

echo "[6/6] Executando testes de integração que usam MySQL..."
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

echo
printf '%s\n' \
  "============================================================" \
  "VALIDAÇÃO GRATUITA CONCLUÍDA COM SUCESSO" \
  "Revisão: ${REVISION}" \
  "Nenhum minuto do GitHub Actions foi utilizado." \
  "============================================================"
