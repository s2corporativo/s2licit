#!/bin/bash
# Monitor de disponibilidade do S2 Licit — independente do GitHub Actions.
# Roda a cada 10 minutos via systemd timer (s2-uptime-monitor.timer).
#
# Política de alerta (revisada em 2026-08-25, após enxurrada de e-mails
# "S2 Licit fora do ar" com o sistema no ar):
#
#   1. A porta local é DESCOBERTA, não adivinhada. O valor fixo antigo (8088)
#      não é a porta local do app — o docker-compose publica
#      127.0.0.1:${APP_LOCAL_PORT:-3000}, e o vps-bootstrap.sh escolhe essa
#      porta dinamicamente (3000/3001/3002/3010). Chutar 8088 significava
#      "conexão recusada" a cada verificação, com o sistema perfeitamente no ar.
#   2. Falha local NUNCA vira e-mail sozinha: antes de alertar, o monitor
#      confirma pela URL pública. Se o público responde, não há indisponi-
#      bilidade — o que há é monitor mal configurado, e isso é dito uma vez
#      por dia, não a cada 30 minutos.
#   3. Alerta real usa backoff exponencial (30min → 1h → 2h → 4h → 8h, teto
#      12h) e um limite de e-mails por incidente. Uma queda longa gera um
#      punhado de avisos, não centenas.
#   4. Quando volta, envia UM aviso de recuperação e zera o estado.
#
# NOTA: carrega o .env via grep (o dash do Ubuntu 24.04 expande glob ao fazer
# source de arquivos com valores contendo "*").
set -euo pipefail

REPO_DIR="${S2_REPO_DIR:-/opt/s2licit}"
ENV_FILE="${REPO_DIR}/.env"
LOG_DIR="${S2_LOG_DIR:-/var/log/s2-licit}"

STATE_FILE="${LOG_DIR}/uptime.state"           # falhas consecutivas
ALERT_COUNT_FILE="${LOG_DIR}/uptime.alertcount" # alertas já enviados no incidente
LAST_ALERT_FILE="${LOG_DIR}/uptime.lastalert"   # epoch do último alerta
MISCONFIG_FILE="${LOG_DIR}/uptime.misconfig"    # epoch do último aviso de config

MAX_RETRY=3                     # falha sustentada: só alerta após 3 verificações
BASE_COOLDOWN_MIN=30            # 1º alerta do incidente: 30 min de silêncio
MAX_COOLDOWN_MIN=720            # teto do backoff: 12 h
MAX_ALERTS_PER_INCIDENT=5       # depois disso, só registra em log
MISCONFIG_COOLDOWN_MIN=1440     # aviso de monitor mal configurado: 1x/dia
CANDIDATE_PORTS="3000 3001 3002 3010 8088"

env_get() {
  [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true
}

log() {
  mkdir -p "$LOG_DIR"
  printf '%s %s\n' "$(date '+%F %T')" "$*" >> "${LOG_DIR}/uptime.log"
}

read_num() { # arquivo → número (0 quando ausente/inválido)
  local f="$1" v=0
  [ -f "$f" ] && v=$(cat "$f" 2>/dev/null || echo 0)
  case "$v" in (*[!0-9]*|"") v=0 ;; esac
  printf '%s' "$v"
}

# Cooldown do incidente: dobra a cada alerta já enviado, com teto.
# Isolada por ser a regra que decide o volume de e-mail — testada em --self-test.
cooldown_minutes() {
  local sent="$1" min="$BASE_COOLDOWN_MIN" i=0
  while [ "$i" -lt "$sent" ]; do
    min=$((min * 2))
    if [ "$min" -ge "$MAX_COOLDOWN_MIN" ]; then printf '%s' "$MAX_COOLDOWN_MIN"; return 0; fi
    i=$((i + 1))
  done
  printf '%s' "$min"
}

http_code() { # url → código HTTP (000 se não conectou)
  # curl devolve string vazia + exit != 0 quando nem conecta; normaliza para 000
  # (concatenar o fallback ao stdout produzia códigos falsos como "000000").
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time "${2:-5}" "$1" 2>/dev/null) || true
  case "$code" in (""|*[!0-9]*) code=000 ;; esac
  printf '%s' "$code"
}

is_2xx() { case "$1" in (2??) return 0 ;; (*) return 1 ;; esac; }

# ── Descoberta da porta local ────────────────────────────────────────────────
# Ordem: variável explícita → .env → porta publicada pelo container → sondagem.
# Só o último recurso é chute, e ainda assim é validado por /healthz.
porta_publicada_pelo_docker() {
  command -v docker >/dev/null 2>&1 || return 1
  local mapped
  mapped=$(docker compose --project-directory "$REPO_DIR" port app 3000 2>/dev/null | tail -1) || true
  [ -z "$mapped" ] && mapped=$(docker ps --format '{{.Ports}}' --filter 'name=sistema-s2-app' 2>/dev/null | head -1) || true
  [ -z "$mapped" ] && return 1
  printf '%s' "$mapped" | grep -oE '[0-9]+->3000' | head -1 | cut -d- -f1
}

resolver_porta() {
  local p
  for p in "${S2_LOCAL_PORT:-}" "$(env_get APP_LOCAL_PORT)" "$(porta_publicada_pelo_docker || true)"; do
    if [ -n "$p" ] && is_2xx "$(http_code "http://127.0.0.1:${p}/healthz")"; then
      printf '%s' "$p"; return 0
    fi
  done
  for p in $CANDIDATE_PORTS; do
    if is_2xx "$(http_code "http://127.0.0.1:${p}/healthz")"; then
      printf '%s' "$p"; return 0
    fi
  done
  # Nada responde: devolve a porta declarada (ou o padrão do docker-compose)
  # apenas para compor o relatório de falha.
  p="${S2_LOCAL_PORT:-$(env_get APP_LOCAL_PORT)}"
  printf '%s' "${p:-3000}"
  return 1
}

url_publica() {
  local u="${S2_PUBLIC_URL:-$(env_get PUBLIC_URL)}"
  if [ -z "$u" ]; then
    local d
    d="$(env_get DOMAIN)"
    [ -n "$d" ] && u="https://${d}"
  fi
  printf '%s' "${u%/}"
}

alertas_habilitados() {
  local flag="${MONITOR_ALERTS_ENABLED:-$(env_get MONITOR_ALERTS_ENABLED)}"
  [ "$flag" != "false" ] && [ "$flag" != "0" ]
}

enviar_mail() { # assunto, corpo
  alertas_habilitados || { log "ALERTA SUPRIMIDO (MONITOR_ALERTS_ENABLED=false): $1"; return 0; }
  if command -v s2-licit-alert-mail >/dev/null; then
    s2-licit-alert-mail "$1" "$2" || log "AVISO: s2-licit-alert-mail falhou ao enviar \"$1\""
  else
    log "AVISO: s2-licit-alert-mail indisponível — alerta apenas em log: $1"
  fi
}

limpar_incidente() {
  rm -f "$STATE_FILE" "$ALERT_COUNT_FILE" "$LAST_ALERT_FILE"
}

main() {
  mkdir -p "$LOG_DIR"

  local porta porta_ok=true
  porta="$(resolver_porta)" || porta_ok=false

  local report="" failures=0 ok=true
  if [ "$porta_ok" = true ]; then
    local code_ready
    code_ready=$(http_code "http://127.0.0.1:${porta}/readyz")
    if ! is_2xx "$code_ready"; then
      failures=1; ok=false
      report=" /readyz respondeu ${code_ready} (banco?)"
    fi
  else
    ok=false
    failures=2
    report=" nenhuma porta local respondeu a /healthz (tentadas: ${CANDIDATE_PORTS})"
  fi

  # ── Caminho feliz ──────────────────────────────────────────────────────────
  if $ok; then
    local alertas_enviados
    alertas_enviados=$(read_num "$ALERT_COUNT_FILE")
    log "OK s2.licit (porta local ${porta})"
    if [ "$alertas_enviados" -gt 0 ]; then
      enviar_mail "S2 Licit recuperado" \
        "O S2 Licit voltou a responder normalmente (porta local ${porta}, /healthz e /readyz OK). Incidente encerrado após ${alertas_enviados} aviso(s)."
      log "RECUPERAÇÃO comunicada (incidente teve ${alertas_enviados} alerta(s))"
    fi
    limpar_incidente
    return 0
  fi

  # ── Confirmação externa antes de chamar de indisponibilidade ───────────────
  # É esta checagem que impede a enxurrada: se o público responde, o sistema
  # não está fora do ar — o problema é do próprio monitor.
  local publico code_pub="" publico_ok=false
  publico="$(url_publica)"
  if [ -n "$publico" ]; then
    code_pub=$(http_code "${publico}/healthz" 10)
    is_2xx "$code_pub" && publico_ok=true
  fi

  if [ "$publico_ok" = true ]; then
    log "FALSO-POSITIVO: checagem local falhou (${report# }) mas ${publico}/healthz respondeu ${code_pub} — sistema NO AR, nenhum alerta de indisponibilidade enviado."
    limpar_incidente
    local ultimo agora
    ultimo=$(read_num "$MISCONFIG_FILE")
    agora=$(date +%s)
    if [ $((agora - ultimo)) -ge $((MISCONFIG_COOLDOWN_MIN * 60)) ]; then
      echo "$agora" > "$MISCONFIG_FILE"
      enviar_mail "Monitor do S2 Licit precisa de ajuste (sistema NO AR)" \
        "A verificação local falhou (${report# }), mas ${publico}/healthz respondeu ${code_pub}: o sistema está no ar e nenhum alerta de queda foi disparado.
Provável causa: APP_LOCAL_PORT ausente ou divergente em ${ENV_FILE} (o docker-compose publica 127.0.0.1:\${APP_LOCAL_PORT:-3000}).
Este aviso é enviado no máximo uma vez por dia."
    fi
    return 0
  fi

  # ── Falha sustentada e não desmentida pelo público ─────────────────────────
  local count
  count=$(read_num "$STATE_FILE")
  count=$((count + 1))
  echo "$count" > "$STATE_FILE"
  local sufixo_pub=""
  [ -n "$publico" ] && sufixo_pub=" — ${publico}/healthz respondeu ${code_pub}"
  log "FALHA (${count}/${MAX_RETRY}):${report}${sufixo_pub}"

  [ "$count" -ge "$MAX_RETRY" ] || return 0

  local alertas_enviados
  alertas_enviados=$(read_num "$ALERT_COUNT_FILE")
  if [ "$alertas_enviados" -ge "$MAX_ALERTS_PER_INCIDENT" ]; then
    log "ALERTA CONTIDO: limite de ${MAX_ALERTS_PER_INCIDENT} e-mails do incidente atingido — falha segue registrada apenas em log."
    return 0
  fi

  local espera last_alert agora
  espera=$(cooldown_minutes "$alertas_enviados")
  last_alert=$(read_num "$LAST_ALERT_FILE")
  agora=$(date +%s)
  if [ $((agora - last_alert)) -lt $((espera * 60)) ]; then
    log "ALERTA EM ESPERA: próximo e-mail deste incidente só após ${espera} min do anterior."
    return 0
  fi

  echo "$agora" > "$LAST_ALERT_FILE"
  echo "$((alertas_enviados + 1))" > "$ALERT_COUNT_FILE"
  local proxima
  proxima=$(cooldown_minutes "$((alertas_enviados + 1))")
  log "ALERTA $((alertas_enviados + 1)) enviado (s2.licit fora do ar —${report})"
  enviar_mail "S2 Licit fora do ar" \
    "Verificação local em 127.0.0.1:${porta} falhou ${failures} check(s) por ${count} verificações consecutivas:${report}${sufixo_pub}

Aviso $((alertas_enviados + 1)) de no máximo ${MAX_ALERTS_PER_INCIDENT} deste incidente; o próximo, se a falha persistir, só sai em ${proxima} min. A recuperação é comunicada automaticamente."
}

# Autoteste da regra de volume de e-mail (executável sem VPS: bash script --self-test).
self_test() {
  local falhas=0
  checar() { # esperado, obtido, rótulo
    if [ "$1" = "$2" ]; then printf 'ok   %s\n' "$3"; else printf 'FALHA %s: esperado %s, obtido %s\n' "$3" "$1" "$2"; falhas=$((falhas + 1)); fi
  }
  checar 30 "$(cooldown_minutes 0)" "1º alerta: 30 min"
  checar 60 "$(cooldown_minutes 1)" "2º alerta: 1 h"
  checar 120 "$(cooldown_minutes 2)" "3º alerta: 2 h"
  checar 240 "$(cooldown_minutes 3)" "4º alerta: 4 h"
  checar 480 "$(cooldown_minutes 4)" "5º alerta: 8 h"
  checar 720 "$(cooldown_minutes 5)" "teto de 12 h"
  checar 720 "$(cooldown_minutes 99)" "teto se mantém"
  is_2xx 200 && checar sim sim "is_2xx 200"
  is_2xx 503 && checar sim nao "is_2xx 503 deveria ser falso" || checar sim sim "is_2xx 503 é falso"
  is_2xx 000 && checar sim nao "is_2xx 000 deveria ser falso" || checar sim sim "is_2xx 000 é falso"
  # Volume máximo por incidente, em 24 h: 5 e-mails (contra 48 da versão antiga).
  checar 5 "$MAX_ALERTS_PER_INCIDENT" "teto de e-mails por incidente"
  [ "$falhas" -eq 0 ] && { echo "self-test OK"; return 0; }
  echo "self-test com ${falhas} falha(s)"; return 1
}

case "${1:-}" in
  --self-test) self_test ;;
  *) main "$@" ;;
esac
