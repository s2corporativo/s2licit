#!/usr/bin/env bash
# Executa um comando na VPS via SSH (autenticacao por chave configurada).
# Uso: VPS_HOST=usuario@host ./vps-cmd.sh "comando"
set -euo pipefail
: "${VPS_HOST:?defina VPS_HOST (ex.: usuario@host) no ambiente}"
CMD="${1:?informe o comando a executar}"
ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=2 \
  "$VPS_HOST" "$CMD"
