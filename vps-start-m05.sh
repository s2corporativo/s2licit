#!/usr/bin/env bash
# Dispara o apply do Modulo 05 na VPS.
# Autenticacao por chave SSH ja configurada; nenhuma senha e versionada.
set -euo pipefail
: "${VPS_HOST:?defina VPS_HOST (ex.: usuario@host) no ambiente}"

ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 "$VPS_HOST" \
  "chmod +x /tmp/vps-apply-m05.sh && nohup bash /tmp/vps-apply-m05.sh > /tmp/s2-m05.log 2>&1 & echo started=\$!"
