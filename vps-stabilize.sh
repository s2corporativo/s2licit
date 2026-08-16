#!/usr/bin/env bash
# Estabiliza a VPS: encerra execuções manuais do S2 (fora do Docker) que
# competem com o container, e reporta o estado final. NÃO mexe em containers.
set -u
echo "=== 1. Instancias manuais de node/pnpm (fora do docker) ==="
ps aux | grep -E "node dist/index|pnpm start" | grep -v grep | grep -v defunct | awk '{print $2, $3"%", $11, $12, $13}'
echo "=== 2. Verificando o node ./dist/src/main.js (PID 3191979) ==="
ps -p 3191979 -o pid,ppid,etime,cmd 2>/dev/null || echo "PID 3191979 nao existe mais"
echo "=== 3. Quem esta ouvindo na porta 3000 e 3001 ==="
ss -tlnp | grep -E ":300[01]" | head -4
echo "=== 4. Qual processo serve o S2 na 3000 (container ou manual)? ==="
# container docker-proxy aponta para container; manual escuta direto
for P in 3000 3001; do
  PORT_PID=$(ss -tlnp | grep ":$P " | grep -oP 'pid=\K[0-9]+' | head -1)
  if [ -n "$PORT_PID" ]; then
    echo "porta $P -> pid $PORT_PID -> $(cat /proc/$PORT_PID/comm 2>/dev/null || echo desconhecido)"
    PPID=$(stat -c %p /proc/$PORT_PID/status 2>/dev/null | awk '/PPid/{print $2}')
    echo "  parent: $PPID -> $(cat /proc/$PPID/comm 2>/dev/null || echo desconhecido)"
  fi
done
echo "=== 5. Zombies node ==="
ps aux | grep -c "[n]ode.*defunct"
echo "=== 6. Uptime do sistema-s2-app (container) ==="
docker inspect --format '{{.Name}} {{.State.StartedAt}} healthy={{(index .State.Health.Status 0)}}' sistema-s2-app 2>/dev/null || echo "container ausente"
