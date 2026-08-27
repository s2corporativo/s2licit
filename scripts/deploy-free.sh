#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "[deploy] Git não encontrado." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "[deploy] Docker não encontrado." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "[deploy] Docker Compose v2 não está disponível." >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "[deploy] Arquivo .env não encontrado na raiz do projeto." >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[deploy] Existem alterações locais não salvas. Faça commit ou guarde-as antes do deploy." >&2
  exit 1
fi

echo "[1/7] Atualizando a branch main..."
PREV_SHA="$(git rev-parse HEAD)"
git fetch origin main
git checkout main
git pull --ff-only origin main
NOVO_SHA="$(git rev-parse HEAD)"

echo "[2/7] Validando configuração do Docker Compose..."
docker compose config >/dev/null

echo "[3/7] Criando backup antes da atualização, quando o app estiver ativo..."
if docker compose ps --status running --services 2>/dev/null | grep -qx app; then
  docker compose exec -T app node scripts/backup-db.mjs /app/backups
else
  echo "[deploy] Aplicação ainda não está ativa; backup pré-deploy não aplicável."
fi

echo "[4/7] Executando validação gratuita completa..."
bash scripts/validate-free.sh

echo "[5/7] Construindo e iniciando os serviços..."
docker compose up -d --build

espera_saudavel() {
  local attempt status
  for attempt in $(seq 1 36); do
    status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' sistema-s2-app 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then return 0; fi
    if [ "$status" = "unhealthy" ] || [ "$attempt" -eq 36 ]; then return 1; fi
    sleep 5
  done
  return 1
}

echo "[6/7] Aguardando o healthcheck da aplicação..."
if ! espera_saudavel; then
  echo "[deploy] A aplicação não ficou saudável no commit ${NOVO_SHA:0:7}." >&2
  docker compose ps >&2 || true
  docker compose logs --tail=200 app >&2 || true
  echo "[deploy] ROLLBACK automático para o commit anterior ${PREV_SHA:0:7}..." >&2
  git checkout -f "$PREV_SHA"
  docker compose up -d --build
  if espera_saudavel; then
    echo "[deploy] 🟡 Rollback OK — produção voltou a ${PREV_SHA:0:7}." >&2
    echo "[deploy]    Se o deploy aplicou migration nova, o schema segue adiantado;" >&2
    echo "[deploy]    se o app antigo reclamar do banco, restaure o backup pré-deploy" >&2
    echo "[deploy]    (docs/BACKUP-RESTORE.md) e investigue o commit ${NOVO_SHA:0:7}." >&2
  else
    echo "[deploy] ❌ CRÍTICO: rollback também não ficou saudável. Restaure o backup" >&2
    echo "[deploy]    pré-deploy conforme docs/BACKUP-RESTORE.md e verifique os logs." >&2
  fi
  exit 1
fi

echo "[7/7] Estado final dos serviços:"
docker compose ps

echo
printf '%s\n' \
  "============================================================" \
  "DEPLOY GRATUITO CONCLUÍDO" \
  "GitHub usado somente para armazenar o código." \
  "Validação e build executados na própria VPS, sem Actions." \
  "============================================================"
