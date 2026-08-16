#!/usr/bin/env bash
# Verifica a execução do sync de e-mail na VPS e o estado do sistema.
set -u
echo "=== logs recentes (sync/imap/inbox/cotação) ==="
docker logs sistema-s2-app --since 15m 2>&1 | grep -iE "sync|imap|inbox|cota|radar" | tail -10 || echo "(sem linhas)"
echo "=== erros recentes ==="
docker logs sistema-s2-app --since 15m 2>&1 | grep -iE "error|fail" | grep -vi "hydration" | tail -5 || echo "(sem erros)"
echo "=== pronto ==="
curl -sS -m 10 http://127.0.0.1:3000/readyz; echo
echo "=== healthz 3x ==="
for i in 1 2 3; do curl -sS -m 10 -o /dev/null -w "%{http_code} %{time_total}s\n" http://127.0.0.1:3000/healthz; done
echo "=== load ==="; uptime
