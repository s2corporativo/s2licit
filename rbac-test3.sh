#!/usr/bin/env bash
# Teste decisivo: isolar por que mutations protectedProcedure passam para viewer.
set -uo pipefail
SQL='docker exec sistema-s2-db mysql -uroot -p500e56204ec8981ba5f3bfb9496ba21aeb7766bc8c143e58c75f65d99c6dfbe2 sistema_s2'
BASE=http://127.0.0.1:3001
PASS=$(grep -m1 '^ADMIN_PASSWORD=' /opt/s2licit/.env | cut -d= -f2)

cleanup() {
  $SQL -e "DELETE FROM users WHERE email='s2licit_qa_viewer3@test.local';" 2>/dev/null
  echo "limpeza ok"
}
trap cleanup EXIT

$SQL -e "INSERT INTO users (openId,name,email,role,loginMethod,passwordHash,disabled,failedLoginAttempts,mfaEnabled) SELECT 'local:s2licit_qa_viewer3@test.local','QA3','s2licit_qa_viewer3@test.local','viewer','local',passwordHash,0,0,0 FROM users WHERE email='adm@vetmg.com.br' LIMIT 1;" 2>/dev/null
$SQL -e "SELECT id,email,role FROM users WHERE email='s2licit_qa_viewer3@test.local';" 2>/dev/null

login() {
  curl -sS -m 20 -D - -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" > /tmp/rbac3-login.txt
  grep -i '^set-cookie:' /tmp/rbac3-login.txt | head -1 | sed 's/[Ss]et-[Cc]ookie: //' | cut -d';' -f1
}
V=$(login "s2licit_qa_viewer3@test.local")
[ -z "$V" ] && echo "FALHA LOGIN" && exit 1
echo "cookie ok (${V:0:40}...)"

echo "=== A. mutation protectedProcedure (proposals.create) com viewer — batch POST ==="
curl -sS -m 20 -X POST "$BASE/api/trpc/proposals.create?batch=1" -H 'Content-Type: application/json' -H "Cookie: $V" -d '{"0":{"json":{"title":"Q3A"}}}'
echo

echo "=== B. mutation editorProcedure (categories.delete id=999) com viewer — batch POST ==="
curl -sS -m 20 -X POST "$BASE/api/trpc/categories.delete?batch=1" -H 'Content-Type: application/json' -H "Cookie: $V" -d '{"0":{"json":{"id":999}}}'
echo

echo "=== C. mutation protectedProcedure (proposals.create) com viewer — POST SEM batch ==="
curl -sS -m 20 -X POST "$BASE/api/trpc/proposals.create" -H 'Content-Type: application/json' -H "Cookie: $V" -d '{"json":{"title":"Q3C"}}'
echo

echo "=== D. limpar proposta Q3A se criada ==="
$SQL -e "DELETE FROM proposals WHERE title IN ('Q3A','Q3C');" 2>/dev/null
