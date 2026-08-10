# S2 Licit — Plataforma de Integrações

Este é o documento canônico da arquitetura introduzida pela branch `refactor/integration-platform`.

## Objetivo

Transformar APIs, fontes públicas, e-mail, WhatsApp, provedores de IA e automações em uma camada única, resiliente e observável, reduzindo dependência operacional de GitHub/redeploy.

## Arquitetura

```text
IntegrationRegistry
        ↓
CredentialResolver
        ↓
ExternalHttpClient
        ↓
Adapter / Connector
        ↓
Zod Contract Validation
        ↓
Normalization
        ↓
Cache + Provenance
        ↓
Domain Services
        ↓
Radar / Funil / Precificação / Propostas / Pós-venda

api_logs + sync_runs → Diagnóstico → S2 Integration Engineer
```

## Regras obrigatórias

1. Nenhuma integração HTTP nova pode criar outro cliente de retry/timeout.
2. Nenhum serviço de negócio pode alterar `process.env` em runtime.
3. Falha externa jamais pode ser representada como `[]`/zero resultados.
4. Resposta externa deve ser validada antes de virar modelo de domínio.
5. Retry automático só é permitido para operação idempotente e erro transitório.
6. POST com efeito colateral não recebe retry automático por padrão.
7. Credenciais nunca são retornadas ao navegador nem persistidas em logs.
8. HTML/browser automation é fallback; API oficial estruturada é preferencial.
9. Mudança de schema/layout é `CONTRACT_ERROR`/`CONTRACT_DRIFT`, não “nenhum resultado”.
10. Configuração operacional deve ser alterável na Central de Integrações sempre que não for secret mestre de infraestrutura.

## Configuração runtime

O `CredentialResolver` combina:

1. override criptografado salvo pela interface;
2. ambiente imutável capturado no boot;
3. default seguro da aplicação, quando houver.

Remover um override restaura o valor da instalação sem restart.

Administrável pela interface:

- Anthropic/Groq/Forge;
- IMAP/SMTP;
- WhatsApp;
- URLs institucionais de FIEMG, Compras MG, CEMIG e COPASA;
- agenda/habilitação de e-mail, alertas, scrapers, radar e backup;
- retenção de backup;
- cotação auxiliar USD/BRL.

Permanecem na infraestrutura:

- `DATABASE_URL`/credencial do banco;
- `JWT_SECRET`;
- `ENCRYPTION_KEY`;
- credenciais de bootstrap estritamente necessárias.

Não rotacionar `ENCRYPTION_KEY` sem recriptografar os valores existentes.

## Contrato de resultado

Estados padronizados:

- `SUCCESS`
- `NO_RESULTS`
- `PARTIAL`
- `UNAVAILABLE`
- `TIMEOUT`
- `RATE_LIMITED`
- `AUTH_ERROR`
- `CONTRACT_ERROR`
- `CONFIG_ERROR`

A UI deve tratar `NO_RESULTS` como consulta válida e todos os estados de degradação como cobertura potencialmente incompleta.

## HTTP externo

`ExternalHttpClient` centraliza:

- timeout;
- retry idempotente;
- `Retry-After`;
- exponential backoff + jitter;
- circuit breaker;
- limite de payload;
- content-type/JSON validation;
- request/correlation id;
- redaction;
- `api_logs`;
- identidade `S2Licit`.

## Fontes públicas

### PNCP

- publicações/contratações;
- itens;
- resultados dos itens;
- estatística de preços homologados.

### Compras.gov.br

Usa a API oficial atual de Dados Abertos. O endpoint legado existe apenas como fallback transitório e, quando usado, a cobertura é marcada `PARTIAL`.

### FIEMG / Sistema S

Radar manual e sincronização agendada compartilham URL e parser. Mudança de layout deve aparecer como `CONTRACT_DRIFT`.

### Outros portais

Compras MG, CEMIG e COPASA compartilham configuração runtime. FUNDEP/FUNARBE preservam o sincronizador especializado existente até a consolidação final da persistência.

## IA

`server/_core/llm.ts` é o gateway único:

- Anthropic: Messages API nativa;
- Groq/Forge: adapters OpenAI-compatible;
- seleção/configuração em runtime;
- fallback entre provedores após erros transitórios;
- telemetria de consumo.

### S2 Integration Engineer

A IA de integrações é especializada por instruções de domínio + contexto operacional real. Ela não é apresentada como fine-tuning de pesos.

Recebe registry, health, latência, erros de 24h e falhas recentes. Deve:

- não inventar causas;
- diferenciar `NO_RESULTS` de outage;
- classificar contract drift;
- tratar rate limit corretamente;
- proteger secrets;
- priorizar P0/P1/P2;
- preferir ações executáveis dentro do S2.

## Scheduler

Agendas são recarregáveis pela Central de Integrações sem restart.

Jobs usam MySQL advisory locks (`GET_LOCK`) na mesma conexão até o final da execução. Isso coordena processos/replicas sem Redis/Kafka. O MySQL libera o lock quando a conexão morre.

`sync_runs` é reutilizada como histórico genérico de execução.

## Cache/proveniência

`integration_cache` armazena somente respostas públicas/idempotentes quando o adapter habilita política explícita.

Proveniência:

- source;
- operation;
- cache key;
- source URL;
- connector/schema version;
- payload SHA-256;
- fetched/expires timestamps.

`stale-if-error` é permitido em janela limitada e o dado deve permanecer marcado como stale.

## Diagnóstico

Estados:

- `NOT_CONFIGURED`
- `CONFIGURED`
- `CONNECTED`
- `HEALTHY`
- `DEGRADED`
- `DOWN`
- `CONTRACT_DRIFT`

Derivados de configuração efetiva + `api_logs`, último sucesso, latência e erros recentes.

## GitHub

GitHub continua sendo fonte de código, revisão e CI. Não é painel operacional.

Credenciais administráveis, URLs institucionais, cron e flags de automação são runtime do S2. Código, schema e secrets mestres continuam sujeitos a branch/PR/deploy controlado.

## Validação

Consulte `docs/VALIDACAO-INTEGRACOES.md` e rode:

```bash
node scripts/verify-integration-platform.mjs
pnpm check
pnpm test
pnpm build
```

Nenhuma promoção para produção deve ocorrer sem backup, migration em homologação e smoke tests das fontes críticas.
