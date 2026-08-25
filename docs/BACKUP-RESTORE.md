# Backup e restore

## Backup

O job produz `.sql.gz` local e, quando `BACKUP_OFFSITE_COMMAND` está configurado, exige também cópia externa. Exemplo com rclone:

`BACKUP_OFFSITE_COMMAND='rclone copy "$BACKUP_FILE" remote:s2licit-backups/'`

## Teste de restore

Mensalmente, restaurar o backup mais recente em banco descartável, executar migrations, `checkDatabaseIntegrity`, login de smoke e abrir uma cotação. Backup sem restore testado não é considerado homologado.
