#!/bin/bash
# Módulo 05: aplicar main ef564ef na VPS
set -u
echo "=== backup do banco ==="
mysqldump -uroot -p500e56204ec8981ba5f3bfb9496ba21aeb7766bc8c143e58c75f65d99c6dfbe2 --single-transaction sistema_s2 2>/dev/null | gzip > "/root/backups/s2-m05-$(date +%Y-%m-%d-%H%M).sql.gz" && ls -la /root/backups/s2-m05-*.sql.gz | tail -1

echo "=== atualizar /opt/s2licit (preserva .env, backups, uploads) ==="
cd /opt && rm -rf /tmp/s2new && mkdir /tmp/s2new && tar xzf /tmp/s2licit-main.tar.gz -C /tmp/s2new --strip-components=1
rsync -a --exclude='.env' --exclude='backups' --exclude='uploads' --exclude='node_modules' --exclude='.git' --delete /tmp/s2new/ /opt/s2licit/
rm -rf /tmp/s2new

echo "=== rebuild app ==="
cd /opt/s2licit && docker compose build --no-cache app > /tmp/s2-m05-build.log 2>&1 && echo BUILD_OK || echo BUILD_FAIL
docker compose up -d app > /tmp/s2-m05-up.log 2>&1
sleep 20
docker ps --filter name=sistema-s2-app --format '{{.Names}}: {{.Status}}'

echo "=== validação ==="
for i in 1 2 3; do curl -sS -m 8 http://127.0.0.1:3001/healthz; echo; sleep 2; done
echo "=== progress log do rematch no dist ==="
docker exec sistema-s2-app grep -c "restam" /app/dist/index.js || echo "progresso ausente"
