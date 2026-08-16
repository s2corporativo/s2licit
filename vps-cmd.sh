#!/usr/bin/env bash
# Executa um comando na VPS via SSH (senha via sshpass ou expect).
# Uso: ./vps-cmd.sh "comando"
set -u
CMD="${1}"
ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=2 \
  "root@13.140.167.153" "$CMD"
