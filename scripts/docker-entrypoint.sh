#!/bin/sh
# Entrypoint do container da aplicação.
# Roda como root apenas para corrigir a posse de volumes antigos e depois
# executa migrações/aplicação como usuário sem privilégio (node).
set -e

chown -R node:node /app/uploads /app/backups 2>/dev/null || true

# Corrige o bug do PDFKit 0.17.2 em ESM. Idempotente.
node /app/scripts/patch-pdfkit-esm.mjs 2>/dev/null || true

# Antes de executar qualquer migration, confirma que arquivos já aplicados não
# foram reescritos. Em produção o padrão é fail-fast.
exec runuser -u node -- sh -c "node scripts/check-migration-drift.mjs && node scripts/migrate-production.mjs && exec node dist/index.js"
