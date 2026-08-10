# Auditoria Staff — Integration Platform — 2026-08-10

## Status

**Branch:** `refactor/integration-platform`  
**PR:** #93  
**Decisão atual:** **NÃO LIBERAR PARA PRODUÇÃO** até todos os gates P0 abaixo estarem verdes.

Este documento registra o estado verificável da revisão. “Implementado” não significa “validado em produção”; validação exige typecheck, testes, build e smoke tests dos contratos externos.

## Arquitetura alvo

O S2 Licit permanece um **monólito modular**. Integrações externas devem passar por uma única plataforma interna:

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

Não adicionar Redis, Kafka, Vault ou microserviços sem necessidade mensurável. MySQL continua sendo a coordenação persistente para o volume atual; a arquitetura deixa pontos de extensão explícitos para evolução horizontal.

## Gates P0 — obrigatórios antes de merge/release

| Gate | Estado | Critério de aceite |
|---|---|---|
| Browser de portais sem sandbox | **BLOQUEADO** | Nenhum `--no-sandbox`/`--disable-setuid-sandbox`; todo browser usa `SecureBrowserRenderer` e processo não-root |
| FUNDEP/FUNARBE legado | **BLOQUEADO** | `portalOpportunitySyncService.ts` sem `axios`/`puppeteer` direto; HTTP via `ExternalHttpClient`; browser via `SecureBrowserRenderer`; cotação+itens transacionais |
| Pré-condição SMTP em propostas | **BLOQUEADO** | Todo `isSmtpConfigured()` usado como condição deve ser `await`-ado |
| TypeScript | **SEM EVIDÊNCIA VERDE** | `pnpm check` = exit code 0 |
| Testes | **SEM EVIDÊNCIA VERDE** | `pnpm test` = exit code 0 |
| Build | **SEM EVIDÊNCIA VERDE** | `pnpm build` = exit code 0 |
| Migração integration_cache | **IMPLEMENTADA; validar** | `0016_integration_cache.sql` aplicada em clone/homologação sem perda de dados |
| Smoke PNCP/Compras.gov | **PENDENTE DE EXECUÇÃO REAL** | contratos atuais retornam formato aceito ou erro tipado, nunca falso `NO_RESULTS` |

`server/integrations/productionReadiness.test.ts` materializa parte desses gates no test suite para impedir regressão/merge acidental.

## Correções estruturais implementadas

### Transporte HTTP

- timeout por tentativa + deadline total;
- retry somente em operação idempotente e corpo replayable;
- `Retry-After`, exponential backoff + jitter;
- circuit breaker bounded;
- body size bounded;
- redaction;
- telemetry queue bounded, fora do hot path;
- validação de contrato runtime antes de registrar sucesso;
- redirects manuais e validados;
- proteção SSRF para hosts/IPs locais, privados, link-local e reservados;
- stripping de headers sensíveis em redirect cross-origin;
- User-Agent S2 Licit.

**Memória:** O(min(payload, `maxBodyBytes`)) por request; circuitos/telemetria possuem limites globais fixos.

### Credenciais/configuração

- `process.env` é somente bootstrap imutável;
- overrides são criptografados no banco;
- último snapshot válido permanece durante falha transitória do DB;
- segredo com erro de decriptação falha fechado;
- IMAP/SMTP tratados como grupos coerentes;
- UI envia somente chaves dirty;
- URLs de FIEMG/Compras MG/CEMIG/COPASA possuem allowlist de domínio oficial;
- schedules podem ser recarregados em runtime sem deploy.

### PNCP / Compras.gov / FIEMG

- `NO_RESULTS` separado de falha;
- Zod na fronteira de transporte;
- paginação com truncamento explícito `PARTIAL`;
- modalidades PNCP concorrentes;
- fontes independentes do Radar concorrentes;
- Compras.gov atual-first + fallback legado explicitamente parcial;
- FIEMG detecta provável contract drift quando a página continua contendo sinais de licitação mas o parser deixa de reconhecer oportunidades.

### IA

- Anthropic Messages API nativa;
- Groq/Forge OpenAI-compatible;
- schemas runtime de resposta;
- provedor explicitamente selecionado não compartilha prompt com outro provedor por fallback implícito;
- fallback cross-provider só em modo `auto` ou autorização explícita;
- OCR força Anthropic sem fallback;
- `file_url` genérico não é tratado como se o conteúdo do arquivo tivesse sido realmente lido.

### IMAP/SMTP/WhatsApp

- IMAP at-least-once: fetch não marca `Seen`; ACK somente após persistência/deduplicação;
- limites de mensagem/anexo/lote;
- cotação + itens em transação;
- lock distribuído impede scheduler/manual concorrentes;
- SMTP pool bounded e rotação de configuração sem interromper envios em voo;
- limites de anexos/body/subject;
- WhatsApp fanout bounded, no máximo 20 destinos e concorrência 4;
- telefone mascarado em logs;
- POST de mensagem sem retry automático por ausência de chave idempotente padronizada.

### Scheduler

- MySQL advisory locks entre réplicas;
- execução `partial` registrada como parcial;
- `lastSuccessfulSyncAt` só avança em sucesso completo;
- refresh serializado;
- novo plano cron validado antes de substituir o atual;
- callback cron não gera unhandled rejection;
- scan global de scrapers mantém lock apenas durante seleção; execução usa locks individuais e concorrência limitada.

### Diagnóstico

A agregação saiu do Node (antigo O(L×D) e limite global de 1.500 logs) para SQL por fonte. Memória do processo passa a O(D), onde D é a quantidade pequena de integrações registradas; o cálculo não perde eventos simplesmente porque o volume de 24h ultrapassou um limite arbitrário.

### Matching de produtos

O fuzzy matching deixa de comparar todo item contra todo produto sem pruning.

Antes:

```text
O(I × P × L²)
```

Depois:

```text
build index: O(P log P)
queries: O(I × (log P + C × L²)), C ≤ P
memory: O(P)
```

O pruning por comprimento é matematicamente seguro para a similaridade baseada em Levenshtein: se `minLen/maxLen < threshold`, o candidato não pode atingir o threshold. `emailQuotationMatchingService.test.ts` compara o índice com brute force para provar equivalência.

## P1 após fechamento dos P0

### Retenção e índices de telemetria

`api_logs` não deve crescer indefinidamente. Definir política de retenção (ex.: 30–90 dias conforme necessidade de auditoria), índices alinhados às consultas de saúde e exportação de métricas antes do volume tornar a própria observabilidade um gargalo.

### Quarentena IMAP

Mensagens maiores que os limites ou persistentemente malformadas ficam não lidas para evitar perda silenciosa. Isso é correto para integridade, porém pode repetir alertas indefinidamente. Evolução recomendada: tabela de tentativa/quarentena com UIDVALIDITY+UID+Message-ID, contador de falhas, motivo e ação administrativa.

### UIDVALIDITY

A confirmação IMAP usa nova conexão após o commit. Antes de alto volume/alta criticidade, carregar e validar UIDVALIDITY junto com UID evita o caso raro de reset da mailbox fazer um UID antigo apontar para outra mensagem.

### Telemetria distribuída

A fila local + `api_logs` é adequada para a arquitetura atual, mas não substitui tracing/metrics distribuídos em escala multi-host. Evoluir para OpenTelemetry quando houver collector/exportador e necessidade mensurável; não adicionar biblioteca sem backend operacional.

### IA — write amplification

`ai_usage_daily` recebe upsert por chamada. Se throughput de IA crescer, usar agregação/buffer bounded semelhante à fila de telemetria, com flush periódico, para não transformar contabilização em write hotspot.

### Paginação de fontes públicas

Caps atuais são fail-safe e expõem `PARTIAL`, portanto não mentem. Para captura automática em larga escala, substituir caps fixos por jobs retomáveis/checkpoints para consumir todo o universo sem manter uma requisição HTTP aberta indefinidamente.

## Requisitos de ambiente de produção

1. Processo/container deve executar como usuário **não-root** se browser automation estiver habilitada; o renderer seguro recusa Chromium root em vez de usar `--no-sandbox`.
2. Egress de rede deve, idealmente, bloquear RFC1918/link-local/metadata no nível da infraestrutura também. A proteção em código é defesa em profundidade, não substituto para network policy/firewall.
3. Segredos de infraestrutura (`DATABASE_URL`, chave de criptografia, JWT/bootstrap) não devem ser editáveis pela UI.
4. Credenciais operacionais permanecem no store criptografado do S2, com fallback para bootstrap somente quando não existe override.

## Comandos de aceite

```bash
node scripts/verify-integration-platform.mjs
pnpm check
pnpm test
pnpm build
RUN_PUBLIC_SMOKE=1 bash scripts/preflight-integration-platform.sh
```

Nenhum relatório ou status de PR substitui os exit codes desses comandos. O release só deve ser classificado como pronto após resultados verdes e teste em homologação com migração real.
