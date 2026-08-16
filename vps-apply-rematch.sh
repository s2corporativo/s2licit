#!/usr/bin/env bash
# Aplica a main atualizada (fix rematch) na VPS e recria o container.
set -uo pipefail
LOG=/tmp/s2-apply-rematch.log
exec > >(tee -a $LOG) 2>&1

TAR=/tmp/s2licit-main.tar.gz
ROOT_SRC=$(tar tzf $TAR | head -1)
mkdir -p /tmp/s2-new
tar xzf $TAR -C /tmp/s2-new --strip-components=1

echo "=== fix no source novo? ==="
grep -c "DEFAULT_ITEMS_PER_RUN" /tmp/s2-new/server/services/quotationRematchService.ts || exit 2

echo "=== backup do banco ==="
mkdir -p /root/backups
(cd /opt/s2licit && docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot sistema_s2' | gzip > /root/backups/s2-apply-$(date +%F-%H%M).sql.gz)
ls -la /root/backups/s2-apply-*.sql.gz | tail -1

echo "=== atualizar /opt/s2licit (preserva .env, backups, uploads) ==="
rsync -a --delete \
  --exclude='.env' \
  --exclude='backups' \
  --exclude='uploads' \
  --exclude='.git' \
  --exclude='node_modules' \
  /tmp/s2-new/ /opt/s2licit/

echo "=== rebuild app ==="
cd /opt/s2licit
docker compose build --no-cache app 2>&1 | tail -3
echo "=== recriar container ==="
docker compose up -d --no-deps app 2>&1 | tail -2
sleep 35
echo "status: $(docker ps --filter name=sistema-s2-app --format '{{.Status}}')"
echo "healthz: $(curl -sS -m 10 http://127.0.0.1:3001/healthz)"
echo "=== trava RBAC no dist ==="
docker exec sistema-s2-app grep -c "perfil Editor ou superior" /app/dist/index.js || true
echo "=== fix rematch no dist ==="
docker exec sistema-s2-app grep -c "DEFAULT_ITEMS_PER_RUN" /app/dist/index.js || true
echo APPLY_OK
