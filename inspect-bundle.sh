#!/usr/bin/env bash
# Inspeciona o bundle da produção em busca das travas RBAC
docker exec sistema-s2-app sh -c '
  echo "msg trava (alteração):"
  grep -io "opera[^\"\\]*altera[^\"\\]*editor" /app/dist/index.js | head -2
  echo "perfil Editor ou superior:"
  grep -o "perfil Editor ou superior" /app/dist/index.js | head -1
  echo "rank<editor ocorrências:"
  grep -c "rank<ROLE_RANK.editor\|rank < ROLE_RANK.editor" /app/dist/index.js || true
  echo "tamanho:"
  wc -c < /app/dist/index.js
'
