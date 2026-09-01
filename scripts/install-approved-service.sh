#!/usr/bin/env bash
set -Eeuo pipefail

[ "$(id -u)" = "0" ] || { echo "Execute como root" >&2; exit 2; }
APP_DIR="${APP_DIR:-/opt/s2licit}"
SERVICE_SRC="$APP_DIR/scripts/systemd/s2licit-deploy-approved.service"
GATE="/opt/s2-automation/host/woodpecker-approved-sha.sh"
ENV_FILE="/etc/s2-automation/woodpecker.env"

[ -f "$SERVICE_SRC" ] || { echo "Service file ausente: $SERVICE_SRC" >&2; exit 2; }
[ -x "$GATE" ] || { echo "Instale primeiro o gate host-level central em $GATE" >&2; exit 2; }
[ -f "$ENV_FILE" ] || { echo "Credencial Woodpecker ausente: $ENV_FILE" >&2; exit 2; }
[ "$(stat -c '%u:%a' "$ENV_FILE")" = "0:600" ] || {
  echo "$ENV_FILE deve ser root:root 0600" >&2
  exit 2
}
grep -q '^WOODPECKER_TOKEN=TROCAR$' "$ENV_FILE" && {
  echo "WOODPECKER_TOKEN ainda e placeholder; servico nao sera instalado." >&2
  exit 2
}

TIMER_SRC="$APP_DIR/scripts/systemd/s2licit-deploy-approved.timer"
[ -f "$TIMER_SRC" ] || { echo "Timer file ausente: $TIMER_SRC" >&2; exit 2; }

chmod 755 "$APP_DIR/scripts/vps-deploy-approved.sh"
install -m 644 "$SERVICE_SRC" /etc/systemd/system/s2licit-deploy-approved.service
install -m 644 "$TIMER_SRC" /etc/systemd/system/s2licit-deploy-approved.timer
systemctl daemon-reload
systemctl enable --now s2licit-deploy-approved.timer

echo "Servico e timer instalados: merge aprovado na main entra no ar em ate ~5 min."
echo "Deploy imediato (sem esperar o timer):"
echo "  systemctl start s2licit-deploy-approved.service"
echo "Acompanhar:"
echo "  journalctl -u s2licit-deploy-approved.service -n 200 --no-pager"
echo "Desativar o deploy automatico:"
echo "  systemctl disable --now s2licit-deploy-approved.timer"
