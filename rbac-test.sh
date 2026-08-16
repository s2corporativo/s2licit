#!/usr/bin/env bash
# Teste RBAC em produção — usa node (fetch nativo) da VPS, sem expor senhas.
# Pré-condição: usuário s2licit_qa_rbac_viewer@example.invalid (role viewer) criado
# com o MESMO hash do admin (mesma senha ADMIN_PASSWORD).
set -u
BASE=http://127.0.0.1:3000
PASS=$(grep -m1 '^ADMIN_PASSWORD=' /opt/s2licit/.env | cut -d= -f2)

login() { # login, imprime cookie
  local email="$1"
  curl -sS -m 20 -D - -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$PASS\"}" > /tmp/rbac-login-$email.txt
  grep -i '^set-cookie:' /tmp/rbac-login-$email.txt | head -1
}

trpc_call() { # $1=path $2=input $3=cookie
  curl -sS -m 20 -X POST "$BASE/api/trpc/$1?batch=1" -H 'Content-Type: application/json' \
    -H "Cookie: $3" -d "{\"0\":{\"json\":$2}}"
}

echo "=== 1. LOGIN VIEWER ==="
V_COOKIE=$(login "s2licit_qa_rbac_viewer@example.invalid" | sed 's/Set-Cookie: //i' | cut -d';' -f1)
echo "cookie: ${V_COOKIE:0:60}..."
echo "=== 2. LOGIN ADMIN (baseline) ==="
A_COOKIE=$(login "adm@vetmg.com.br" | sed 's/Set-Cookie: //i' | cut -d';' -f1)
echo "cookie: ${A_COOKIE:0:60}..."

echo "=== 3. QUERY (permitida a qualquer autenticado) — dashboard.stats ==="
echo "viewer: $(trpc_call 'dashboard.stats' '{}' "$V_COOKIE" | head -c 150)"
echo
echo "admin:  $(trpc_call 'dashboard.stats' '{}' "$A_COOKIE" | head -c 150)"
echo

echo "=== 4. MUTATION (exige editor+) — proposals.create (dados QA) ==="
echo "viewer: $(trpc_call 'proposals.create' '{"title":"S2LICIT_QA_RBAC_PROPOSTA"}' "$V_COOKIE" | head -c 250)"
echo
echo "admin:  $(trpc_call 'proposals.create' '{"title":"S2LICIT_QA_RBAC_PROPOSTA_ADMIN"}' "$A_COOKIE" | head -c 120)"
echo

echo "=== 5. LIMPEZA ==="
docker exec sistema-s2-db mysql -uroot -p500e56204ec8981ba5f3bfb9496ba21aeb7766bc8c143e58c75f65d99c6dfbe2 sistema_s2 -e "DELETE FROM users WHERE email='s2licit_qa_rbac_viewer@example.invalid'; SELECT id,email,role FROM users;" 2>/dev/null
echo "=== FIM ==="
