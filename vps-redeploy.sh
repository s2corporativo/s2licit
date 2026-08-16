#!/usr/bin/env bash
# Recuperação ordenada do S2 na VPS (autorizado pelo mantenedor em 15/08/2026).
# - Código novo vem como tarball autenticado (git remoto sem credenciais válidas)
# - .env e backups são PRESERVADOS (rsync exclui apenas arquivos versionados)
# 1. PM2 sistema-cotacoes (loop de 214k restarts): remover + pm2 save
# 2. Backup do banco
# 3. Atualizar /opt/s2licit com o código da main 8c56b3c
# 4. Rebuild + up via docker compose
# 5. Validação /healthz /readyz
set -euo pipefail
TMP=/tmp/s2-recovery
mkdir -p "$TMP"
echo "==> [0] PM2: parar/remover sistema-cotacoes e salvar"
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop sistema-cotacoes 2>/dev/null || true
  pm2 delete sistema-cotacoes 2>/dev/null || true
  pm2 save 2>/dev/null || true
  echo "PM2: ok"
fi
echo "==> [1] Backup do banco"
cd /opt/s2licit
MYSQL_ROOT_PASSWORD=$(grep '^MYSQL_ROOT_PASSWORD=' .env | cut -d= -f2)
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups-manus
docker exec sistema-s2-db sh -c "MYSQL_PWD=\$MYSQL_ROOT_PASSWORD mysqldump -u root --all-databases --single-transaction --quick --lock-tables=false | gzip" > backups-manus/all-databases-${TS}.sql.gz
ls -la backups-manus/ | tail -2
echo "==> [2] Atualizar codigo (tarball main 8c56b3c)"
tar xzf "$TMP/s2licit-src.tar.gz" -C "$TMP"
SRC=$(find "$TMP" -maxdepth 1 -mindepth 1 -type d | head -1)
# Excluir segredos/backups do rsync para nunca sobrescrever
rsync -a --exclude='.env*' --exclude='backups*' --exclude='node_modules' --exclude='dist' "$SRC/" /opt/s2licit/
cd /opt/s2licit
git log --oneline -2
echo "==> [3] Rebuild e subida"
docker compose up -d --build 2>&1 | tail -4
echo "==> [4] Validacao"
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:3000/healthz" 2>/dev/null; then break; fi
  [ $((i % 6)) -eq 0 ] && echo "   aguardando (${i}x5s)..."
  sleep 5
done
echo "=== healthz ==="; curl -sS -m 10 http://127.0.0.1:3000/healthz; echo
echo "=== readyz ==="; curl -sS -m 10 http://127.0.0.1:3000/readyz; echo
echo "=== container ==="; docker inspect -f '{{.State.Status}} {{.State.Health.Status}}' sistema-s2-app
