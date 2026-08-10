#!/usr/bin/env bash
set -euo pipefail

printf '\n== S2 Licit / Integration Platform preflight ==\n'

node scripts/verify-integration-platform.mjs

printf '\n== TypeScript ==\n'
pnpm check

printf '\n== Tests ==\n'
pnpm test

printf '\n== Build ==\n'
pnpm build

if [[ "${RUN_PUBLIC_SMOKE:-0}" == "1" ]]; then
  printf '\n== Public integrations smoke ==\n'
  node scripts/smoke-public-integrations.mjs
else
  printf '\nPublic smoke skipped. Run with RUN_PUBLIC_SMOKE=1 to validate live PNCP/Compras.gov contracts.\n'
fi

printf '\n✅ Preflight concluído.\n'
