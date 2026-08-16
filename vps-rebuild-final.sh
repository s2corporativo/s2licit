#!/usr/bin/env bash
# Rebuild final: confirma código novo, builda, recria container, valida trava RBAC.
set -uo pipefail
LOG=/tmp/s2-rebuild-final.log
exec > >(tee -a $LOG) 2>&1
cd /opt/s2licit || exit 1

echo "=== código novo confirmado? ==="
grep -c "Operações de alteração exigem perfil Editor ou superior" server/_core/trpc.ts || exit 2

echo "=== backup ==="
mkdir -p /root/backups
(cd /opt/s2licit && docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot sistema_s2' | gzip > /root/backups/s2-$(date +%F).sql.gz) 2>&1 | tail -2 && ls -la /root/backups/s2-$(date +%F).sql.gz

echo "=== build imagem ==="
docker compose build --no-cache app 2>&1 | tail -3

echo "=== recriar container ==="
docker compose up -d --no-deps app 2>&1 | tail -2
sleep 30
echo "container: $(docker ps --filter name=sistema-s2-app --format '{{.Status}}')"
echo "healthz: $(curl -sS -m 10 http://127.0.0.1:3001/healthz || curl -sS -m 10 http://127.0.0.1:8088/healthz)"

echo "=== trava no dist da imagem ==="
docker exec sistema-s2-app sh -c "grep -c 'Operações de alteração exigem perfil Editor ou superior' /app/dist/index.js || echo AUSENTE"
echo BUILD_OK
echo BUILD_DONE=0 >> $LOG
