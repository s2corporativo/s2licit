# Backup e restore

## Backup

A política usa duas cópias locais verificadas e uma etapa offsite opcional:

- o **dump do MySQL** é gerado dentro do container `app`, onde `DATABASE_URL`
  e o hostname `db` são válidos;
- o wrapper `scripts/backup-db-cron.sh` copia o `.sql.gz` verificado para
  `backups/db/` no host e executa a etapa offsite no **host**;
- `scripts/backup-uploads.sh` gera o `.tar.gz` de `uploads_data` diretamente em
  `backups/uploads/` no host e também executa o offsite no host.

`BACKUP_OFFSITE_COMMAND` recebe o caminho do arquivo em `$BACKUP_FILE`. Exemplo
com `rclone` instalado e configurado **na VPS host**:

```env
BACKUP_OFFSITE_COMMAND='rclone copy "$BACKUP_FILE" remote:s2licit-backups/'
```

O `.env` não é executado como shell pelos wrappers: somente as chaves de backup
necessárias são lidas. Isso evita que valores com sintaxe de shell sejam
interpretados acidentalmente.

Cron sugerido na VPS:

```cron
0 2 * * * /opt/s2licit/scripts/backup-db-cron.sh >> /var/log/s2-backup.log 2>&1
30 2 * * * /opt/s2licit/scripts/backup-uploads.sh >> /var/log/s2-backup.log 2>&1
```

Retenção:

- banco no volume Docker: `BACKUP_KEEP_DAYS` (padrão 14 dias);
- cópia do banco no host: `BACKUP_KEEP_DAYS` (padrão 14 dias);
- uploads no host: `BACKUP_UPLOADS_MANTER` (padrão 7 cópias).

Uma falha do offsite retorna código diferente de zero e preserva o arquivo local
para reenvio manual. O backup pré-deploy é deliberadamente local: indisponibilidade
do serviço offsite não deve impedir a criação da evidência necessária para um
rollback imediato.

## Rollback de deploy

`scripts/deploy-free.sh` grava `.deploy-state/production-sha` somente depois que
o novo container passa no healthcheck. Esse SHA homologado é o único alvo aceito
para rollback automático. Se uma instalação antiga ainda não possuir o marcador,
o deploy pode prosseguir, mas não tenta usar um `HEAD` local arbitrário como
versão anterior.

## Teste de restore

Mensalmente, restaurar o backup mais recente em banco descartável, executar
migrations, `checkDatabaseIntegrity`, login de smoke e abrir uma cotação. Backup
sem restore testado não é considerado homologado.
