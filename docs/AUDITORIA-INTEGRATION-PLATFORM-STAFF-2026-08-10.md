# Auditoria Staff — Integration Platform — 2026-08-10

## Status executivo

**Branch:** `refactor/integration-platform`  
**PR:** #93  
**Estado:** draft  
**Decisão atual:** **código P0 conhecido corrigido; release ainda bloqueado por ausência de evidência executável de check/test/build e homologação da migração**.

O runner hospedado do GitHub Actions está encerrando as execuções com `startup_failure` antes da criação do primeiro job. Isso não é evidência de falha do código, mas também não pode ser tratado como validação verde.

## Arquitetura alvo

O S2 Licit permanece um **monólito modular**:

```text
CredentialResolver
        ↓
IntegrationRegistry
        ↓
ExternalHttpClient / SecureBrowserRenderer
        ↓
Adapters + runtime contract validation
        ↓
Cache / provenance
        ↓
Domain services
        ↓
Radar / Funil / Produtos / Precificação / Propostas / Pós-venda

api_logs + sync_runs + Diagnóstico
```

A decisão continua sendo não introduzir Redis, Kafka, Vault ou microserviços sem necessidade operacional mensurável. MySQL coordena locks, jobs e persistência para o volume atual.

## Gates de release

| Gate | Estado atual | Critério de aceite |
|---|---|---|
| Browser sem sandbox | **FECHADO NO CÓDIGO** | Nenhum serviço de portal importa Puppeteer diretamente; browser passa por `SecureBrowserRenderer`; não há `--no-sandbox` em args |
| FUNDEP/FUNARBE legado | **FECHADO NO CÓDIGO** | HTTP via `ExternalHttpClient`, browser via renderer seguro, matching indexado e cotação+itens transacionais |
| Portais institucionais S2 | **FECHADO NO CÓDIGO** | FIEMG/CEMIG/COPASA/Compras MG usam renderer/HTTP centralizados; fontes concorrentes com limite; métricas de fundações não duplicam |
| SMTP em propostas | **FECHADO NO CÓDIGO** | `isSmtpConfigured()` é aguardado antes do envio |
| Privacidade de telemetria | **FECHADO NO CÓDIGO** | `api_logs` recebe origem sanitizada, status, classificação e hash+tamanho; não recebe corpo bruto nem pathname secreto |
| TypeScript | **SEM EVIDÊNCIA EXECUTADA** | `pnpm check` = exit 0 |
| Testes | **SEM EVIDÊNCIA EXECUTADA** | `pnpm test` = exit 0 |
| Build | **SEM EVIDÊNCIA EXECUTADA** | `pnpm build` = exit 0 |
| Migração `integration_cache` | **IMPLEMENTADA / HOMOLOGAÇÃO PENDENTE** | `0016_integration_cache.sql` aplicada em clone/homologação e journal confirmado |
| Smoke PNCP/Compras.gov | **EXECUÇÃO REAL PENDENTE** | resposta atual aceita pelo contrato ou falha tipada, nunca falso `NO_RESULTS` |

Os gates são parcialmente materializados em:

- `server/integrations/productionReadiness.test.ts`
- `server/integrations/telemetryPrivacy.test.ts`
- `server/integrations/core/externalHttpClient.test.ts`
- `server/services/emailQuotationMatchingService.test.ts`
- `server/utils/urlGuard.test.ts`
- `scripts/verify-integration-platform.mjs`

## Correções consolidadas

### Transporte externo

- timeout por tentativa e deadline total;
- retry somente quando idempotente e replayable;
- `Retry-After`, backoff exponencial e jitter;
- circuit breaker com limite e expiração;
- limite de body;
- redirects manuais e validados;
- headers sensíveis removidos em redirect cross-origin;
- proteção SSRF por host, IP e DNS;
- validação runtime de contrato antes de sucesso;
- telemetria em lote fora do hot path;
- URL de telemetria reduzida à origem;
- body de telemetria representado apenas por SHA-256 + tamanho.

Memória por request: `O(min(payload, maxBodyBytes))`; filas e circuitos possuem tetos globais.

### Configuração e segredos

- `process.env` somente como bootstrap imutável;
- overrides criptografados no banco;
- último snapshot válido preservado durante falha transitória de banco;
- falha de decriptação não mistura segredo antigo com configuração nova;
- IMAP/SMTP são grupos coerentes;
- UI persiste somente campos realmente alterados;
- URLs institucionais administráveis possuem allowlist de domínio;
- agendas podem ser alteradas em runtime sem redeploy;
- `PRODEMGE_API_KEY` removida do template de produção por não possuir consumidor;
- default Anthropic alinhado a `claude-sonnet-5`; custo nominal reconhecido pela telemetria de IA.

### IA

- Anthropic usa Messages API nativa;
- Groq/Forge usam adapter OpenAI-compatible;
- schemas runtime para respostas;
- seleção explícita de provedor não compartilha prompt com outro provedor;
- fallback cross-provider apenas em `auto` ou autorização explícita;
- OCR usa Anthropic diretamente sem fallback oculto;
- `file_url` genérico não é tratado como arquivo efetivamente lido;
- `activeProvider()` retorna estado seguro quando a preferência aponta para provedor sem credencial;
- Copiloto S2 Integration Engineer é especialização por contexto/evidência, não fine-tuning de pesos.

### PNCP / Compras.gov / Radar

- `NO_RESULTS` separado de falha;
- Zod na fronteira externa;
- paginação truncada resulta em `PARTIAL`;
- modalidades PNCP independentes em paralelo;
- Compras.gov usa endpoint atual primeiro e fallback legado explicitamente parcial;
- fontes do Radar são concorrentes;
- frontend exibe cobertura degradada e estado por fonte;
- RBAC de Radar alinhado no frontend/backend.

### E-mail e comunicação

- IMAP at-least-once;
- mensagem não recebe `Seen` antes de commit/deduplicação;
- cotação + itens na mesma transação;
- `messageId` é `UNIQUE` no banco, protegendo contra corrida entre réplicas;
- limites de mensagem, lote e anexos;
- lock distribuído entre sync manual/scheduler;
- SMTP com pool bounded e rotação segura de credenciais;
- WhatsApp com no máximo 20 destinos, concorrência 4, telefone mascarado e sem retry de POST não idempotente.

### Browser e portais institucionais

- `SecureBrowserRenderer` é o único boundary de Puppeteer para esses fluxos;
- execução como root é recusada em vez de desabilitar sandbox;
- cada request HTTP(S) secundário é validado contra rede não pública;
- imagens/mídia/fontes são bloqueadas;
- requests, hosts e HTML possuem limites;
- FUNDEP/FUNARBE migrados do caminho legado;
- FIEMG/CEMIG/COPASA/Compras MG usam o mesmo boundary;
- persistência de oportunidade + itens é transacional;
- matching usa índice compartilhado por lote.

### Matching

Antes:

```text
O(I × P × L²)
```

Depois:

```text
build: O(P log P)
queries: O(I × (log P + C × L²)), C ≤ P
memory: O(P)
```

O pruning é exato para o threshold baseado em Levenshtein; o teste compara o índice com brute force.

### Scheduler e diagnóstico

- MySQL advisory locks entre réplicas;
- `partial` permanece parcial;
- `lastSuccessfulSyncAt` só avança em sucesso total;
- refresh de cron serializado;
- callbacks não geram rejeição não tratada;
- diagnóstico agrega telemetria no SQL em vez de carregar limite global em memória.

## P1 deliberadamente não expandido neste PR

### Retenção e índices de `api_logs`

A tabela deve receber política de retenção no próximo ciclo de operação. Não foi adicionado índice/migração isolado nesta rodada porque o schema Drizzle precisa permanecer fonte de verdade; otimizar o DELETE sem declarar o índice no schema criaria drift. Antes de volume elevado, definir retenção (ex.: 30–90 dias) e índices alinhados às consultas de saúde.

### Quarentena IMAP / UIDVALIDITY

Mensagens persistentemente inválidas permanecem não lidas para evitar perda silenciosa. Evolução recomendada: quarentena com `UIDVALIDITY + UID + Message-ID`, contador de tentativas e ação administrativa.

### OpenTelemetry

A solução atual (`api_logs`, `sync_runs`, diagnóstico) atende ao monólito atual. OpenTelemetry só deve ser introduzido quando existir collector/exportador e necessidade operacional concreta.

### Segredos de infraestrutura

Credenciais operacionais ficam no store criptografado do S2. `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` e demais segredos raiz continuam responsabilidade da infraestrutura; não devem ser editáveis pela UI.

## Requisitos de produção

1. Container/processo não-root quando browser automation estiver habilitada.
2. Egress/firewall bloqueando RFC1918/link-local/metadata como defesa adicional ao guard de aplicação.
3. Migração `0016` testada em clone/homologação.
4. Preflight completo com exit code zero.
5. Smoke dos contratos públicos sem falsa classificação de ausência de oportunidades.

## Comandos de aceite

```bash
node scripts/verify-integration-platform.mjs
pnpm check
pnpm test
pnpm build
RUN_PUBLIC_SMOKE=1 bash scripts/preflight-integration-platform.sh
```

Enquanto esses comandos não tiverem evidência real de execução verde, o PR deve permanecer **draft**, mesmo com os P0 conhecidos corrigidos no código.
