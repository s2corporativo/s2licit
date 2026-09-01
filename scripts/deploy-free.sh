#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STATE_DIR="${S2_DEPLOY_STATE_DIR:-$ROOT_DIR/.deploy-state}"
STATE_FILE="$STATE_DIR/production-sha"
mkdir -p "$STATE_DIR"

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

ROLLBACK_SHA="${S2_DEPLOYED_SHA:-}"
if [ -z "$ROLLBACK_SHA" ] && [ -s "$STATE_FILE" ]; then
  ROLLBACK_SHA="$(tr -d '[:space:]' < "$STATE_FILE")"
fi
if [ -n "$ROLLBACK_SHA" ] && ! git cat-file -e "${ROLLBACK_SHA}^{commit}" 2>/dev/null; then
  git fetch origin "$ROLLBACK_SHA" >/dev/null 2>&1 || true
fi
if [ -n "$ROLLBACK_SHA" ] && ! git cat-file -e "${ROLLBACK_SHA}^{commit}" 2>/dev/null; then
  echo "[deploy] Marcador de produção inválido (${ROLLBACK_SHA}); rollback automático ficará desativado neste ciclo." >&2
  ROLLBACK_SHA=""
fi
if [ -z "$ROLLBACK_SHA" ]; then
  echo "[deploy] Nenhum SHA de produção confiável registrado ainda."
  echo "[deploy] Este ciclo pode publicar normalmente, mas não fará rollback automático para um HEAD arbitrário."
fi

echo "[1/7] Atualizando a branch main..."
git fetch origin main
git checkout main
git pull --ff-only origin main
NOVO_SHA="$(git rev-parse HEAD)"

echo "[2/7] Validando configuração do Docker Compose..."
docker compose config >/dev/null

echo "[3/7] Criando backup local antes da atualização, quando o app estiver ativo..."
if docker compose ps --status running --services 2>/dev/null | grep -qx app; then
  # O backup pré-deploy não deve depender de serviço offsite; ele existe para
  # permitir recuperação local imediata mesmo quando rclone/rede externa falham.
  docker compose exec -T -e BACKUP_OFFSITE_COMMAND= app node scripts/backup-db.mjs /app/backups
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

registrar_sha_publicado() {
  local sha="$1" tmp="${STATE_FILE}.tmp"
  printf '%s\n' "$sha" > "$tmp"
  mv "$tmp" "$STATE_FILE"
}

echo "[6/7] Aguardando o healthcheck da aplicação..."
if ! espera_saudavel; then
  echo "[deploy] A aplicação não ficou saudável no commit ${NOVO_SHA:0:7}." >&2
  docker compose ps >&2 || true
  docker compose logs --tail=200 app >&2 || true

  if [ -n "$ROLLBACK_SHA" ] && [ "$ROLLBACK_SHA" != "$NOVO_SHA" ]; then
    echo "[deploy] ROLLBACK automático para o último SHA homologado ${ROLLBACK_SHA:0:7}..." >&2
    git checkout -f "$ROLLBACK_SHA"
    docker compose up -d --build
    if espera_saudavel; then
      registrar_sha_publicado "$ROLLBACK_SHA"
      echo "[deploy] 🟡 Rollback OK — produção voltou a ${ROLLBACK_SHA:0:7}." >&2
      echo "[deploy]    Se o deploy aplicou migration nova, o schema pode seguir adiantado;" >&2
      echo "[deploy]    se o app anterior reclamar do banco, restaure o backup pré-deploy" >&2
      echo "[deploy]    (docs/BACKUP-RESTORE.md) e investigue o commit ${NOVO_SHA:0:7}." >&2
    else
      echo "[deploy] ❌ CRÍTICO: rollback também não ficou saudável. Restaure o backup" >&2
      echo "[deploy]    pré-deploy conforme docs/BACKUP-RESTORE.md e verifique os logs." >&2
    fi
  else
    echo "[deploy] Rollback automático seguro indisponível: não há SHA anterior confiável registrado." >&2
    echo "[deploy] Não será usado o HEAD local como substituto, para evitar publicar código incorreto." >&2
  fi
  exit 1
fi

registrar_sha_publicado "$NOVO_SHA"

echo "[7/7] Estado final dos serviços:"
docker compose ps

echo
printf '%s\n' \
  "============================================================" \
  "DEPLOY GRATUITO CONCLUÍDO" \
  "SHA homologado: $NOVO_SHA" \
  "GitHub usado somente para armazenar o código." \
  "Validação e build executados na própria VPS, sem Actions." \
  "============================================================"
