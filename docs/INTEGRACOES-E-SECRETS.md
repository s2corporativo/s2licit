# Integrações e Secrets — Sistema S2

O deploy lê as configurações cadastradas em **Settings → Secrets and variables → Actions** e grava somente valores não vazios no arquivo `/opt/s2licit/.env` da VPS. O arquivo existente é preservado e nenhum valor é exibido nos logs.

## Secrets obrigatórios

| Nome | Finalidade |
|---|---|
| `VPS_PASSWORD` | Acesso SSH usado pelo workflow de deploy |
| `ADMIN_PASSWORD` | Senha do administrador local sincronizada no boot |

O banco, `JWT_SECRET` e `ENCRYPTION_KEY` são gerados pelo bootstrap na primeira instalação e permanecem exclusivamente na VPS.

## Inteligência artificial

| Nome | Finalidade |
|---|---|
| `GROQ_API_KEY` | Ativa o provedor Groq |
| `ANTHROPIC_API_KEY` | Ativa o provedor Anthropic/Claude |
| `BUILT_IN_FORGE_API_URL` | Endpoint legado compatível com OpenAI |
| `BUILT_IN_FORGE_API_KEY` | Chave do endpoint legado |

Configurações não sensíveis recomendadas como **Repository Variables**:

- `AI_PROVIDER`: `auto`, `groq` ou `anthropic`;
- `GROQ_MODEL`;
- `ANTHROPIC_MODEL`;
- `LLM_TIMEOUT_MS`.

## E-mail

A configuração simplificada já utilizada pelo projeto é:

- `EMAIL_USER`;
- `EMAIL_PASSWORD`.

Quando esses dois secrets existem, o deploy configura automaticamente Gmail IMAP e SMTP. Também são aceitas configurações avançadas separadas:

- `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_TLS`, `IMAP_MAILBOX`;
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_FROM`.

## WhatsApp

Meta Cloud API:

- `WHATSAPP_PHONE_ID`;
- `WHATSAPP_TOKEN`;
- `WHATSAPP_TO`.

Webhook próprio, Z-API, Twilio ou n8n:

- `WHATSAPP_WEBHOOK_URL`;
- `WHATSAPP_TO`.

A versão da API pode ser definida pela variável `WHATSAPP_API_VERSION`.

## Agendadores

Podem ser definidos como Repository Variables:

- `EMAIL_SYNC_ENABLED` e `EMAIL_SYNC_CRON`;
- `ALERTS_ENABLED` e `ALERTS_CRON`;
- `SCRAPER_SCHEDULE_ENABLED` e `SCRAPER_SCHEDULE_CRON`.

## Credenciais que não pertencem aos Secrets do GitHub

Os logins de fornecedores e portais de licitação são cadastrados dentro do próprio sistema:

- **Automação e integrações → Acessos fornecedores**;
- **Automação e integrações → Acessos aos portais**.

Essas senhas são criptografadas com `ENCRYPTION_KEY` antes de serem salvas no banco. Não altere a chave de criptografia depois de cadastrar acessos.

## Verificação

Após qualquer mudança, execute **Actions → Deploy VPS**. Em seguida, abra **Automação e integrações → Diagnóstico**. O painel mostra os nomes das variáveis reconhecidas pelo container, mas nunca revela seus valores.
