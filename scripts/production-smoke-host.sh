#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${S2_SMOKE_ENV_FILE:-/etc/s2-automation/s2licit-smoke.env}"
CONTAINER="${S2_APP_CONTAINER:-sistema-s2-app}"
EVIDENCE_ROOT="${S2_SMOKE_EVIDENCE_DIR:-/opt/backups/s2licit/smoke}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
REMOTE_DIR="/tmp/s2-production-smoke"
LOCAL_DIR="$EVIDENCE_ROOT/$RUN_ID"

fail() { printf '[s2-smoke] ERRO: %s\n' "$*" >&2; exit 2; }

[ -f "$ENV_FILE" ] || fail "credenciais ausentes: $ENV_FILE"
[ "$(stat -c '%u:%a' "$ENV_FILE")" = "0:600" ] || fail "$ENV_FILE deve ser root:root 0600"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

[ -n "${SMOKE_USER_EMAIL:-}" ] || fail "SMOKE_USER_EMAIL vazio"
[ -n "${SMOKE_USER_PASSWORD:-}" ] || fail "SMOKE_USER_PASSWORD vazio"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-https://s2.s2corporativo.com.br}"
SMOKE_ROUTES="${SMOKE_ROUTES:-}"
SMOKE_MFA_TOKEN="${SMOKE_MFA_TOKEN:-}"

command -v docker >/dev/null 2>&1 || fail "docker ausente"
docker inspect "$CONTAINER" >/dev/null 2>&1 || fail "container $CONTAINER ausente"

mkdir -p "$EVIDENCE_ROOT"
chmod 700 "$EVIDENCE_ROOT"
docker exec "$CONTAINER" sh -lc "rm -rf '$REMOTE_DIR' && mkdir -p '$REMOTE_DIR'"

rc=0
docker exec \
  -e SMOKE_BASE_URL="$SMOKE_BASE_URL" \
  -e SMOKE_USER_EMAIL="$SMOKE_USER_EMAIL" \
  -e SMOKE_USER_PASSWORD="$SMOKE_USER_PASSWORD" \
  -e SMOKE_MFA_TOKEN="$SMOKE_MFA_TOKEN" \
  -e SMOKE_ROUTES="$SMOKE_ROUTES" \
  -e SMOKE_SCREENSHOT_DIR="$REMOTE_DIR" \
  -e PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
  "$CONTAINER" node scripts/production-smoke.mjs || rc=$?

mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"
docker cp "$CONTAINER:$REMOTE_DIR/." "$LOCAL_DIR/" >/dev/null 2>&1 || true
docker exec "$CONTAINER" sh -lc "rm -rf '$REMOTE_DIR'" >/dev/null 2>&1 || true
find "$EVIDENCE_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} + 2>/dev/null || true

if [ "$rc" -ne 0 ]; then
  printf '[s2-smoke] FALHOU rc=%s evidencia=%s\n' "$rc" "$LOCAL_DIR" >&2
  exit "$rc"
fi
printf '[s2-smoke] APROVADO evidencia=%s\n' "$LOCAL_DIR"
