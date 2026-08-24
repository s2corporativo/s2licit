#!/usr/bin/env bash
: "${MYSQL_ROOT_PASSWORD:?defina MYSQL_ROOT_PASSWORD no ambiente; a senha nao e versionada}"
# Teste RBAC definitivo — reproduzir mutation viewer e validar FORBIDDEN em adminProcedure.
BASE=http://127.0.0.1:3000
PASS=$(grep -m1 '^ADMIN_PASSWORD=' /opt/s2licit/.env | cut -d= -f2)
SQL="docker exec sistema-s2-db mysql -uroot -p$MYSQL_ROOT_PASSWORD sistema_s2"

cleanup() {
  $SQL -e "DELETE FROM users WHERE email='s2licit_qa_rbac_viewer@example.invalid'; DELETE FROM proposals WHERE title LIKE 'S2LICIT_QA_RBAC%';" 2>/dev/null
  echo "limpeza concluída"
}
trap cleanup EXIT

echo "=== criar viewer (hash do admin) ==="
$SQL -e "INSERT INTO users (openId,name,email,role,loginMethod,passwordHash,disabled,failedLoginAttempts,mfaEnabled) SELECT 'local:s2licit_qa_rbac_viewer@example.invalid','QA RBAC Viewer','s2licit_qa_rbac_viewer@example.invalid','viewer','local',passwordHash,0,0,0 FROM users WHERE email='adm@vetmg.com.br' LIMIT 1;" 2>/dev/null

login() {
  curl -sS -m 20 -D - -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$PASS\"}" > /tmp/rbac2-login.txt
  grep -i '^set-cookie:' /tmp/rbac2-login.txt | head -1 | sed 's/[Ss]et-[Cc]ookie: //' | cut -d';' -f1
}

trpc_post() { # path input cookie
  curl -sS -m 20 -X POST "$BASE/api/trpc/$1?batch=1" -H 'Content-Type: application/json' \
    -H "Cookie: $3" -d "{\"0\":{\"json\":$2}}"
}
trpc_get() { # path input cookie
  curl -sS -m 20 "$BASE/api/trpc/$1?input=$(python3 -c "import urllib.parse,json,sys;print(urllib.parse.quote(json.dumps($2)))")" -H "Cookie: $3"
}

V=$(login "s2licit_qa_rbac_viewer@example.invalid")
echo "cookie viewer: ${V:0:50}..."

echo "=== TESTE 1: mutation proposals.create com VIEWER (esperado FORBIDDEN) ==="
trpc_post 'proposals.create' '{"title":"S2LICIT_QA_RBAC_PROPOSTA_V2"}' "$V"
echo

echo "=== TESTE 2: query proposals.list com VIEWER via GET (esperado 200 ok) ==="
trpc_get 'proposals.list' '{}' "$V" | head -c 200
echo

echo "=== TESTE 3: mutation adminProcedure pricing.create com VIEWER (esperado FORBIDDEN) ==="
trpc_post 'pricing.create' '{"sku":"S2LICIT_QA","produtoId":1,"preco":99.9}' "$V"
echo

echo "=== TESTE 4: mutation pricing.create com ADMIN (esperado sucesso/erro de validação, não FORBIDDEN) ==="
trpc_post 'pricing.create' '{"sku":"S2LICIT_QA","produtoId":1,"preco":99.9}' "$(login adm@vetmg.com.br)"
echo
