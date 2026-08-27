# Backup e restore

## Backup

O job produz `.sql.gz` local e, quando `BACKUP_OFFSITE_COMMAND` está configurado, exige também cópia externa. Exemplo com rclone:

`BACKUP_OFFSITE_COMMAND='rclone copy "$BACKUP_FILE" remote:s2licit-backups/'`

A mesma convenção vale para os dois caminhos de backup por cron:

- **Banco**: `node scripts/backup-db.mjs /backups` (`.sql.gz`, integridade
  verificada, retenção `BACKUP_KEEP_DAYS`, offsite via
  `BACKUP_OFFSITE_COMMAND`).
- **Uploads**: `scripts/backup-uploads.sh` (tar.gz do volume `uploads_data`,
  retenção `BACKUP_UPLOADS_MANTER` cópias, mesmo offsite).

Cron sugerido na VPS:

```cron
0 2 * * * cd /opt/s2licit && node scripts/backup-db.mjs /backups >> /var/log/s2-backup.log 2>&1
30 2 * * * /opt/s2licit/scripts/backup-uploads.sh >> /var/log/s2-backup.log 2>&1
```

## Teste de restore

Mensalmente, restaurar o backup mais recente em banco descartável, executar migrations, `checkDatabaseIntegrity`, login de smoke e abrir uma cotação. Backup sem restore testado não é considerado homologado.
