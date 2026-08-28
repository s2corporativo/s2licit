#!/usr/bin/env bash
# ============================================================
# Backup diário dos uploads — S2 Licit (produção)
#
# Gera tar.gz do volume uploads_data no host, verifica integridade, aplica
# retenção e, quando configurado, executa BACKUP_OFFSITE_COMMAND no host.
# A leitura do .env é pontual: o arquivo nunca é `source`/executado como shell.
# ============================================================
set -Eeuo pipefail

DIR_SCRIPT="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR_SCRIPT/.." && pwd)"
cd "$ROOT"

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
if [ -z "${BACKUP_UPLOADS_MANTER:-}" ]; then
  BACKUP_UPLOADS_MANTER="$(read_env_key BACKUP_UPLOADS_MANTER || true)"
fi

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups/uploads}"
MANTER="${BACKUP_UPLOADS_MANTER:-7}"
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  log "❌ Docker Compose v2 não está disponível."
  exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
  log "❌ tar não está disponível no host."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
ARQ="$BACKUP_DIR/uploads-${TS}.tar.gz"
TMP="${ARQ}.part"

ESTADO="$(docker inspect -f '{{.State.Status}}' sistema-s2-app 2>/dev/null || true)"
log "📦 Backup dos uploads → $ARQ"
trap 'rm -f "$TMP"' EXIT

if [ "$ESTADO" = "running" ]; then
  docker compose exec -T app tar -czf - -C /app uploads > "$TMP"
else
  log "App não está rodando (estado: ${ESTADO:-ausente}); usando container efêmero."
  docker compose run --rm --no-deps -T app tar -czf - -C /app uploads > "$TMP"
fi

tar -tzf "$TMP" > /dev/null
mv "$TMP" "$ARQ"
log "✅ Concluído e íntegro: $ARQ ($(du -sh "$ARQ" | cut -f1))"

ls -t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -n "+$((MANTER + 1))" | xargs -r rm -f
log "♻️ Rotação: mantidas as ${MANTER} cópias mais recentes"

if [ -n "$BACKUP_OFFSITE_COMMAND" ]; then
  log "☁️ Enviando cópia offsite pelo host..."
  if BACKUP_FILE="$ARQ" sh -c "$BACKUP_OFFSITE_COMMAND"; then
    log "✅ Cópia offsite concluída."
  else
    log "❌ Falha no envio offsite — backup local preservado em $ARQ."
    exit 1
  fi
else
  log "ℹ️ Offsite desativado; defina BACKUP_OFFSITE_COMMAND no .env ou ambiente do cron."
fi
