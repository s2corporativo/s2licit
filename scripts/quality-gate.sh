#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

export PUPPETEER_SKIP_DOWNLOAD="${PUPPETEER_SKIP_DOWNLOAD:-true}"
export NODE_ENV="${NODE_ENV:-test}"

if command -v corepack >/dev/null 2>&1; then
  corepack enable
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[quality-gate] pnpm não encontrado. Instale/ative pnpm compatível com o lockfile." >&2
  exit 127
fi

if [ "${SKIP_INSTALL:-false}" != "true" ]; then
  echo "[quality-gate] instalando dependências congeladas"
  pnpm install --frozen-lockfile
fi

echo "[quality-gate] lint"
pnpm lint

echo "[quality-gate] TypeScript"
pnpm check

echo "[quality-gate] testes"
pnpm test

echo "[quality-gate] build"
pnpm build

echo "[quality-gate] OK"
