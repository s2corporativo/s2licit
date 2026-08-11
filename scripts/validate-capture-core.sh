#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET_SNAPSHOT="drizzle/meta/0016_snapshot.json"
VALIDATION_PARENT=""
VALIDATION_DIR=""

cleanup() {
  if [ -n "$VALIDATION_DIR" ] && [ -d "$VALIDATION_DIR" ]; then
    git -C "$ROOT_DIR" worktree remove --force "$VALIDATION_DIR" >/dev/null 2>&1 || true
  fi
  if [ -n "$VALIDATION_PARENT" ] && [ -d "$VALIDATION_PARENT" ]; then
    rm -rf "$VALIDATION_PARENT"
  fi
}
trap cleanup EXIT INT TERM

if ! command -v git >/dev/null 2>&1; then
  echo "[capture-gate] Git não está instalado ou não está no PATH." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[capture-gate] Docker não está instalado ou não está no PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[capture-gate] Docker não está em execução ou o usuário não possui permissão." >&2
  exit 1
fi

# A validação precisa partir de uma revisão reproduzível. O único arquivo local
# tolerado é o snapshot 0016 de uma execução anterior do próprio gate.
DIRTY_OTHER="$({ git status --porcelain || true; } | grep -vF " $TARGET_SNAPSHOT" || true)"
if [ -n "$DIRTY_OTHER" ]; then
  echo "[capture-gate] Checkout possui alterações locais fora do snapshot 0016:" >&2
  printf '%s\n' "$DIRTY_OTHER" >&2
  echo "[capture-gate] Salve/commit/stash essas alterações antes de validar." >&2
  exit 1
fi

FEATURE_HEAD="$(git rev-parse HEAD)"
FEATURE_SHORT="$(git rev-parse --short HEAD)"
FEATURE_BRANCH="$(git branch --show-current || true)"

printf '%s\n' \
  "============================================================" \
  "CAPTURE CORE — GATE COMPLETO DE VALIDAÇÃO" \
  "Branch: ${FEATURE_BRANCH:-detached}" \
  "Feature HEAD: ${FEATURE_SHORT}" \
  "============================================================"

echo "[capture-gate] Atualizando referência local de origin/main..."
git fetch --prune origin main
MAIN_HEAD="$(git rev-parse origin/main)"
MAIN_SHORT="$(git rev-parse --short origin/main)"
echo "[capture-gate] origin/main: $MAIN_SHORT"

VALIDATION_PARENT="$(mktemp -d)"
VALIDATION_DIR="$VALIDATION_PARENT/worktree"

echo "[capture-gate] Criando worktree isolado do merge candidate..."
git worktree add --detach "$VALIDATION_DIR" "$FEATURE_HEAD" >/dev/null

if ! git -C "$VALIDATION_DIR" \
  -c user.name="S2 Capture Validation" \
  -c user.email="validation@local.invalid" \
  merge --no-commit --no-ff "$MAIN_HEAD"; then
  echo "[capture-gate] Conflito ao combinar feature com origin/main." >&2
  git -C "$VALIDATION_DIR" status --short >&2 || true
  echo "[capture-gate] Gate interrompido antes de qualquer teste." >&2
  exit 1
fi

UNMERGED="$(git -C "$VALIDATION_DIR" diff --name-only --diff-filter=U || true)"
if [ -n "$UNMERGED" ]; then
  echo "[capture-gate] Arquivos não resolvidos no merge candidate:" >&2
  printf '%s\n' "$UNMERGED" >&2
  exit 1
fi

cd "$VALIDATION_DIR"

echo "[capture-gate] Merge candidate preparado: feature $FEATURE_SHORT + main $MAIN_SHORT"

echo "[capture-gate] Etapa 1/3 — snapshot Drizzle reproduzível e sem schema drift"
# Mesmo quando o snapshot já estiver versionado, ele é regenerado no merge
# candidate e comparado indiretamente pelo validate-free. Isso detecta drift
# provocado por mudanças recentes da main.
rm -f "$TARGET_SNAPSHOT"
bash scripts/generate-capture-core-snapshot.sh

echo "[capture-gate] Etapa 2/3 — typecheck, lint, testes, build e MySQL isolado"
bash scripts/validate-free.sh

echo "[capture-gate] Etapa 3/3 — smoke autenticado bounded de conectores"
bash scripts/smoke-capture-connectors.sh

# Só depois de TODOS os gates verdes o snapshot do merge candidate volta para o
# checkout real. Nenhum outro arquivo da main/feature é copiado ou modificado.
cd "$ROOT_DIR"
install -m 0644 "$VALIDATION_DIR/$TARGET_SNAPSHOT" "$ROOT_DIR/$TARGET_SNAPSHOT"

echo
if git status --porcelain -- "$TARGET_SNAPSHOT" | grep -q .; then
  echo "[capture-gate] $TARGET_SNAPSHOT foi gerado/atualizado e precisa ser versionado." >&2
  SNAPSHOT_STATE="pendente de commit"
else
  SNAPSHOT_STATE="versionado e reproduzível"
fi

printf '%s\n' \
  "============================================================" \
  "CAPTURE CORE VALIDADO COM SUCESSO" \
  "Merge candidate: ${FEATURE_SHORT} + main ${MAIN_SHORT}" \
  "Snapshot: ${SNAPSHOT_STATE}" \
  "Nenhum merge, push ou deploy foi executado." \
  "Próxima ação: versionar o snapshot, se alterado, e reavaliar o estado draft do PR." \
  "============================================================"
