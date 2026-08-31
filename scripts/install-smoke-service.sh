#!/usr/bin/env bash
set -Eeuo pipefail

[ "$(id -u)" = "0" ] || { echo "Execute como root" >&2; exit 2; }
APP_DIR="${APP_DIR:-/opt/s2licit}"
ENV_DIR=/etc/s2-automation
ENV_FILE="$ENV_DIR/s2licit-smoke.env"

install -d -m 755 "$ENV_DIR"
chmod 755 "$APP_DIR/scripts/production-smoke-host.sh"
install -m 644 "$APP_DIR/scripts/systemd/s2licit-production-smoke.service" /etc/systemd/system/s2licit-production-smoke.service
install -m 644 "$APP_DIR/scripts/systemd/s2licit-production-smoke.timer" /etc/systemd/system/s2licit-production-smoke.timer

if [ ! -f "$ENV_FILE" ]; then
  install -m 600 "$APP_DIR/scripts/s2licit-smoke.env.example" "$ENV_FILE"
fi
chown root:root "$ENV_FILE"
chmod 600 "$ENV_FILE"
systemctl daemon-reload

if grep -q '^SMOKE_USER_EMAIL=TROCAR$' "$ENV_FILE" || grep -q '^SMOKE_USER_PASSWORD=TROCAR$' "$ENV_FILE"; then
  echo "Smoke preparado, mas timer NAO habilitado: configure conta dedicada em $ENV_FILE"
  exit 0
fi

systemctl start s2licit-production-smoke.service
systemctl enable --now s2licit-production-smoke.timer
echo "Smoke validado e timer habilitado."
