# Status — Integration Platform

Branch: `refactor/integration-platform`  
PR: `#93` (draft até validação final)

## Implementado

- Registry único de integrações.
- CredentialResolver com overrides criptografados e fallback imutável do ambiente de boot.
- Cliente HTTP externo único com timeout, retry idempotente, Retry-After, backoff+jitter, circuit breaker, limite de payload, request-id e redaction.
- Contratos/status padronizados e taxonomia de erros.
- BrasilAPI migrada para cliente comum e cache persistente.
- Anthropic Messages API nativa; Groq/Forge por adapters; gateway único e fallback de IA.
- S2 Integration Engineer fundamentado em telemetria real.
- IMAP/SMTP/WhatsApp runtime; correção de mailbox dinâmica.
- Central de Integrações com restore-default, URLs institucionais e cron/flags runtime.
- Scheduler recarregável sem redeploy.
- MySQL advisory locks para jobs sem Redis/Kafka.
- Compras.gov current-first com fallback legado explícito.
- PNCP com validação Zod e paginação defensiva.
- FIEMG manual/agendada compartilhando URL/parser.
- Radar com estado por fonte e distinção entre `NO_RESULTS` e falha.
- RBAC do Radar alinhado em backend/frontend.
- Diagnóstico operacional baseado em `api_logs`.
- `safeFetch.ts` removido.
- endpoint PNCP duplicado de precificação removido.
- `integration_cache` + proveniência.
- testes de regressão do núcleo e scripts de preflight/smoke independentes de GitHub Actions.

## Validação obrigatória antes de produção

1. `node scripts/verify-integration-platform.mjs`
2. `pnpm check`
3. `pnpm test`
4. `pnpm build`
5. `RUN_PUBLIC_SMOKE=1 bash scripts/preflight-integration-platform.sh`
6. aplicar schema `integration_cache` em homologação;
7. smoke tests autenticados de IA, IMAP, SMTP e WhatsApp;
8. confirmar backup pré-migração.

Não fazer merge automático: a governança do repositório reserva o merge ao responsável humano.
