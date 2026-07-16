#!/usr/bin/env bash
# Bootstrap/atualização do Sistema S2 numa VPS Ubuntu/Debian.
# Idempotente: pode rodar quantas vezes quiser (primeira instalação e updates).
#
# Pré-condição: o código do repositório já está em /opt/s2licit
# (o workflow deploy-vps.yml faz o rsync antes de chamar este script).
set -euo pipefail

APP_DIR=/opt/s2licit
cd "$APP_DIR"

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

  cat > .env <<EOF
# Gerado automaticamente pelo vps-bootstrap.sh em $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Referência completa de variáveis: .env.production.example

# ── Banco (usado pelo docker-compose para montar o DATABASE_URL) ──
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_DATABASE=sistema_s2
MYSQL_USER=s2user
MYSQL_PASSWORD=${MYSQL_PASSWORD}

# ── Segurança ──
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# ── Administrador inicial (criado no primeiro boot) ──
ADMIN_EMAIL=adm@vetmg.com.br
ADMIN_PASSWORD=${ADMIN_PASSWORD}

# ── IA (preencha depois; AI_PROVIDER=auto detecta pelo que estiver definido) ──
AI_PROVIDER=auto
ANTHROPIC_API_KEY=
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

# ── E-mail: leitura de cotações (IMAP) e envio de respostas (SMTP) ──
IMAP_HOST=
IMAP_PORT=993
IMAP_USER=
IMAP_PASSWORD=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=false
SMTP_FROM=adm@vetmg.com.br

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

# ── Puppeteer (chromium já vem na imagem) ──
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
EOF
  chmod 600 .env

  cat > /root/s2licit-acesso.txt <<EOF
Sistema S2 — credenciais geradas em $(date -u +%Y-%m-%dT%H:%M:%SZ)
URL:    http://$(hostname -I | awk '{print $1}')/
Login:  adm@vetmg.com.br
Senha:  ${ADMIN_PASSWORD}

(Os demais segredos estão em ${APP_DIR}/.env — não apague esse arquivo,
 é ele que guarda as senhas do banco entre atualizações.)
EOF
  chmod 600 /root/s2licit-acesso.txt
  echo "Credenciais salvas em /root/s2licit-acesso.txt"
else
  echo ".env já existe — mantendo segredos atuais."
fi

echo "==> [3/6] Domínio (HTTPS automático)"
# DOMAIN chega como variável de ambiente só quando o workflow "Deploy VPS" é
# disparado manualmente com o campo "domain" preenchido. Uma vez salvo no
# .env, os deploys seguintes (inclusive automáticos, sem o campo) reaproveitam
# o valor sem precisar informá-lo de novo.
if [ -n "${DOMAIN:-}" ]; then
  case "$DOMAIN" in
    *[!A-Za-z0-9.-]*)
      echo "⚠️  DOMAIN inválido (\"$DOMAIN\") — ignorando." >&2
      DOMAIN=""
      ;;
  esac
fi
if [ -n "${DOMAIN:-}" ]; then
  if grep -q '^DOMAIN=' .env; then
    sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
  else
    echo "DOMAIN=${DOMAIN}" >> .env
  fi
  echo "Domínio configurado: ${DOMAIN}"
fi
DOMAIN_ATUAL=$(grep '^DOMAIN=' .env 2>/dev/null | head -1 | cut -d= -f2 || true)
[ -n "$DOMAIN_ATUAL" ] && echo "Domínio ativo: ${DOMAIN_ATUAL}" || echo "Nenhum domínio configurado (acesso só por IP)."

echo "==> [4/6] Build e subida dos containers"
# A VPS pode ter outros serviços/containers ocupando portas (Apache na 80,
# outro app na 3000, algo em 127.0.0.1:8080...). Escolhemos portas livres
# sem derrubar nada — e REVALIDAMOS a cada deploy: o que estava livre ontem
# pode estar ocupado hoje. Paramos só o nosso app antes, para que as portas
# que nós mesmos seguramos não contem como "ocupadas".
docker compose stop app >/dev/null 2>&1 || true

porta_ocupada() {
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "(:|\.)$1\$"
}
primeira_porta_livre() {
  for p in "$@"; do
    [ -n "$p" ] || continue
    if ! porta_ocupada "$p"; then echo "$p"; return 0; fi
  done
  return 1
}
# garantir_porta VAR porta_preferida [alternativas...]
# Mantém o valor já gravado no .env se a porta continuar livre; senão
# escolhe a primeira livre da lista e atualiza o .env.
garantir_porta() {
  var="$1"; shift
  atual=$(grep "^${var}=" .env 2>/dev/null | head -1 | cut -d= -f2 || true)
  livre=$(primeira_porta_livre "$atual" "$@") || { echo "❌ Nenhuma porta livre para ${var} (testadas: ${atual} $*)"; exit 1; }
  if [ "$livre" = "$atual" ]; then return 0; fi
  if [ -n "$atual" ]; then
    sed -i "s/^${var}=.*/${var}=${livre}/" .env
    echo "⚠️  Porta ${atual} (${var}) ficou ocupada — trocando para :${livre}."
  else
    echo "${var}=${livre}" >> .env
    if [ "$livre" != "$1" ]; then
      echo "⚠️  Porta preferida ocupada — ${var} usará :${livre}."
    fi
  fi
  return 0
}
if [ -n "$DOMAIN_ATUAL" ]; then
  # 80/443 ficam reservados para o Caddy (proxy reverso com HTTPS
  # automático). Se um deploy anterior (sem domínio) já tinha fixado a porta
  # pública em 80, força a re-escolha para liberar a 80 para o Caddy.
  atual_http=$(grep '^APP_HTTP_PORT=' .env 2>/dev/null | cut -d= -f2 || true)
  if [ "$atual_http" = "80" ]; then
    sed -i '/^APP_HTTP_PORT=/d' .env
  fi
  garantir_porta APP_HTTP_PORT 8080 8088 8090 8181
else
  garantir_porta APP_HTTP_PORT 80 8080 8088 8090 8181
fi
garantir_porta APP_LOCAL_PORT 3000 3001 3002 3010
HTTP_PORT=$(grep '^APP_HTTP_PORT=' .env | cut -d= -f2)
LOCAL_PORT=$(grep '^APP_LOCAL_PORT=' .env | cut -d= -f2)
echo "Portas: pública :${HTTP_PORT} · local :${LOCAL_PORT}"
docker compose up -d --build

echo "==> [5/6] Aguardando o app ficar saudável (porta local ${LOCAL_PORT})"
ok=0
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${LOCAL_PORT}/healthz" 2>/dev/null; then
    ok=1
    break
  fi
  sleep 5
done
if [ "$ok" = "1" ]; then
  echo "App respondendo em /healthz ✅"
else
  echo "App NÃO respondeu em 5 min — últimos logs:" >&2
  docker compose logs --tail=80 app >&2 || true
  exit 1
fi

if [ -n "$DOMAIN_ATUAL" ]; then
  echo "==> [Extra] HTTPS para ${DOMAIN_ATUAL}"

  # Se já existe um Nginx nesta VPS ocupando 80/443 (hospedando outro
  # site/cliente), NÃO tentamos tirar a porta dele com o Caddy — em vez
  # disso, adicionamos um vhost novo no próprio Nginx só para o nosso
  # domínio, sem tocar nos demais sites configurados nele.
  nginx_ocupa_portas=false
  if command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx \
     && ss -ltnp 2>/dev/null | grep -q 'nginx'; then
    nginx_ocupa_portas=true
  fi

  if [ "$nginx_ocupa_portas" = true ]; then
    echo "Nginx já em uso nesta VPS (outro site) — adicionando um vhost novo para ${DOMAIN_ATUAL}, sem mexer nos demais."

    # Se uma tentativa anterior chegou a instalar o Caddy (e ele ficou
    # falhando por causa da porta ocupada), desliga para não ficar em loop.
    if command -v caddy >/dev/null 2>&1; then
      systemctl stop caddy >/dev/null 2>&1 || true
      systemctl disable caddy >/dev/null 2>&1 || true
    fi

    if [ -d /etc/nginx/sites-enabled ]; then
      NGINX_SITE_PATH=/etc/nginx/sites-available/s2licit.conf
      NGINX_ENABLED_PATH=/etc/nginx/sites-enabled/s2licit.conf
    else
      NGINX_SITE_PATH=/etc/nginx/conf.d/s2licit.conf
      NGINX_ENABLED_PATH="$NGINX_SITE_PATH"
    fi

    cat > "$NGINX_SITE_PATH" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN_ATUAL};

    location / {
        proxy_pass http://127.0.0.1:${LOCAL_PORT};
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

    if nginx -t 2>/tmp/s2licit-nginx-test.log; then
      systemctl reload nginx
      echo "Vhost do Nginx para ${DOMAIN_ATUAL} ativo (HTTP)."
    else
      echo "❌ Configuração do Nginx ficou inválida ao adicionar o vhost — revertendo para não afetar os outros sites:" >&2
      cat /tmp/s2licit-nginx-test.log >&2
      rm -f "$NGINX_ENABLED_PATH"
      [ "$NGINX_SITE_PATH" != "$NGINX_ENABLED_PATH" ] && rm -f "$NGINX_SITE_PATH"
      exit 1
    fi

    if ! command -v certbot >/dev/null 2>&1; then
      echo "Instalando certbot..."
      apt-get update -qq
      apt-get install -y -qq certbot python3-certbot-nginx
    fi
    if certbot --nginx -d "${DOMAIN_ATUAL}" --non-interactive --agree-tos -m adm@vetmg.com.br --redirect --quiet; then
      echo "Certificado HTTPS emitido via certbot para ${DOMAIN_ATUAL}."
    else
      echo "⚠️  certbot não conseguiu emitir o certificado agora (o site já responde em HTTP simples em http://${DOMAIN_ATUAL}/). Rode 'certbot --nginx -d ${DOMAIN_ATUAL}' manualmente na VPS para tentar de novo." >&2
    fi
  else
    # Antes de assumir "VPS limpa", confere se ALGUM OUTRO processo (não
    # Nginx — já tratado acima — e não um Caddy de execução anterior) já
    # ocupa 80/443. Instalar o Caddy por cima reproduziria, para qualquer
    # outro servidor web (Apache, Traefik, etc.), a mesma falha de porta
    # ocupada que a coexistência com o Nginx foi criada para evitar.
    ocupante_80=$(ss -ltnp 2>/dev/null | awk '$4 ~ /:80$/')
    ocupante_443=$(ss -ltnp 2>/dev/null | awk '$4 ~ /:443$/')
    ocupante_e_outro_servico=false
    if { [ -n "$ocupante_80" ] || [ -n "$ocupante_443" ]; } \
       && ! echo "${ocupante_80}${ocupante_443}" | grep -qi 'caddy'; then
      ocupante_e_outro_servico=true
    fi

    if [ "$ocupante_e_outro_servico" = true ] && ! command -v caddy >/dev/null 2>&1; then
      echo "❌ Porta 80 e/ou 443 já em uso por outro serviço nesta VPS (não é Nginx nem um Caddy já instalado) — não vou tentar subir o Caddy por cima para não derrubar o que já está rodando:" >&2
      [ -n "$ocupante_80" ] && echo "  :80  -> ${ocupante_80}" >&2
      [ -n "$ocupante_443" ] && echo "  :443 -> ${ocupante_443}" >&2
      echo "  Configure manualmente um proxy reverso desse serviço para 127.0.0.1:${LOCAL_PORT}, ou pare o serviço e rode este bootstrap novamente." >&2
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
    cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN_ATUAL} {
    reverse_proxy 127.0.0.1:${LOCAL_PORT}
}
EOF
    systemctl enable caddy >/dev/null 2>&1 || true
    systemctl restart caddy || true
    sleep 2
    if systemctl is-active --quiet caddy; then
      echo "Caddy configurado e rodando. O certificado HTTPS é emitido automaticamente (Let's Encrypt) assim que o DNS de ${DOMAIN_ATUAL} apontar para este servidor."
    else
      echo "❌ Caddy NÃO subiu. journalctl -u caddy (últimas linhas):" >&2
      journalctl -u caddy --no-pager -n 40 >&2 || true
      echo "❌ Estado das portas 80/443 agora:" >&2
      ss -ltnp 2>/dev/null | grep -E ':80 |:443 ' >&2 || true
      exit 1
    fi
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
# Mantém o arquivo de acesso com a URL correta (a porta/domínio pode ter mudado)
if [ -f /root/s2licit-acesso.txt ]; then
  sed -i "s|^URL:.*|URL:    ${URL_FINAL}|" /root/s2licit-acesso.txt || true
fi
echo "Deploy concluído. Acesse: ${URL_FINAL}"
