#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/s2licit}"
SOURCE_DIR="${S2_SOURCE_DIR:-/opt/s2-automation/source/s2licit}"
GATE="${WOODPECKER_GATE:-/opt/s2-automation/host/woodpecker-approved-sha.sh}"
LOCK_FILE="${S2_DEPLOY_LOCK:-/run/lock/s2licit-deploy.lock}"
BACKUP_DIR="${S2_PREDEPLOY_BACKUP_DIR:-/opt/backups/s2licit/predeploy}"
REPO_FULL_NAME="s2corporativo/s2licit"
REPO_URL="https://github.com/s2corporativo/s2licit.git"
NEW_IMAGE=""
CURRENT_IMAGE=""
TARGET_SHA=""

log() { printf '[s2-approved] %s\n' "$*"; }
fail() { printf '[s2-approved] ERRO: %s\n' "$*" >&2; exit 2; }

set_env_value() {
  local key="$1" value="$2" file="$APP_DIR/.env"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

wait_ready() {
  local port i
  port="$(grep '^APP_LOCAL_PORT=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- | tail -1)"
  port="${port:-3000}"
  for i in $(seq 1 60); do
    if curl -fsS --connect-timeout 5 --max-time 10 "http://127.0.0.1:${port}/readyz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  return 1
}

rollback_app() {
  local rc="$1"
  trap - ERR
  if [ -n "$CURRENT_IMAGE" ] && docker image inspect "$CURRENT_IMAGE" >/dev/null 2>&1; then
    log "falha apos troca; restaurando imagem anterior $CURRENT_IMAGE"
    set_env_value S2_IMAGE "$CURRENT_IMAGE"
    [ -n "$NEW_IMAGE" ] && set_env_value S2_IMAGE_PREVIOUS "$NEW_IMAGE"
    chmod 600 "$APP_DIR/.env"
    cd "$APP_DIR"
    docker compose --env-file .env up -d --no-build app || true
    wait_ready || true
  else
    log "imagem anterior nao esta disponivel para rollback automatico; backup pre-deploy foi preservado"
  fi
  exit "$rc"
}

for cmd in git docker curl rsync flock gzip; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd ausente"
done
docker compose version >/dev/null 2>&1 || fail "Docker Compose ausente"
[ -x "$GATE" ] || fail "gate Woodpecker ausente: $GATE"
[ -d "$APP_DIR" ] || fail "diretorio de producao ausente: $APP_DIR"
[ -f "$APP_DIR/.env" ] || fail ".env de producao ausente"
[ "$(stat -c '%u:%a' "$APP_DIR/.env")" = "0:600" ] || fail "$APP_DIR/.env deve ser root:root 0600"

exec 9>"$LOCK_FILE"
flock -n 9 || fail "outro deploy S2 Licit esta em andamento"

mkdir -p "$(dirname "$SOURCE_DIR")"
if [ ! -d "$SOURCE_DIR/.git" ]; then
  log "criando checkout operacional publico em $SOURCE_DIR"
  git clone --filter=blob:none --branch main "$REPO_URL" "$SOURCE_DIR"
fi

git -C "$SOURCE_DIR" fetch --prune origin main
git -C "$SOURCE_DIR" checkout -f main
git -C "$SOURCE_DIR" reset --hard origin/main
git -C "$SOURCE_DIR" clean -fdx
TARGET_SHA="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SHA alvo invalido"

DEPLOYED_SHA=""
[ -f "$APP_DIR/.deploy_last_sha" ] && DEPLOYED_SHA="$(cat "$APP_DIR/.deploy_last_sha" 2>/dev/null || true)"
if [ "$DEPLOYED_SHA" = "$TARGET_SHA" ] && wait_ready; then
  log "producao ja esta saudavel no SHA $TARGET_SHA; nada a fazer"
  exit 0
fi

log "exigindo pipeline Woodpecker verde para $TARGET_SHA"
"$GATE" "$REPO_FULL_NAME" "$TARGET_SHA"

NEW_IMAGE="sistema-s2-app:${TARGET_SHA}"
log "construindo imagem imutavel $NEW_IMAGE fora do runtime atual"
docker build --pull -t "$NEW_IMAGE" "$SOURCE_DIR"

git -C "$SOURCE_DIR" fetch --prune origin main
LATEST_SHA="$(git -C "$SOURCE_DIR" rev-parse origin/main)"
[ "$LATEST_SHA" = "$TARGET_SHA" ] || fail "main mudou durante o build; novo SHA precisa passar pelo Woodpecker"

CURRENT_IMAGE="$(grep '^S2_IMAGE=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- | tail -1 || true)"
if [ -z "$CURRENT_IMAGE" ]; then
  CURRENT_IMAGE="$(docker inspect -f '{{.Config.Image}}' sistema-s2-app 2>/dev/null || true)"
fi
if [ -n "$CURRENT_IMAGE" ] && ! docker image inspect "$CURRENT_IMAGE" >/dev/null 2>&1; then
  case "$CURRENT_IMAGE" in
    ghcr.io/*) docker pull "$CURRENT_IMAGE" >/dev/null 2>&1 || true ;;
  esac
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/mysql_${TARGET_SHA}_$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
cd "$APP_DIR"
if docker compose --env-file .env ps db --status running --quiet | grep -q .; then
  log "criando backup MySQL pre-deploy"
  docker compose --env-file .env exec -T db sh -lc \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
    | gzip -9 > "$BACKUP_FILE"
  [ -s "$BACKUP_FILE" ] || fail "backup MySQL pre-deploy ficou vazio"
  chmod 600 "$BACKUP_FILE"
else
  log "banco ainda nao esta em execucao; tratando como primeira instalacao sem backup preexistente"
  rm -f "$BACKUP_FILE"
fi

log "sincronizando somente codigo aprovado para $APP_DIR"
rsync -a --delete \
  --exclude '.git/' \
  --exclude '.env' --exclude '.env.*' \
  --exclude '.deploy_last_sha' \
  --exclude 'node_modules/' --exclude 'dist/' \
  --exclude 'uploads/' --exclude 'backups/' \
  "$SOURCE_DIR/" "$APP_DIR/"

git -C "$SOURCE_DIR" fetch --prune origin main
LATEST_SHA="$(git -C "$SOURCE_DIR" rev-parse origin/main)"
[ "$LATEST_SHA" = "$TARGET_SHA" ] || fail "main mudou antes da troca de imagem; deploy abortado"

if [ -n "$CURRENT_IMAGE" ] && [ "$CURRENT_IMAGE" != "$NEW_IMAGE" ]; then
  set_env_value S2_IMAGE_PREVIOUS "$CURRENT_IMAGE"
fi
set_env_value S2_IMAGE "$NEW_IMAGE"
chmod 600 "$APP_DIR/.env"

trap 'rollback_app "$?"' ERR
log "subindo imagem aprovada; entrypoint executara migrations de producao"
docker compose --env-file .env up -d --no-build --remove-orphans

if ! wait_ready; then
  docker compose --env-file .env ps >&2 || true
  docker compose --env-file .env logs --tail=160 app db >&2 || true
  false
fi

printf '%s\n' "$TARGET_SHA" > "$APP_DIR/.deploy_last_sha"
chmod 600 "$APP_DIR/.deploy_last_sha"
trap - ERR

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'mysql_*.sql.gz' -mtime +14 -delete 2>/dev/null || true
log "deploy concluido e readiness confirmada: $TARGET_SHA"
