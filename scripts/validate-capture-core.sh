#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET_SNAPSHOT="drizzle/meta/0016_snapshot.json"

printf '%s\n' \
  "============================================================" \
  "CAPTURE CORE — GATE COMPLETO DE VALIDAÇÃO" \
  "Revisão: $(git rev-parse --short HEAD 2>/dev/null || echo desconhecida)" \
  "============================================================"

echo "[capture-gate] Etapa 1/3 — snapshot Drizzle reproduzível"
if [ ! -f "$TARGET_SNAPSHOT" ]; then
  bash scripts/generate-capture-core-snapshot.sh
else
  echo "[capture-gate] $TARGET_SNAPSHOT já existe; usando artefato presente na revisão."
fi

echo "[capture-gate] Etapa 2/3 — typecheck, lint, testes, build e MySQL isolado"
bash scripts/validate-free.sh

echo "[capture-gate] Etapa 3/3 — smoke autenticado bounded de conectores"
bash scripts/smoke-capture-connectors.sh

echo
if git status --porcelain -- "$TARGET_SNAPSHOT" | grep -q .; then
  echo "[capture-gate] ATENÇÃO: $TARGET_SNAPSHOT foi gerado/alterado e ainda precisa ser versionado." >&2
  SNAPSHOT_STATE="pendente de commit"
else
  SNAPSHOT_STATE="versionado/sem alterações locais"
fi

printf '%s\n' \
  "============================================================" \
  "CAPTURE CORE VALIDADO COM SUCESSO" \
  "Snapshot: ${SNAPSHOT_STATE}" \
  "Nenhum deploy foi executado." \
  "Próxima ação: revisar/commitar o snapshot e então reavaliar o estado draft do PR." \
  "============================================================"
