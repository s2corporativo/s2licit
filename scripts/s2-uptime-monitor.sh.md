# s2-uptime-monitor.sh — Monitor de disponibilidade do S2 Licít (VPS)

Cópia versionada (rastreabilidade) do monitor instalado em produção:

- `/usr/local/bin/s2-uptime-monitor.sh`
- `/opt/s2licit-monitor/s2-uptime-monitor.sh` (mesmo conteúdo)

Executado a cada 10 minutos pelo systemd timer `s2-uptime-monitor.timer`
(service `s2-uptime-monitor.service`). Verifica `/healthz` (aplicação) e
`/readyz` (aplicação + MySQL). O endpoint `/health` **não existe** na
aplicação e não deve ser adicionado a esta lista (alertas falsos — removido
em 2026-08-16).

## Por que a versão de 25/08/2026 mudou

O titular recebeu **centenas de e-mails "S2 Licit fora do ar" com o sistema
no ar**. Causa: a porta local era adivinhada. O monitor usava
`${APP_LOCAL_PORT:-8088}`, mas:

- o `docker-compose.yml` publica `127.0.0.1:${APP_LOCAL_PORT:-3000}:3000`
  (padrão **3000**, não 8088 — 8088 é candidata a porta *pública*);
- `scripts/vps-bootstrap.sh` **escolhe `APP_LOCAL_PORT` dinamicamente**
  (3000/3001/3002/3010, a primeira livre), então o valor muda entre deploys;
- `.env.production.example` **não listava** `APP_LOCAL_PORT` — um `.env`
  refeito a partir do exemplo nasce sem a variável e cai no fallback errado.

Com a porta errada, todo ciclo dava "conexão recusada" e, a cada 30 minutos,
saía um e-mail de queda. São 48 e-mails/dia com o sistema saudável.

## Política de alerta atual

1. **A porta é descoberta, não adivinhada**: `S2_LOCAL_PORT` → `APP_LOCAL_PORT`
   do `.env` → porta publicada pelo container (`docker compose port app 3000`)
   → sondagem de 3000/3001/3002/3010/8088. Cada candidata é validada por
   `/healthz` antes de ser aceita.
2. **Falha local nunca vira e-mail de queda sozinha**: antes de alertar, o
   monitor confirma pela URL pública (`PUBLIC_URL`, ou `https://$DOMAIN`). Se
   o público responde 2xx, **não há indisponibilidade** — o monitor registra
   `FALSO-POSITIVO` no log e, no máximo **uma vez por dia**, avisa que ele
   próprio precisa de ajuste. Nenhum alerta de queda é enviado.
3. **Backoff e teto**: incidente real alerta com 30 min → 1 h → 2 h → 4 h →
   8 h (teto 12 h) e no máximo **5 e-mails por incidente**. Depois disso a
   falha continua registrada em log. Antes: 1 e-mail a cada 30 min, sem fim.
4. **Recuperação**: quando volta, sai **um** e-mail de recuperação e o estado
   do incidente é zerado.
5. **Interruptor**: `MONITOR_ALERTS_ENABLED=false` (ambiente ou `.env`)
   suprime todo envio, mantendo o log.

Ao detectar falha, o e-mail sai por `s2-licit-alert-mail` (credenciais SMTP do
`.env` do S2). O relatório não expõe valores sensíveis: apenas endpoint,
código HTTP e tempos.

## Autoteste

```bash
bash scripts/s2-uptime-monitor.sh --self-test
```

Valida a regra de volume de e-mail (backoff, teto, classificação de código
HTTP) sem precisar da VPS. Rode após qualquer alteração no script.

## Estado em disco (`/var/log/s2-licit/`)

| Arquivo | Papel |
|---|---|
| `uptime.log` | Histórico de todas as verificações |
| `uptime.state` | Falhas consecutivas do incidente em curso |
| `uptime.alertcount` | E-mails já enviados no incidente (alimenta o backoff) |
| `uptime.lastalert` | Epoch do último e-mail de queda |
| `uptime.misconfig` | Epoch do último aviso de monitor mal configurado |

Sincronização produção ↔ repo: ao alterar o script na VPS, atualizar este
arquivo e versionar a mudança (mesma lógica nos dois lugares).

Backup local na VPS: `.bak-20260816` nos dois caminhos.
