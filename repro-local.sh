#!/usr/bin/env bash
# Reproduz localmente a violação RBAC: servidor real + viewer + mutation.
set -uo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export COMPOSE_PROJECT_NAME=s2test

# Senha do admin local de teste — fixa e isolada deste repro (stack efêmera,
# projeto de compose próprio). Usada tanto no .env do container quanto no
# login abaixo: os dois precisam bater, não é segredo de ambiente real.
ADMIN_PASSWORD_LOCAL="LocalQA2026!"

# criar .env mínimo para o stack local
cat > .env.test <<EOF
MYSQL_ROOT_PASSWORD=rootpw123
MYSQL_USER=s2
MYSQL_PASSWORD=s2pw123
MYSQL_DATABASE=sistema_s2
DATABASE_URL=mysql://s2:s2pw123@db:3306/sistema_s2
COOKIE_SECRET=local-test-secret-min-32-characters-ok
APP_ID=s2licit
NODE_ENV=production
ADMIN_PASSWORD=${ADMIN_PASSWORD_LOCAL}
PORT=3000
EOF
cp .env.test .env

echo "=== subir stack local ==="
docker compose up -d --build db app > /tmp/s2test-up.log 2>&1
sleep 45
echo "up: $(docker compose ps --format '{{.Name}} {{.Status}}' | head -3)"

insert_viewer() {
  docker compose exec -T db mysql -uroot -prootpw123 sistema_s2 -e "$1" 2>/dev/null
}

echo "=== criar viewer ==="
insert_viewer "INSERT INTO users (openId,name,email,role,loginMethod,passwordHash,disabled,failedLoginAttempts,mfaEnabled) SELECT 'local:s2licit_qa_viewer@test.local','QA','s2licit_qa_viewer@test.local','viewer','local',passwordHash,0,0,0 FROM users WHERE role='admin' LIMIT 1;"
insert_viewer "SELECT id,email,role FROM users;" | grep -E "qa_viewer|email" || true

PASS="$ADMIN_PASSWORD_LOCAL"
# o app local registra admin via ensureAdminUser? verificar login do admin local primeiro
login() {
  curl -sS -m 20 -D - -X POST "http://127.0.0.1:8088/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" > /tmp/s2test-login.txt
  grep -i '^set-cookie:' /tmp/s2test-login.txt | head -1 | sed 's/[Ss]et-[Cc]ookie: //' | cut -d';' -f1
}

echo "=== login viewer ==="
V=$(login "s2licit_qa_viewer@test.local")
echo "viewer cookie: ${V:0:40}${V:+...}"
[ -z "$V" ] && echo "FALHA NO LOGIN — verificar logs" && exit 1

echo "=== mutation proposals.create com VIEWER ==="
curl -sS -m 20 -X POST "http://127.0.0.1:8088/api/trpc/proposals.create?batch=1" -H 'Content-Type: application/json' \
  -H "Cookie: $V" -d '{"0":{"json":{"title":"LOCAL_QA_PROPOSTA"}}}'

echo
echo "=== LIMPEZA ==="
insert_viewer "DELETE FROM users WHERE email='s2licit_qa_viewer@test.local'; DELETE FROM proposals WHERE title='LOCAL_QA_PROPOSTA';"
docker compose down -v > /tmp/s2test-down.log 2>&1
echo "stack local derrubado"
