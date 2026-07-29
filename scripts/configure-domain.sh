#!/usr/bin/env bash
# Configura o S2 Licit no domínio oficial usando Nginx + Let's Encrypt.
# Uso: bash scripts/configure-domain.sh [dominio] [ipv4-esperado]
set -Eeuo pipefail

DOMAIN="${1:-s2.s2corporativo.com.br}"
EXPECTED_IPV4="${2:-13.140.167.153}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '[dominio] %s\n' "$*"; }
die() { printf '[dominio] ERRO: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || die "Execute como root."
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "Domínio inválido: $DOMAIN"
[[ "$EXPECTED_IPV4" =~ ^[0-9.]+$ ]] || die "IPv4 esperado inválido: $EXPECTED_IPV4"

cd "$PROJECT_DIR"
[[ -f .env ]] || die "Arquivo $PROJECT_DIR/.env não encontrado."
[[ -f docker-compose.yml ]] || die "docker-compose.yml não encontrado."
command -v docker >/dev/null || die "Docker não está instalado."
docker compose version >/dev/null || die "Docker Compose não está disponível."
command -v ss >/dev/null || die "O utilitário ss não está disponível."

log "Conferindo se o DNS de $DOMAIN já aponta para $EXPECTED_IPV4..."
RESOLVED_IPV4="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u || true)"
if ! grep -Fxq "$EXPECTED_IPV4" <<<"$RESOLVED_IPV4"; then
  printf '\n[dominio] O DNS ainda não aponta para esta VPS.\n' >&2
  printf '[dominio] Crie/ajuste o registro: tipo A | nome s2 | valor %s | somente DNS.\n' "$EXPECTED_IPV4" >&2
  printf '[dominio] Endereços vistos agora: %s\n\n' "${RESOLVED_IPV4:-nenhum}" >&2
  exit 2
fi

read_env() {
  local key="$1"
  grep -E "^${key}=" .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"' | xargs || true
}

upsert_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

port_in_use() {
  ss -H -ltn "sport = :$1" 2>/dev/null | grep -q .
}

port_owned_by_current_s2() {
  [[ "$(docker inspect -f '{{.State.Running}}' sistema-s2-app 2>/dev/null || true)" == "true" ]] || return 1
  docker port sistema-s2-app 3000/tcp 2>/dev/null | grep -Eq "(^|:|\])$1$"
}

port_available_for_s2() {
  local port="$1"
  ! port_in_use "$port" || port_owned_by_current_s2 "$port"
}

choose_port() {
  local preferred="$1"
  shift
  local port
  for port in "$preferred" "$@"; do
    [[ "$port" =~ ^[0-9]+$ ]] || continue
    if port_available_for_s2 "$port"; then
      printf '%s\n' "$port"
      return 0
    fi
  done
  return 1
}

REQUESTED_LOCAL_PORT="${APP_LOCAL_PORT:-$(read_env APP_LOCAL_PORT)}"
REQUESTED_PUBLIC_PORT="${APP_HTTP_PORT:-$(read_env APP_HTTP_PORT)}"
REQUESTED_LOCAL_PORT="${REQUESTED_LOCAL_PORT:-3000}"
REQUESTED_PUBLIC_PORT="${REQUESTED_PUBLIC_PORT:-8080}"

APP_LOCAL_PORT="$(choose_port "$REQUESTED_LOCAL_PORT" 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010)" \
  || die "Nenhuma porta local livre encontrada entre 3000 e 3010."
APP_PUBLIC_PORT="$(choose_port "$REQUESTED_PUBLIC_PORT" 8080 8081 8082 8083 8084 8085 8086 8087 8088 8089 8090)" \
  || die "Nenhuma porta pública de diagnóstico livre encontrada entre 8080 e 8090."

if [[ "$APP_LOCAL_PORT" != "$REQUESTED_LOCAL_PORT" ]]; then
  log "A porta local $REQUESTED_LOCAL_PORT já está ocupada; usando 127.0.0.1:${APP_LOCAL_PORT}."
fi
if [[ "$APP_PUBLIC_PORT" != "$REQUESTED_PUBLIC_PORT" ]]; then
  log "A porta pública $REQUESTED_PUBLIC_PORT já está ocupada; usando ${APP_PUBLIC_PORT}."
fi

ENV_BACKUP="/root/s2licit-env-antes-dominio-$(date +%Y%m%d-%H%M%S)"
cp -a .env "$ENV_BACKUP"
log "Backup do .env criado em $ENV_BACKUP"

# O Nginx assume 80/443. O app usa uma porta local livre e, opcionalmente,
# outra porta pública apenas para diagnóstico direto.
upsert_env DOMAIN "$DOMAIN"
upsert_env FORCE_SECURE_COOKIES true
upsert_env APP_LOCAL_PORT "$APP_LOCAL_PORT"
upsert_env APP_HTTP_PORT "$APP_PUBLIC_PORT"

log "Executando validação e deploy gratuito do aplicativo..."
bash scripts/deploy-free.sh

log "Verificando a aplicação local em 127.0.0.1:${APP_LOCAL_PORT}..."
for attempt in $(seq 1 30); do
  if curl -fsS --max-time 5 "http://127.0.0.1:${APP_LOCAL_PORT}/readyz" >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    docker compose logs --tail=150 app || true
    die "A aplicação não respondeu em /readyz."
  fi
  sleep 2
done

# Depois que o app sai da porta 80, apenas Nginx pode ocupar 80/443.
FOREIGN_LISTENER="$(ss -ltnp 2>/dev/null | awk '$4 ~ /:(80|443)$/ && $0 !~ /nginx/ {print}' || true)"
if [[ -n "$FOREIGN_LISTENER" ]]; then
  printf '%s\n' "$FOREIGN_LISTENER" >&2
  die "As portas 80/443 estão ocupadas por outro serviço. Não alterei esse serviço."
fi

log "Instalando Nginx e Certbot pelos repositórios do Ubuntu..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx certbot python3-certbot-nginx

NGINX_CONF="/etc/nginx/sites-available/s2licit.conf"
cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:${APP_LOCAL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

ln -sfn "$NGINX_CONF" /etc/nginx/sites-enabled/s2licit.conf
nginx -t
systemctl enable --now nginx
systemctl reload nginx

if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  ufw allow OpenSSH >/dev/null
  ufw allow 'Nginx Full' >/dev/null
fi

CERTBOT_EMAIL="${CERTBOT_EMAIL:-$(grep -E '^ADMIN_EMAIL=' .env | tail -n1 | cut -d= -f2- | tr -d '"' | xargs || true)}"
CERTBOT_ARGS=(
  --nginx
  --domain "$DOMAIN"
  --redirect
  --non-interactive
  --agree-tos
  --keep-until-expiring
)

if [[ "$CERTBOT_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  CERTBOT_ARGS+=(--email "$CERTBOT_EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

log "Emitindo/renovando o certificado HTTPS gratuito..."
certbot "${CERTBOT_ARGS[@]}"
systemctl enable --now certbot.timer 2>/dev/null || true
nginx -t
systemctl reload nginx

log "Testando https://${DOMAIN}/ ..."
curl -fsSI --max-time 20 "https://${DOMAIN}/" | head -n 8

cat <<EOF

[dominio] CONFIGURAÇÃO CONCLUÍDA
[dominio] Endereço oficial: https://${DOMAIN}
[dominio] Aplicação local:  http://127.0.0.1:${APP_LOCAL_PORT}
[dominio] Porta pública de diagnóstico: ${APP_PUBLIC_PORT}
[dominio] Certificado: renovação automática pelo certbot.timer
EOF
