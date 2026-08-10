#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOCK_DIR="${TMPDIR:-/tmp}/s2licit-vps-validation.lock"
LOG_DIR="${S2_VALIDATION_LOG_DIR:-${TMPDIR:-/tmp}/s2licit-validation-logs}"
mkdir -p "$LOG_DIR"

REVISION="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/${STAMP}-${REVISION}.log"

cleanup_lock() {
  rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
}
trap cleanup_lock EXIT INT TERM

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[vps-validation] Já existe uma validação em execução nesta VPS." >&2
  exit 2
fi

exec > >(tee "$LOG_FILE") 2>&1

echo "============================================================"
echo "S2 LICIT — VALIDAÇÃO DIRETA NA VPS"
echo "Sem GitHub Actions e sem runner hospedado pelo GitHub"
echo "Revisão: $REVISION"
echo "Início UTC: $STAMP"
echo "Log local: $LOG_FILE"
echo "============================================================"

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[vps-validation] Comando obrigatório ausente: $command_name" >&2
    exit 3
  fi
}

require_command git
require_command node
require_command docker

if ! docker info >/dev/null 2>&1; then
  echo "[vps-validation] Docker indisponível ou sem permissão para o usuário atual." >&2
  exit 4
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "[vps-validation] O checkout possui alterações rastreadas não commitadas." >&2
  echo "[vps-validation] Valide somente uma revisão reproduzível." >&2
  git status --short
  exit 5
fi

CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || true)"
CURRENT_COMMIT="$(git rev-parse HEAD)"
echo "[vps-validation] Branch: ${CURRENT_BRANCH:-detached}"
echo "[vps-validation] Commit: $CURRENT_COMMIT"

echo "[1/3] Verificando contrato do schema do catálogo..."
node scripts/check-product-schema-contract.mjs

echo "[2/3] Executando validação completa isolada em Docker..."
bash scripts/validate-free.sh

echo "[3/3] Verificando novamente que a validação não alterou arquivos rastreados..."
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "[vps-validation] A validação alterou arquivos rastreados. Gate reprovado." >&2
  git status --short
  exit 6
fi

FINISH_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
echo "============================================================"
echo "VALIDAÇÃO VPS CONCLUÍDA COM SUCESSO"
echo "Commit validado: $CURRENT_COMMIT"
echo "Fim UTC: $FINISH_STAMP"
echo "Log local: $LOG_FILE"
echo "GitHub Actions utilizados: 0"
echo "============================================================"
