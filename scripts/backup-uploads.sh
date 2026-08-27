#!/usr/bin/env bash
# ============================================================
# Backup diário dos uploads — S2 Licit (produção)
# Os arquivos enviados vivem no volume Docker `uploads_data`
# (montado em /app/uploads no container sistema-s2-app). Gera um
# tar.gz do volume, mantém as últimas BACKUP_UPLOADS_MANTER
# cópias e, com rclone configurado, envia para fora da VPS.
#
# Agendamento sugerido (junto com o backup do banco):
#   30 2 * * * /opt/s2licit/scripts/backup-uploads.sh >> /var/log/s2-backup.log 2>&1
#
# Variáveis (opcionais):
#   BACKUP_DIR               destino (padrão: <raiz>/backups/uploads)
#   BACKUP_UPLOADS_MANTER    cópias mantidas (padrão: 7)
#   BACKUP_OFFSITE_COMMAND   comando shell p/ cópia offsite; recebe o caminho
#                            em $BACKUP_FILE (mesma convenção do backup do
#                            banco e do docs/BACKUP-RESTORE.md), ex.:
#                            rclone copy "$BACKUP_FILE" gdrive:s2-backups/uploads/
# ============================================================
set -Eeuo pipefail

DIR_SCRIPT="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR_SCRIPT/.." && pwd)"
cd "$ROOT"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups/uploads}"
MANTER="${BACKUP_UPLOADS_MANTER:-7}"
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
ARQ="$BACKUP_DIR/uploads-${TS}.tar.gz"

# App rodando → exec; parado → container efêmero da mesma imagem, para que o
# backup nunca dependa do runtime estar saudável.
ESTADO="$(docker inspect -f '{{.State.Status}}' sistema-s2-app 2>/dev/null || true)"
log "📦 Backup dos uploads → $ARQ"
trap 'rm -f "$ARQ.part"' EXIT
if [ "$ESTADO" = "running" ]; then
  docker compose exec -T app tar -czf - -C /app uploads > "$ARQ.part"
else
  log "App não está rodando (estado: ${ESTADO:-ausente}); usando container efêmero."
  docker compose run --rm --no-deps -T app tar -czf - -C /app uploads > "$ARQ.part"
fi
# Sanidade: o tar precisa ser legível antes de valer como backup
tar -tzf "$ARQ.part" > /dev/null
mv "$ARQ.part" "$ARQ"
log "✅ Concluído e íntegro: $ARQ ($(du -sh "$ARQ" | cut -f1))"

# Rotação: mantém as N cópias mais recentes
ls -t "$BACKUP_DIR"/uploads-*.tar.gz 2>/dev/null | tail -n "+$((MANTER + 1))" | xargs -r rm -f
log "♻️ Rotação: mantidas as ${MANTER} cópias mais recentes"

# Offsite (regra 3-2-1): mesma convenção BACKUP_OFFSITE_COMMAND do backup do banco
if [ -n "${BACKUP_OFFSITE_COMMAND:-}" ]; then
  if BACKUP_FILE="$ARQ" sh -c "$BACKUP_OFFSITE_COMMAND"; then
    log "☁️ Cópia offsite concluída."
  else
    log "⚠️ Falha no envio offsite — backup local segue válido; verifique o comando."
    exit 1
  fi
else
  log "ℹ️ Offsite desativado (defina BACKUP_OFFSITE_COMMAND para ativar)."
fi
