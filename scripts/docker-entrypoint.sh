#!/bin/sh
# Entrypoint do container da aplicação.
# Roda como root apenas o suficiente para corrigir a posse de volumes criados
# por versões antigas da imagem (que rodavam como root) e então executa a
# aplicação como usuário sem privilégio (node).
set -e

chown -R node:node /app/uploads /app/backups 2>/dev/null || true

# Corrige o bug do PDFKit 0.17.2 em ESM (__dirname indefinido → PDFs em branco).
# Idempotente: se já patcheado, não altera nada.
node /app/scripts/patch-pdfkit-esm.mjs 2>/dev/null || true

exec runuser -u node -- sh -c "node scripts/migrate-production.mjs && exec node dist/index.js"
