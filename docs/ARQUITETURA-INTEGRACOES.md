# Plataforma de Integrações — S2 Licit

> Documento canônico da arquitetura de APIs, fontes públicas, comunicação, IA e automações do S2 Licit.

## 1. Princípio

O S2 Licit permanece um **monólito modular**. Integrações externas compartilham uma plataforma interna única, evitando microserviços, Redis/Kafka ou infraestrutura adicional sem necessidade operacional comprovada.

Fluxo de referência:

```text
IntegrationRegistry
        ↓
CredentialResolver
        ↓
ExternalHttpClient
        ↓
Adapters / Connectors
        ↓
Contract Validation / Normalization
        ↓
Cache + Provenance
        ↓
Domain Services
        ↓
Radar / Funil / Precificação / Propostas / Pós-venda

api_logs + sync_runs + Diagnóstico + S2 Integration Engineer
```

## 2. Configuração e autonomia operacional

### 2.1 Runtime administrável

Credenciais e parâmetros operacionais administráveis ficam na Central de Integrações e são persistidos criptografados no banco. Alterações não escrevem em `process.env` e não exigem editar o repositório nem reiniciar o servidor.

O `CredentialResolver` usa a seguinte precedência:

1. override salvo pela interface;
2. valor do ambiente capturado no boot;
3. default seguro da aplicação, quando existir.

Remover um override restaura imediatamente o valor original da instalação.

### 2.2 Secrets de infraestrutura

Secrets mestres continuam fora da interface e pertencem à infraestrutura:

- `DATABASE_URL`/senha do banco;
- `JWT_SECRET`;
- `ENCRYPTION_KEY`;
- credencial inicial administrativa, quando aplicável.

**Nunca rotacione `ENCRYPTION_KEY` sem procedimento de recriptografia**, pois ela protege credenciais já persistidas.

## 3. Cliente HTTP único

Toda nova integração HTTP deve usar `server/integrations/core/externalHttpClient.ts`.

Políticas centrais:

- timeout;
- retry somente para operações idempotentes;
- respeito a `Retry-After`;
- exponential backoff + jitter;
- circuit breaker por fonte/host;
- limite máximo do corpo da resposta;
- `requestId`/correlation id;
- redaction de credenciais em URL/logs;
- validação JSON/texto;
- registro em `api_logs`.

POSTs com efeito colateral não recebem retry automático por padrão.

## 4. Contratos de integração

Uma fonte nunca deve representar falha como `[]`.

Estados padronizados:

- `SUCCESS` — operação concluída com dados;
- `NO_RESULTS` — operação concluída corretamente, sem registros;
- `PARTIAL` — parte da cobertura funcionou ou foi necessário fallback;
- `UNAVAILABLE` — fonte indisponível;
- `TIMEOUT` — tempo limite;
- `RATE_LIMITED` — limitação de taxa;
- `AUTH_ERROR` — autenticação/autorização;
- `CONTRACT_ERROR` — schema/layout incompatível;
- `CONFIG_ERROR` — configuração local insuficiente.

O Radar deve mostrar `NO_RESULTS` e indisponibilidade de maneira diferente.

## 5. Tipos de fonte

O Registry classifica cada integração por transporte e estabilidade.

Exemplos:

- PNCP / Compras.gov / BrasilAPI: `REST_API`;
- FIEMG e outros murais institucionais: `HTML_SOURCE`;
- portais que exigem renderização: `BROWSER_AUTOMATION`;
- IMAP / SMTP;
- WhatsApp/WEBHOOK;
- Anthropic/Groq/Forge: `LLM`.

Scraping/browser automation é fallback. Sempre preferir API oficial estruturada quando disponível.

## 6. APIs de compras públicas

### PNCP

Adapter oficial para:

- contratações/publicações;
- itens da contratação;
- resultados de itens;
- estatísticas de preços homologados.

Respostas são validadas com Zod antes da normalização.

### Compras.gov.br

A integração usa primeiro a API oficial atual de Dados Abertos. Enquanto necessário, existe fallback legado explícito. Quando o fallback é utilizado, a resposta é `PARTIAL`; nunca é tratada como cobertura normal.

### Fontes institucionais

FIEMG, Compras MG, CEMIG e COPASA possuem URL única configurável em runtime. FIEMG manual e agendada compartilham a mesma URL e o mesmo parser institucional.

FUNDEP/FUNARBE permanecem conectadas ao sincronizador especializado já existente enquanto a persistência é consolidada gradualmente.

## 7. Cache e proveniência

A tabela `integration_cache` armazena respostas públicas idempotentes quando o adapter habilita cache explicitamente.

Campos de proveniência incluem:

- fonte;
- operação;
- `cache_key`;
- URL de origem;
- versão do connector;
- versão de schema;
- status/content-type;
- hash SHA-256 do payload;
- `fetched_at` e `expires_at`.

`stale-if-error` é permitido somente dentro da janela definida pelo adapter. Dado stale deve ser marcado como tal e nunca apresentado como recém-consultado.

## 8. IA

### Gateway

`server/_core/llm.ts` é o gateway único.

- Anthropic usa a Messages API nativa;
- Groq/Forge usam adapters OpenAI-compatible;
- configuração é resolvida em runtime;
- fallback entre provedores ocorre somente após falhas classificadas como transitórias;
- consumo é contabilizado sem impedir a chamada principal.

### S2 Integration Engineer

O copiloto de integrações é especializado por **instruções de domínio + contexto operacional real**, não por fine-tuning de pesos.

Ele recebe:

- Integration Registry;
- health atual;
- latência;
- falhas de 24h;
- falhas recentes;
- tipo/estabilidade da fonte.

Regras obrigatórias incluem não inventar causas, diferenciar zero resultados de indisponibilidade e priorizar P0/P1/P2.

## 9. Scheduler e concorrência

Agendas são recarregáveis em runtime pela Central de Integrações.

Jobs recorrentes usam MySQL `GET_LOCK` na mesma conexão durante a execução. Isso coordena múltiplos processos/replicas sem Redis e libera o lock automaticamente quando a conexão termina.

`sync_runs` funciona como histórico genérico de execução dos jobs, apesar do nome físico legado da tabela.

## 10. Diagnóstico

A tela de Diagnóstico não mede apenas presença de variável.

Estados operacionais:

- `NOT_CONFIGURED`;
- `CONFIGURED`;
- `CONNECTED`;
- `HEALTHY`;
- `DEGRADED`;
- `DOWN`;
- `CONTRACT_DRIFT`.

A classificação utiliza `api_logs`, último sucesso, latência e erros das últimas 24h. O painel também disponibiliza o S2 Integration Engineer.

## 11. Segurança e logging

- valores secretos nunca retornam ao navegador;
- logs passam por redaction;
- payload externo completo não deve ser armazenado em `api_logs`;
- cache não persiste headers/tokens;
- endpoints administrativos permanecem protegidos por RBAC;
- o Radar exige papel `editor` no backend e no frontend.

## 12. Regra para novas integrações

Antes de criar um novo connector:

1. registrar a fonte no `IntegrationRegistry`;
2. definir transporte e estabilidade;
3. usar o `CredentialResolver` para qualquer configuração runtime;
4. usar o `ExternalHttpClient` para HTTP;
5. validar o contrato externo com Zod;
6. retornar status padronizado;
7. adicionar cache somente se o dado for idempotente e a política de frescor estiver definida;
8. garantir observabilidade em `api_logs`/Diagnóstico;
9. adicionar teste de contrato/normalização;
10. evitar criar uma segunda abstração de retry, secrets, health-check ou scheduler.

## 13. GitHub e produção

GitHub é fonte de código, revisão e CI; **não é painel operacional do S2**.

Mudanças de credenciais administráveis, URLs institucionais, cadências e flags de automação devem ocorrer na Central de Integrações. Alteração de código, schema ou secrets mestres de infraestrutura continua seguindo branch/PR/deploy controlado.
