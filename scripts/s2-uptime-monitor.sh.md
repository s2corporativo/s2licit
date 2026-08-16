# s2-uptime-monitor.sh — Monitor de disponibilidade do S2 Licít (VPS)

Cópia versionada (rastreabilidade) do monitor instalado em produção:

- `/usr/local/bin/s2-uptime-monitor.sh`
- `/opt/s2licit-monitor/s2-uptime-monitor.sh` (mesmo conteúdo)

Executado a cada 10 minutos pelo systemd timer `s2-uptime-monitor.timer`
(service `s2-uptime-monitor.service`). Verifica `/healthz` (aplicação) e
`/readyz` (aplicação + MySQL). O endpoint `/health` **não existe** na
aplicação e não deve ser adicionado a esta lista (alertas falsos — removido
em 2026-08-16).

Ao detectar N verificações consecutivas com falha, envia e-mail de alerta
ao administrador (credenciais SMTP do .env do S2). O relatório do e-mail
não expõe valores sensíveis: apenas endpoint, código HTTP e tempos.

Sincronização produção ↔ repo: ao alterar o script na VPS, atualizar este
arquivo e versionar a mudança (mesma lógica nos dois lugares).

Backup local na VPS: `.bak-20260816` nos dois caminhos.
