#!/usr/bin/env bash
# Captura os logs do sync IMAP na janela 22:45-22:50 BRT (01:45-01:50 UTC) e salva em arquivo.
set -u
OUT=/tmp/s2-sync-result.txt
echo "captura iniciada $(date -u)" > "$OUT"
for i in $(seq 1 12); do
  docker logs sistema-s2-app --since 60s 2>&1 | grep -iE "sync|imap|inbox|cota|radar|email|erro|fail" >> "$OUT" || true
  sleep 60
done
echo "--- pronto $(date -u) ---" >> "$OUT"
echo "=== state ===" >> "$OUT"
curl -sS -m 10 http://127.0.0.1:3000/readyz >> "$OUT"; echo >> "$OUT"
