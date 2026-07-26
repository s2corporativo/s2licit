#!/usr/bin/env bash
# Bootstrap/atualização do Sistema S2 numa VPS Ubuntu/Debian.
# Idempotente: pode rodar quantas vezes quiser (primeira instalação e updates).
#
# Pré-condição: o código do repositório já está em /opt/s2licit
# (o workflow deploy-vps.yml faz o rsync antes de chamar este script).
set -euo pipefail

APP_DIR=/opt/s2licit
cd "$APP_DIR"

set_env_value() {
  local key="$1"
  local value="$2"
  KEY="$key" VALUE="$value" python3 - <<'PY'
import os
from pathlib import Path

key = os.environ["KEY"]
value = os.environ["VALUE"]
if "\n" in value or "\r" in value:
    raise SystemExit(f"Valor multilinha não permitido para {key}")
path = Path(".env")
lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
replacement = f"{key}={value}"
output = []
updated = False
for line in lines:
    if line.startswith(f"{key}="):
        if not updated:
            output.append(replacement)
            updated = True
    else:
        output.append(line)
if not updated:
    output.append(replacement)
tmp = path.with_suffix(".env.tmp")
tmp.write_text("\n".join(output) + "\n", encoding="utf-8")
os.chmod(tmp, 0o600)
os.replace(tmp, path)
PY
}

read_env_value() {
  grep "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- || true
}

json_status_is() {
  local expected="$1"
  EXPECTED="$expected" python3 -c '
import json, os, sys
try:
    payload = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if payload.get("status") == os.environ["EXPECTED"] else 1)
'
}

echo "==> [1/6] Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi
docker --version

echo "==> [2/6] Arquivo .env"
if [ ! -f .env ]; then
  echo "Primeira instalação: gerando segredos..."
  MYSQL_ROOT_PASSWORD=$(openssl rand -hex 24)
  MYSQL_PASSWORD=$(openssl rand -hex 24)
  JWT_SECRET=$(openssl rand -hex 48)
  ENCRYPTION_KEY=$(openssl rand -hex 48)
  ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-16)
  ADMIN_EMAIL_BOOTSTRAP=${ADMIN_EMAIL:-admin@s2.example}

  case "$ADMIN_EMAIL_BOOTSTRAP" in
    *' '*|*$'\n'*|*$'\r'*|''|*@*.*) ;;
    *)
      echo "❌ ADMIN_EMAIL inválido para a instalação inicial." >&2
      exit 1
      ;;
  esac

  cat > .env <<EOF
# Gerado automaticamente pelo vps-bootstrap.sh em $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Referência completa de variáveis: .env.production.example

# ── Banco ──
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_DATABASE=sistema_s2
MYSQL_USER=s2user
MYSQL_PASSWORD=${MYSQL_PASSWORD}

# ── Segurança ──
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# ── Administrador inicial ──
ADMIN_EMAIL=${ADMIN_EMAIL_BOOTSTRAP}
ADMIN_PASSWORD=${ADMIN_PASSWORD}

# ── Domínio/certificado ──
DOMAIN=
CERTBOT_EMAIL=

# ── IA ──
AI_PROVIDER=auto
ANTHROPIC_API_KEY=
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

# ── E-mail: leitura de cotações (IMAP) e envio de respostas (SMTP) ──
IMAP_HOST=
IMAP_PORT=993
IMAP_USER=
IMAP_PASSWORD=
IMAP_TLS=true
IMAP_MAILBOX=INBOX
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=false
SMTP_FROM=

# ── Agendador ──
EMAIL_SYNC_ENABLED=true
EMAIL_SYNC_CRON=*/15 * * * *
ALERTS_ENABLED=true
ALERTS_CRON=0 8 * * *

# ── WhatsApp para alertas (opcional) ──
WHATSAPP_PHONE_ID=
WHATSAPP_TOKEN=
WHATSAPP_API_VERSION=v21.0
WHATSAPP_WEBHOOK_URL=
WHATSAPP_TO=

# ── Puppeteer ──
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
EOF
  chmod 600 .env

  cat > /root/s2licit-acesso.txt <<EOF
Sistema S2 — credenciais geradas em $(date -u +%Y-%m-%dT%H:%M:%SZ)
URL:    http://$(hostname -I | awk '{print $1}')/
Login:  ${ADMIN_EMAIL_BOOTSTRAP}
Senha:  ${ADMIN_PASSWORD}

IMPORTANTE: apague este arquivo após o primeiro login
(rm /root/s2licit-acesso.txt). Ele expira sozinho em 7 dias.
(Os demais segredos estão em ${APP_DIR}/.env — não apague esse arquivo.)
EOF
  chmod 400 /root/s2licit-acesso.txt
  cat > /etc/cron.d/s2licit-acesso-expira <<'CRON'
0 3 * * * root find /root/s2licit-acesso.txt -mtime +7 -delete 2>/dev/null
CRON
  chmod 644 /etc/cron.d/s2licit-acesso-expira
  echo "Credenciais salvas em /root/s2licit-acesso.txt (expira em 7 dias)."
else
  echo ".env já existe — mantendo segredos atuais."
fi

echo "==> [3/6] Domínio (HTTPS automático)"
if [ -n "${DOMAIN:-}" ]; then
  case "$DOMAIN" in
    *[!A-Za-z0-9.-]*|.*|*..*|*-|-*|*.)
      echo "❌ DOMAIN inválido: $DOMAIN" >&2
      exit 1
      ;;
  esac
  set_env_value DOMAIN "$DOMAIN"
  echo "Domínio configurado: ${DOMAIN}"
fi

if [ -n "${CERTBOT_EMAIL:-}" ]; then
  case "$CERTBOT_EMAIL" in
    *' '*|*$'\n'*|*$'\r'*|''|*@*.*) ;;
    *)
      echo "❌ CERTBOT_EMAIL inválido." >&2
      exit 1
      ;;
  esac
  set_env_value CERTBOT_EMAIL "$CERTBOT_EMAIL"
fi

DOMAIN_ATUAL=$(read_env_value DOMAIN)
CERTBOT_EMAIL_ATUAL=$(read_env_value CERTBOT_EMAIL)
[ -n "$DOMAIN_ATUAL" ] && echo "Domínio ativo: ${DOMAIN_ATUAL}" || echo "Nenhum domínio configurado (acesso só por IP)."

echo "==> [4/6] Build e subida dos containers"
docker compose stop app >/dev/null 2>&1 || true

porta_ocupada() {
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "(:|\.)$1\$"
}

primeira_porta_livre() {
  for p in "$@"; do
    [ -n "$p" ] || continue
    if ! porta_ocupada "$p"; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

garantir_porta() {
  local var="$1"
  shift
  local atual
  local livre
  atual=$(read_env_value "$var")
  livre=$(primeira_porta_livre "$atual" "$@") || {
    echo "❌ Nenhuma porta livre para ${var} (testadas: ${atual} $*)" >&2
    exit 1
  }
  if [ "$livre" = "$atual" ]; then
    return 0
  fi
  set_env_value "$var" "$livre"
  if [ -n "$atual" ]; then
    echo "⚠️ Porta ${atual} (${var}) ficou ocupada — trocando para :${livre}."
  else
    echo "${var} configurada em :${livre}."
  fi
}

if [ -n "$DOMAIN_ATUAL" ]; then
  atual_http=$(read_env_value APP_HTTP_PORT)
  if [ "$atual_http" = "80" ]; then
    sed -i '/^APP_HTTP_PORT=/d' .env
  fi
  garantir_porta APP_HTTP_PORT 8080 8088 8090 8181
else
  garantir_porta APP_HTTP_PORT 80 8080 8088 8090 8181
fi
garantir_porta APP_LOCAL_PORT 3000 3001 3002 3010
HTTP_PORT=$(read_env_value APP_HTTP_PORT)
LOCAL_PORT=$(read_env_value APP_LOCAL_PORT)
echo "Portas: pública :${HTTP_PORT} · local :${LOCAL_PORT}"

if [ -n "${S2_IMAGE:-}" ]; then
  ATUAL=$(read_env_value S2_IMAGE)
  if [ -n "$ATUAL" ] && [ "$ATUAL" != "$S2_IMAGE" ]; then
    set_env_value S2_IMAGE_PREVIOUS "$ATUAL"
  fi
  set_env_value S2_IMAGE "$S2_IMAGE"
  docker compose pull app
  docker compose up -d
else
  docker compose up -d --build
fi

echo "==> [5/6] Aguardando o app ficar saudável (porta local ${LOCAL_PORT})"
ok=0
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${LOCAL_PORT}/healthz" 2>/dev/null | json_status_is ok; then
    ok=1
    break
  fi
  if [ $((i % 6)) -eq 0 ]; then
    echo "   ... aguardando (${i}x5s) — app: $(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' sistema-s2-app 2>/dev/null || echo desconhecido)"
  fi
  sleep 5
done
if [ "$ok" = "1" ]; then
  echo "App respondendo em /healthz com identidade válida ✅"
else
  echo "App NÃO respondeu corretamente em 5 min — estado e últimos logs:" >&2
  docker compose ps >&2 || true
  docker compose logs --tail=150 app >&2 || true
  exit 1
fi

verify_nginx_host() {
  local body
  for _ in $(seq 1 12); do
    body=$(curl -fsS -H "Host: ${DOMAIN_ATUAL}" "http://127.0.0.1/healthz" 2>/dev/null || true)
    if printf '%s' "$body" | json_status_is ok; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if [ -n "$DOMAIN_ATUAL" ]; then
  echo "==> [Extra] HTTPS para ${DOMAIN_ATUAL}"

  nginx_ocupa_portas=false
  if command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx \
     && ss -ltnp 2>/dev/null | grep -q 'nginx'; then
    nginx_ocupa_portas=true
  fi

  if [ "$nginx_ocupa_portas" = true ]; then
    echo "Nginx já em uso nesta VPS — criando vhost exclusivo e prioritário para ${DOMAIN_ATUAL}."

    if command -v caddy >/dev/null 2>&1; then
      systemctl stop caddy >/dev/null 2>&1 || true
      systemctl disable caddy >/dev/null 2>&1 || true
    fi

    if [ -d /etc/nginx/sites-enabled ]; then
      NGINX_SITE_PATH=/etc/nginx/sites-available/00-s2licit.conf
      NGINX_ENABLED_PATH=/etc/nginx/sites-enabled/00-s2licit.conf
      rm -f /etc/nginx/sites-enabled/s2licit.conf /etc/nginx/sites-available/s2licit.conf
    else
      NGINX_SITE_PATH=/etc/nginx/conf.d/00-s2licit.conf
      NGINX_ENABLED_PATH="$NGINX_SITE_PATH"
      rm -f /etc/nginx/conf.d/s2licit.conf
    fi

    cat > "$NGINX_SITE_PATH" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_ATUAL};

    location / {
        proxy_pass http://127.0.0.1:${LOCAL_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    if [ "$NGINX_SITE_PATH" != "$NGINX_ENABLED_PATH" ]; then
      ln -sf "$NGINX_SITE_PATH" "$NGINX_ENABLED_PATH"
    fi

    if ! nginx -t 2>/tmp/s2licit-nginx-test.log; then
      echo "❌ Configuração do Nginx inválida; vhost do S2 removido." >&2
      cat /tmp/s2licit-nginx-test.log >&2
      rm -f "$NGINX_ENABLED_PATH"
      [ "$NGINX_SITE_PATH" != "$NGINX_ENABLED_PATH" ] && rm -f "$NGINX_SITE_PATH"
      exit 1
    fi
    if grep -qi "conflicting server name.*${DOMAIN_ATUAL}" /tmp/s2licit-nginx-test.log; then
      echo "❌ Existe outro vhost declarando exatamente ${DOMAIN_ATUAL}." >&2
      cat /tmp/s2licit-nginx-test.log >&2
      exit 1
    fi

    systemctl reload nginx
    if ! verify_nginx_host; then
      echo "❌ O Nginx não encaminhou ${DOMAIN_ATUAL}/healthz ao Sistema S2." >&2
      nginx -T 2>/dev/null | grep -n -B3 -A12 "server_name ${DOMAIN_ATUAL}" >&2 || true
      exit 1
    fi
    echo "Vhost do Nginx validado por Host header ✅"

    if ! command -v certbot >/dev/null 2>&1; then
      echo "Instalando certbot..."
      apt-get update -qq
      apt-get install -y -qq certbot python3-certbot-nginx
    fi
    CERTBOT_ARGS=(--nginx -d "$DOMAIN_ATUAL" --non-interactive --agree-tos --redirect --quiet)
    if [ -n "$CERTBOT_EMAIL_ATUAL" ]; then
      CERTBOT_ARGS+=(-m "$CERTBOT_EMAIL_ATUAL")
    else
      CERTBOT_ARGS+=(--register-unsafely-without-email)
    fi
    if certbot "${CERTBOT_ARGS[@]}"; then
      echo "Certificado HTTPS emitido via certbot para ${DOMAIN_ATUAL}."
    else
      echo "⚠️ Certbot não emitiu o certificado. O vhost HTTP do S2 está correto; confira DNS e tente novamente." >&2
    fi
  else
    ocupante_80=$(ss -ltnp 2>/dev/null | awk '$4 ~ /:80$/')
    ocupante_443=$(ss -ltnp 2>/dev/null | awk '$4 ~ /:443$/')
    if { [ -n "$ocupante_80" ] || [ -n "$ocupante_443" ]; } \
       && ! systemctl is-active --quiet caddy 2>/dev/null; then
      echo "❌ Portas 80/443 ocupadas por processo que não é Nginx/Caddy:" >&2
      [ -n "$ocupante_80" ] && echo "  :80  -> ${ocupante_80}" >&2
      [ -n "$ocupante_443" ] && echo "  :443 -> ${ocupante_443}" >&2
      exit 1
    fi

    if ! command -v caddy >/dev/null 2>&1; then
      echo "Instalando Caddy..."
      apt-get update -qq
      apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        > /etc/apt/sources.list.d/caddy-stable.list
      apt-get update -qq
      apt-get install -y -qq caddy
    fi

    CADDYFILE=/etc/caddy/Caddyfile
    cp -a "$CADDYFILE" "${CADDYFILE}.s2-backup" 2>/dev/null || true
    DOMAIN_VALUE="$DOMAIN_ATUAL" LOCAL_PORT_VALUE="$LOCAL_PORT" CADDYFILE_VALUE="$CADDYFILE" python3 - <<'PY'
import os, re
from pathlib import Path

path = Path(os.environ["CADDYFILE_VALUE"])
text = path.read_text(encoding="utf-8") if path.exists() else ""
text = re.sub(
    r"\n?# BEGIN S2LICIT\n.*?# END S2LICIT\n?",
    "\n",
    text,
    flags=re.S,
).rstrip()
block = f'''# BEGIN S2LICIT
{os.environ["DOMAIN_VALUE"]} {{
    reverse_proxy 127.0.0.1:{os.environ["LOCAL_PORT_VALUE"]}
}}
# END S2LICIT'''
path.write_text((text + "\n\n" + block + "\n").lstrip(), encoding="utf-8")
PY

    if ! caddy validate --config "$CADDYFILE" >/tmp/s2licit-caddy-test.log 2>&1; then
      echo "❌ Configuração do Caddy inválida; restaurando arquivo anterior." >&2
      cat /tmp/s2licit-caddy-test.log >&2
      [ -f "${CADDYFILE}.s2-backup" ] && cp -a "${CADDYFILE}.s2-backup" "$CADDYFILE"
      exit 1
    fi
    systemctl enable caddy >/dev/null 2>&1 || true
    systemctl restart caddy
    if ! systemctl is-active --quiet caddy; then
      echo "❌ Caddy não iniciou." >&2
      journalctl -u caddy --no-pager -n 40 >&2 || true
      exit 1
    fi
    echo "Caddy configurado sem sobrescrever os demais sites ✅"

    if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
      ufw allow 80/tcp >/dev/null 2>&1 || true
      ufw allow 443/tcp >/dev/null 2>&1 || true
    fi
  fi
fi

echo "==> [6/6] Estado final"
docker compose ps
docker image prune -f >/dev/null 2>&1 || true
if [ -n "$DOMAIN_ATUAL" ]; then
  URL_FINAL="https://${DOMAIN_ATUAL}/"
else
  sufixo=""
  [ "$HTTP_PORT" != "80" ] && sufixo=":${HTTP_PORT}"
  URL_FINAL="http://$(hostname -I | awk '{print $1}')${sufixo}/"
fi
if [ -f /root/s2licit-acesso.txt ]; then
  sed -i "s|^URL:.*|URL:    ${URL_FINAL}|" /root/s2licit-acesso.txt || true
fi
echo "Deploy concluído. Acesse: ${URL_FINAL}"
