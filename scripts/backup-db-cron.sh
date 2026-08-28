#!/usr/bin/env bash
set -Eeuo pipefail

DIR_SCRIPT="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR_SCRIPT/.." && pwd)"
cd "$ROOT"

HOST_BACKUP_DIR="${BACKUP_HOST_DIR:-$ROOT/backups/db}"
mkdir -p "$HOST_BACKUP_DIR"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

read_env_key() {
  local key="$1" line value first last
  [ -f .env ] || return 1
  line="$(grep -m1 -E "^${key}=" .env 2>/dev/null || true)"
  [ -n "$line" ] || return 1
  value="${line#*=}"
  if [ "${#value}" -ge 2 ]; then
    first="${value:0:1}"
    last="${value: -1}"
    if { [ "$first" = '"' ] && [ "$last" = '"' ]; } || { [ "$first" = "'" ] && [ "$last" = "'" ]; }; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "$value"
}

if [ -z "${BACKUP_OFFSITE_COMMAND:-}" ]; then
  BACKUP_OFFSITE_COMMAND="$(read_env_key BACKUP_OFFSITE_COMMAND || true)"
fi
if [ -z "${BACKUP_KEEP_DAYS:-}" ]; then
  BACKUP_KEEP_DAYS="$(read_env_key BACKUP_KEEP_DAYS || true)"
fi
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  log "❌ Docker Compose v2 não está disponível."
  exit 1
fi
if ! command -v gzip >/dev/null 2>&1; then
  log "❌ gzip não está disponível no host."
  exit 1
fi

app_running() {
  docker compose ps --status running --services 2>/dev/null | grep -qx app
}

run_in_app() {
  if app_running; then
    docker compose exec -T app "$@"
  else
    docker compose run --rm -T app "$@"
  fi
}

log "🗄️ Gerando backup do banco dentro do container..."
run_in_app node scripts/backup-db.mjs /app/backups

REMOTE_FILE="$(run_in_app sh -lc 'ls -1t /app/backups/s2-backup-*.sql.gz 2>/dev/null | head -n 1' | tr -d '\r')"
if [ -z "$REMOTE_FILE" ]; then
  log "❌ Nenhum backup foi encontrado em /app/backups após o dump."
  exit 1
fi

BASENAME="$(basename "$REMOTE_FILE")"
HOST_FILE="$HOST_BACKUP_DIR/$BASENAME"
TMP_FILE="${HOST_FILE}.part"
trap 'rm -f "$TMP_FILE"' EXIT

log "📥 Copiando evidência verificada para o host: $HOST_FILE"
run_in_app cat "$REMOTE_FILE" > "$TMP_FILE"
gzip -t "$TMP_FILE"
mv "$TMP_FILE" "$HOST_FILE"

find "$HOST_BACKUP_DIR" -maxdepth 1 -type f -name 's2-backup-*.sql.gz' -mtime "+${BACKUP_KEEP_DAYS}" -delete 2>/dev/null || true
log "✅ Backup local concluído: $HOST_FILE"

if [ -n "$BACKUP_OFFSITE_COMMAND" ]; then
  log "☁️ Enviando cópia offsite pelo host..."
  if BACKUP_FILE="$HOST_FILE" sh -c "$BACKUP_OFFSITE_COMMAND"; then
    log "✅ Cópia offsite concluída."
  else
    log "❌ Cópia offsite falhou; o backup local foi preservado em $HOST_FILE."
    exit 1
  fi
else
  log "ℹ️ Offsite desativado; defina BACKUP_OFFSITE_COMMAND no .env ou ambiente do cron."
fi
