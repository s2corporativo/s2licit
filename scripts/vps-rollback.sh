#!/usr/bin/env bash
# Rollback do Sistema S2 na VPS em 1 comando.
#
# Volta o app para a imagem anterior (S2_IMAGE_PREVIOUS gravada pelo deploy)
# ou para uma tag específica passada como argumento:
#   bash scripts/vps-rollback.sh                      # volta para a anterior
#   bash scripts/vps-rollback.sh ghcr.io/org/repo:sha # volta para uma tag exata
#
# Importante: o rollback troca apenas a IMAGEM DO APP. Migrações de banco são
# forward-only — se o deploy que está sendo revertido criou colunas/tabelas,
# elas permanecem (o código antigo as ignora).
set -euo pipefail

APP_DIR=/opt/s2licit
cd "$APP_DIR"

ALVO="${1:-}"
if [ -z "$ALVO" ]; then
  ALVO=$(grep '^S2_IMAGE_PREVIOUS=' .env 2>/dev/null | cut -d= -f2- || true)
fi
if [ -z "$ALVO" ]; then
  echo "Nenhuma imagem anterior registrada (S2_IMAGE_PREVIOUS vazio) e nenhuma tag informada." >&2
  echo "Uso: bash scripts/vps-rollback.sh [ghcr.io/org/repo:tag]" >&2
  exit 1
fi

ATUAL=$(grep '^S2_IMAGE=' .env 2>/dev/null | cut -d= -f2- || true)
echo "Rollback: ${ATUAL:-<build local>} -> ${ALVO}"

# Registra o estado para permitir "rollback do rollback"
if [ -n "$ATUAL" ]; then
  grep -q '^S2_IMAGE_PREVIOUS=' .env \
    && sed -i "s|^S2_IMAGE_PREVIOUS=.*|S2_IMAGE_PREVIOUS=${ATUAL}|" .env \
    || echo "S2_IMAGE_PREVIOUS=${ATUAL}" >> .env
fi
grep -q '^S2_IMAGE=' .env \
  && sed -i "s|^S2_IMAGE=.*|S2_IMAGE=${ALVO}|" .env \
  || echo "S2_IMAGE=${ALVO}" >> .env

# A imagem anterior normalmente já está no cache local da VPS; o pull é
# best-effort para o caso de tag arbitrária.
docker compose pull app 2>/dev/null || true
docker compose up -d

LOCAL_PORT=$(grep '^APP_LOCAL_PORT=' .env | cut -d= -f2)
LOCAL_PORT=${LOCAL_PORT:-3000}
for i in $(seq 1 45); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${LOCAL_PORT}/readyz" 2>/dev/null; then
    echo "Rollback concluído — aplicação pronta ✅"
    exit 0
  fi
  sleep 4
done
echo "Aplicação não ficou pronta após o rollback" >&2
docker compose logs --tail=80 app >&2 || true
exit 1
