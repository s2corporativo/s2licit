#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_CONTAINER="${S2_APP_CONTAINER:-sistema-s2-app}"
REVISION="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
SMOKE_IMAGE="s2licit-capture-smoke:${REVISION}"
ENV_FILE=""

cleanup() {
  if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
    rm -f "$ENV_FILE"
  fi
  docker image rm "$SMOKE_IMAGE" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if ! command -v docker >/dev/null 2>&1; then
  echo "[capture-smoke] Docker não está instalado ou não está no PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[capture-smoke] Docker não está em execução ou o usuário não possui permissão." >&2
  exit 1
fi

if ! docker inspect "$APP_CONTAINER" >/dev/null 2>&1; then
  echo "[capture-smoke] Container da aplicação não encontrado: $APP_CONTAINER" >&2
  echo "[capture-smoke] Defina S2_APP_CONTAINER se o nome for diferente." >&2
  exit 1
fi

APP_NETWORK="$(
  docker inspect \
    --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' \
    "$APP_CONTAINER" | head -n 1
)"

if [ -z "$APP_NETWORK" ]; then
  echo "[capture-smoke] Não foi possível identificar a rede Docker da aplicação." >&2
  exit 1
fi

APP_ENV="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$APP_CONTAINER")"

read_app_env() {
  local key="$1"
  printf '%s\n' "$APP_ENV" | sed -n "s/^${key}=//p" | head -n 1
}

read_container_file() {
  local path="$1"
  if [ -z "$path" ]; then
    return 0
  fi

  docker exec "$APP_CONTAINER" sh -c '
    set -eu
    target="$1"
    if [ ! -f "$target" ]; then
      exit 2
    fi
    cat "$target"
  ' _ "$path"
}

read_app_secret() {
  local key="$1"
  local direct
  local file_var
  local file_path

  direct="$(read_app_env "$key")"
  if [ -n "$direct" ]; then
    printf '%s' "$direct"
    return 0
  fi

  file_var="${key}_FILE"
  file_path="$(read_app_env "$file_var")"
  if [ -z "$file_path" ]; then
    return 0
  fi

  if ! read_container_file "$file_path"; then
    echo "[capture-smoke] Não foi possível ler $file_var dentro do container." >&2
    return 1
  fi
}

DATABASE_URL_VALUE="$(read_app_secret DATABASE_URL)"
ENCRYPTION_KEY_VALUE="$(read_app_secret ENCRYPTION_KEY)"
JWT_SECRET_VALUE="$(read_app_secret JWT_SECRET)"

if [ -z "$DATABASE_URL_VALUE" ]; then
  echo "[capture-smoke] DATABASE_URL/DATABASE_URL_FILE não estão disponíveis no container." >&2
  exit 1
fi

if [ -z "$ENCRYPTION_KEY_VALUE" ] && [ -z "$JWT_SECRET_VALUE" ]; then
  echo "[capture-smoke] ENCRYPTION_KEY/JWT_SECRET (diretos ou *_FILE) não estão disponíveis." >&2
  echo "[capture-smoke] Não é possível descriptografar credenciais do fornecedor com segurança." >&2
  exit 1
fi

umask 077
ENV_FILE="$(mktemp)"
printf 'DATABASE_URL=%s\n' "$DATABASE_URL_VALUE" >> "$ENV_FILE"
if [ -n "$ENCRYPTION_KEY_VALUE" ]; then
  printf 'ENCRYPTION_KEY=%s\n' "$ENCRYPTION_KEY_VALUE" >> "$ENV_FILE"
fi
if [ -n "$JWT_SECRET_VALUE" ]; then
  printf 'JWT_SECRET=%s\n' "$JWT_SECRET_VALUE" >> "$ENV_FILE"
fi
printf 'NODE_ENV=production\n' >> "$ENV_FILE"
printf 'PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium\n' >> "$ENV_FILE"

for optional_key in \
  CAPTURE_SMOKE_TAMBASA_CONFIG_ID \
  CAPTURE_SMOKE_SEARCH_CONFIG_ID \
  CAPTURE_SMOKE_SEARCH_QUERY; do
  optional_value="${!optional_key:-}"
  if [ -n "$optional_value" ]; then
    if printf '%s' "$optional_value" | grep -q $'[\r\n]'; then
      echo "[capture-smoke] $optional_key contém quebra de linha e foi rejeitada." >&2
      exit 1
    fi
    printf '%s=%s\n' "$optional_key" "$optional_value" >> "$ENV_FILE"
  fi
done

echo "[capture-smoke] Revisão: $REVISION"
echo "[capture-smoke] Rede Docker: $APP_NETWORK"
echo "[capture-smoke] Construindo imagem isolada da branch..."

docker build \
  --file Dockerfile.validate \
  --target runner \
  --tag "$SMOKE_IMAGE" \
  .

echo "[capture-smoke] Executando smoke autenticado bounded, sem mutação de catálogo..."

docker run --rm \
  --network "$APP_NETWORK" \
  --env-file "$ENV_FILE" \
  "$SMOKE_IMAGE" \
  pnpm exec tsx server/services/captureConnectorSmoke.ts

echo "[capture-smoke] Smoke dos conectores concluído com sucesso."
