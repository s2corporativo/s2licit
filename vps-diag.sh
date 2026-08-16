#!/usr/bin/env bash
# Diagnóstico do estado atual do S2 na VPS
set -u
echo "=== processos node/pnpm em curso ==="
ps aux | grep -E "node|pnpm" | grep -v grep | awk '{print $2, $3"%", $4"%", $11, $12, $13}'
echo "=== cwd dos processos pnpm 2568387 e 2568453 ==="
ls -l /proc/2568387/cwd 2>/dev/null
ls -l /proc/2568453/cwd 2>/dev/null
echo "=== /opt/s2licit: commit atual e status git ==="
cd /opt/s2licit 2>/dev/null || { echo "DIR /opt/s2licit INEXISTENTE"; exit 1; }
git log --oneline -3
git status --short | head -5
echo "=== logs recentes do pnpm (erro?) ==="
journalctl -u s2* --no-pager -n 5 2>/dev/null | tail -5
echo "=== portas ouvindo 3000/3001 ==="
ss -tlnp | grep -E ":300[01]" | head -4
echo "=== compose na raiz do repo? ==="
ls /opt/s2licit/docker-compose.yml 2>/dev/null || echo "sem docker-compose no repo"
