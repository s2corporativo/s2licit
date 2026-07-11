#!/usr/bin/env bash
# Bootstrap/atualização do Sistema S2 numa VPS Ubuntu/Debian.
# Idempotente: pode rodar quantas vezes quiser (primeira instalação e updates).
#
# Pré-condição: o código do repositório já está em /opt/s2licit
# (o workflow deploy-vps.yml faz o rsync antes de chamar este script).
set -euo pipefail

APP_DIR=/opt/s2licit
cd "$APP_DIR"

echo "==> [1/5] Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi
docker --version

echo "==> [2/5] Arquivo .env"
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

echo "==> [3/5] Build e subida dos containers"
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
garantir_porta APP_HTTP_PORT 80 8080 8088 8090 8181
garantir_porta APP_LOCAL_PORT 3000 3001 3002 3010
HTTP_PORT=$(grep '^APP_HTTP_PORT=' .env | cut -d= -f2)
LOCAL_PORT=$(grep '^APP_LOCAL_PORT=' .env | cut -d= -f2)
echo "Portas: pública :${HTTP_PORT} · local :${LOCAL_PORT}"
docker compose up -d --build

echo "==> [4/5] Aguardando o app ficar saudável (porta local ${LOCAL_PORT})"
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

echo "==> [5/5] Estado final"
docker compose ps
docker image prune -f >/dev/null 2>&1 || true
sufixo=""
[ "$HTTP_PORT" != "80" ] && sufixo=":${HTTP_PORT}"
URL_FINAL="http://$(hostname -I | awk '{print $1}')${sufixo}/"
# Mantém o arquivo de acesso com a URL correta (a porta pode ter mudado)
if [ -f /root/s2licit-acesso.txt ]; then
  sed -i "s|^URL:.*|URL:    ${URL_FINAL}|" /root/s2licit-acesso.txt || true
fi
echo "Deploy concluído. Acesse: ${URL_FINAL}"
