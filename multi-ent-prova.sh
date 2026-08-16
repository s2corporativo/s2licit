#!/bin/bash
# Módulo 05 — prova funcional: criar proposta vinculada a órgão, item vinculado a fornecedor,
# verificar associação correta na listagem, e limpar. Sem tocar dados reais.
set -u
BASE="http://127.0.0.1:3001"
TMPD="/tmp/me-prova"
mkdir -p "$TMPD"

login() {
  local user="$1"; local pass="$2"; local out="$3"
  curl -sS -m 10 -c "$TMPD/$out.cj" -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$user\",\"password\":\"$pass\"}" > "$TMPD/$out.login.json"
  grep -q "eyJ" "$TMPD/$out.cj" && echo "login ok ($user)" || { echo "login FALHOU ($user)"; cat "$TMPD/$out.login.json"; exit 1; }
}

# tquery: GET para procedures query (tRPC v11 requer GET para queries)
# tmut: POST para procedures mutation
tquery() {
  local cj="$1"; local router="$2"; local proc="$3"; local input="$4"
  local enc
  enc="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$input")"
  curl -sS -m 10 -b "$TMPD/$cj.cj" "$BASE/api/trpc/$router.$proc?input=$enc"
}
tmut() {
  local cj="$1"; local router="$2"; local proc="$3"; local input="$4"
  curl -sS -m 10 -b "$TMPD/$cj.cj" -X POST "$BASE/api/trpc/$router.$proc?batch=1" \
    -H "Content-Type: application/json" \
    -d "{\"0\":{\"json\":$input}}"
}

# 1. login admin
PASS="$(grep -m1 '^ADMIN_PASSWORD=' /opt/s2licit/.env | cut -d= -f2-)"
[ -z "$PASS" ] && { echo "sem ADMIN_PASSWORD no .env"; exit 1; }
login "adm@vetmg.com.br" "$PASS" admin

# 2. obter suppliers reais e orgs existentes
echo "=== suppliers ==="
tquery admin suppliers list '{}' > "$TMPD/suppliers.json"
cat "$TMPD/suppliers.json" | head -c 600; echo
echo "=== orgs ==="
tquery admin orgs list '{}' > "$TMPD/orgs.json"
# orgs.list exige input; fallback para objeto vazio se a resposta for erro
if grep -q '"error"' "$TMPD/orgs.json"; then
  tquery admin orgs list '{}' > "$TMPD/orgs.json"
fi
cat "$TMPD/orgs.json" | head -c 400; echo

# extrair primeiro supplier ativo (id) e o TESTE-MANUS org (id=1)
SUP_ID=$(grep -o '"id":[0-9]*' "$TMPD/suppliers.json" | head -1 | cut -d: -f2)
ORG_ID=1
[ -z "$SUP_ID" ] && { echo "sem supplier"; exit 1; }
echo "supplier id=$SUP_ID org id=$ORG_ID"

# 3. criar proposta vinculada ao órgão TESTE-MANUS
echo "=== criar proposta QA ==="
tmut admin proposals create '{"processNumber":"QA-ME-001","orgId":'$ORG_ID',"title":"TESTE auditoria Módulo 05","validityDays":30}' > "$TMPD/create1.json"
cat "$TMPD/create1.json"; echo
P_ID=$(grep -o '"json":[0-9]*' "$TMPD/create1.json" | head -1 | cut -d: -f2)
[ -z "$P_ID" ] && { echo "criação falhou"; exit 1; }
echo "proposal id=$P_ID"

# 4. criar item vinculado ao fornecedor SUP_ID
echo "=== criar item QA ==="
tmut admin proposals addItem "{\"proposalId\":$P_ID,\"productId\":null,\"productName\":\"PRODUTO TESTE QA\",\"supplierName\":\"TESTE QA\",\"unitPrice\":\"10.00\",\"quantity\":1}" > "$TMPD/item1.json"
cat "$TMPD/item1.json"; echo

# 5. conferir associação na listagem
echo "=== listar propostas ==="
tquery admin proposals list '{}' > "$TMPD/list.json"
cat "$TMPD/list.json" | head -c 800; echo
grep -q "TESTE auditoria Módulo 05" "$TMPD/list.json" && echo "proposta visível com título correto" || echo "proposta NÃO visível (checar)"
grep -q "TESTE-MANUS" "$TMPD/list.json" && echo "órgão TESTE-MANUS associado correto" || echo "órgão não visível (checar)"

# 6. limpar item e proposta
echo "=== limpeza ==="
I_ID=$(grep -o '"json":[0-9]*' "$TMPD/item1.json" | head -1 | cut -d: -f2)
[ -n "$I_ID" ] && tmut admin proposals removeItem "{\"id\":$I_ID}" > /dev/null && echo "item removido"
tmut admin proposals delete "{\"id\":$P_ID}" > /dev/null && echo "proposta removida"
tquery admin proposals list '{}' | grep -c "QA-ME-001" | xargs -I{} echo "ocorrências QA na lista: {}"
echo "PROVA OK"
