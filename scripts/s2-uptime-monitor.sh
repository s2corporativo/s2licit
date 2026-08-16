#!/bin/bash
# Monitor de disponibilidade do S2 Licit — independente do GitHub Actions.
# Roda a cada 10 minutos via cron systemd. Verifica /healthz e /readyz
# em localhost (evita custo de DNS/proxy externo para o check interno) e, em
# caso de falha sustentada, registra em log e envia alerta por e-mail.
# NOTA: carrega o .env via grep (o dash do Ubuntu 24.04 expande glob ao fazer
# source de arquivos com valores contendo "*").
set -euo pipefail

REPO_DIR="/opt/s2licit"
ENV_FILE="${REPO_DIR}/.env"
env_get() {
  [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true
}

LOCAL_PORT="${S2_LOCAL_PORT:-$(env_get APP_LOCAL_PORT)}"
LOCAL_PORT="${LOCAL_PORT:-8088}"
LOG_DIR="/var/log/s2-licit"
STATE_FILE="${LOG_DIR}/uptime.state"
ALERT_COOLDOWN_MIN=30      # alerta no máximo a cada 30 minutos
MAX_RETRY=3                # falha sustentada: só alerta após 3 verificações
mkdir -p "$LOG_DIR"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "${LOG_DIR}/uptime.log"; }

check() {
  local endpoint="$1" expected="$2" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${LOCAL_PORT}${endpoint}" 2>/dev/null) || code=000
  [ "$code" = "$expected" ]
}

main() {
  local ok=true
  local failures=0
  local report=""

  if ! check /healthz 200; then failures=$((failures + 1)); report="${report} /healthz falhou"; ok=false; fi
  if ! check /readyz 200; then failures=$((failures + 1)); report="${report} /readyz falhou (MySQL?)"; ok=false; fi


  if $ok; then
    log "OK s2.licit"
    rm -f "$STATE_FILE"
    return 0
  fi

  # Contagem de falhas sustentadas
  local count=0
  [ -f "$STATE_FILE" ] && count=$(cat "$STATE_FILE")
  count=$((count + 1))
  echo "$count" > "$STATE_FILE"
  log "FALHA (${count}/${MAX_RETRY}):${report}"

  if [ "$count" -ge "$MAX_RETRY" ]; then
    local last_alert=0
    [ -f "${LOG_DIR}/uptime.lastalert" ] && last_alert=$(cat "${LOG_DIR}/uptime.lastalert")
    local now
    now=$(date +%s)
    if [ $((now - last_alert)) -ge $((ALERT_COOLDOWN_MIN * 60)) ]; then
      echo "$now" > "${LOG_DIR}/uptime.lastalert"
      log "ALERTA enviado (s2.licit fora do ar — falhas:${report})"
      if command -v s2-licit-alert-mail >/dev/null; then
        s2-licit-alert-mail "S2 Licit fora do ar" "Verificação local em :${LOCAL_PORT} falhou ${failures} check(s) por ${count} verificações consecutivas:${report}" || true
      fi
    fi
  fi
}

main "$@"
