# Capture Core — arquitetura e operação

O Capture Core é o pipeline canônico de captura e atualização de ofertas de fornecedores do S2 Licit.

Ele substitui a execução direta do scraper legado por uma fila persistente, auditável e conservadora. GitHub não participa da operação do módulo: depois do deploy, jobs, locks, heartbeat, retry, observações, revisão e memória da IA ficam na aplicação/MySQL.

## Fluxo canônico

```text
Fornecedor
  ↓
Connector / BrowserCaptureEngine
  ↓
capture_jobs
  ↓
Captura bruta + observações
  ↓
Normalização / deduplicação
  ↓
Matching determinístico
  ↓
IA somente em ambiguidade
  ↓
Quality / price gates
  ↓
Oferta segura OU revisão humana
  ↓
Histórico + feedback supervisionado
```

Nenhum conector deve escrever diretamente em `products` ou `product_supplier_offers`.

## Modos

### `full`

Varredura integral quando o conector possui catálogo homologado.

- usa baseline histórico;
- captura muito abaixo do baseline entra em quarentena;
- ausência de item em um full scan não desativa produto automaticamente;
- Tambasa descobre categorias dentro da mesma sessão autenticada usada na captura.

### `refresh`

Atualização incremental de ofertas conhecidas.

- prioriza SKU do fornecedor e nome de produto já vinculado;
- indicada para conectores search-only;
- não usa o baseline de catálogo integral para quarentena.

### `search`

Busca seletiva por termo, SKU ou EAN.

- exige `searchUrlTemplate`;
- possui prioridade maior nos fluxos de proposta/editais;
- zero resultados não significa catálogo quebrado.

## Capacidades dos conectores

As capacidades são calculadas a partir de preset + configuração efetiva.

- `fullCatalog`: permite varredura integral;
- `search`: permite busca/refresh;
- `method`: `api`, `http`, `browser` ou `hybrid`;
- `structuredData`: permite aproveitar dados estruturados;
- `authenticated`: exige seletores mínimos de login.

Bartofil e Basso Pancotte são tratados como search/refresh enquanto não houver catálogo integral homologado.

## Identidade e matching

Ordem de decisão:

1. EAN/GTIN único e exato;
2. SKU único já vinculado ao mesmo fornecedor;
3. correspondência humana supervisionada reutilizável;
4. nome + apresentação;
5. IA para desempate de candidatos limitados;
6. revisão humana.

Regras fail-closed:

- EAN duplicado no catálogo bloqueia matching automático;
- SKU duplicado no mesmo fornecedor bloqueia matching automático;
- conflito de EAN bloqueia aplicação;
- apresentação/quantidade incompatível bloqueia aplicação;
- a IA nunca cria identidade nem escolhe IDs fora dos candidatos fornecidos pelo backend.

## Ofertas e estado temporal

Preço, estoque, promoção e disponibilidade representam a observação atual.

Regra principal:

> não observado agora = desconhecido agora

Portanto:

- estoque ausente → `null`;
- disponibilidade ausente → `desconhecido`;
- promoção ausente → `null`;
- SKU, link e imagem podem ser preservados como metadados de identidade.

Isso vale tanto para atualização automática quanto para aprovação humana.

## Anomalia de preço

Valores padrão:

- variação absoluta >= 60% → revisão;
- variação absoluta >= 300% → bloqueio;
- preço nulo, zero, negativo ou não numérico → bloqueio.

Configuração:

```env
CAPTURE_REVIEW_PRICE_CHANGE=0.60
CAPTURE_BLOCK_PRICE_CHANGE=3.00
```

## Quality gates

Para `full`:

- zero produtos → quarentena;
- cobertura abaixo de 50% do baseline → quarentena;
- cobertura entre 50% e 75% → atenção;
- warnings reduzem score.

Para `search` e `refresh`, ausência de resultado não provoca quarentena estrutural do catálogo.

## Fila e workers

`capture_jobs` é a fonte de verdade.

Estados principais:

```text
queued → running → success | partial | quarantine | failed
```

Também existe `cancelled` para compatibilidade/futuro controle operacional.

O runner:

- faz claim condicional no MySQL;
- limita concorrência por processo;
- registra `workerId`;
- atualiza heartbeat;
- recupera leases stale;
- aplica retry exponencial limitado para falhas transitórias;
- não usa memória local como fonte de verdade.

`activeKey` + constraint única/triggers da migration 0016 garantem no banco apenas um job `queued/running` por configuração.

## Agendamento

`nextRunAt` é a fonte persistente do agendamento.

Timezone operacional:

```text
America/Sao_Paulo
```

O cron apenas identifica configurações vencidas e enfileira. A execução do navegador pertence ao CaptureRunner.

Quando um `full` genérico é solicitado para um conector search-only, `enqueueCaptureJob` degrada de forma explícita para `refresh`.

## BrowserCaptureEngine

Responsabilidades:

- abrir/fechar Chromium;
- autenticar;
- reutilizar sessão;
- detectar CAPTCHA/MFA sem bypass;
- navegar com proteção SSRF;
- extrair DOM/dados estruturados;
- expor a página autenticada para probes do próprio portal.

O engine não conhece `products`, ofertas ou matching.

## Segurança de rede

Toda entrada server-side deve passar pelas proteções comuns:

- apenas HTTP/HTTPS;
- credenciais embutidas em URL bloqueadas;
- loopback/private/link-local/CGNAT/reservados bloqueados;
- DNS validado antes da navegação;
- respostas DNS mistas com qualquer IP privado são rejeitadas;
- redirects são revalidados;
- fetch HTTP tem timeout, redirects limitados e body bounded;
- logs textuais passam por redaction de tokens/credenciais.

## Probe JSON/XHR

Em conectores híbridos, a página autenticada pode observar respostas XHR/fetch que ela própria recebeu.

O probe:

- não inventa endpoints;
- não dispara requests adicionais;
- aceita apenas hosts permitidos;
- limita tamanho, profundidade, nós e produtos;
- sanitiza query strings sensíveis;
- prioriza dados estruturados/API sobre DOM na deduplicação.

## Sessões

O cookie jar v2 preserva metadados úteis de cookies e continua compatível com o formato legado nome→valor.

Metadados depreciados/não suportados pelo `CookieParam` atual podem ser armazenados, mas não são reenviados ao navegador.

As sessões ficam criptografadas pelo serviço de sessão do fornecedor.

## IA de captura

A IA atua somente em ambiguidade.

Ela recebe:

- produto observado;
- poucos candidatos já selecionados pelo backend;
- regras conservadoras;
- exemplos supervisionados de `capture_ai_feedback`.

A memória supervisionada é reutilizável e auditável. Não é fine-tuning de pesos do modelo.

Se o orçamento de chamadas for atingido ou a IA falhar, o item segue para revisão humana.

## Revisão humana

Observações `create`, `review` e `blocked` aparecem na fila.

A decisão é transacional e usa locks de banco.

Aprovação:

- revalida produto ativo;
- revalida EAN;
- revalida apresentação;
- atualiza oferta;
- pode criar produto novo apenas após decisão humana e com EAN válido;
- grava feedback supervisionado.

Rejeição não altera catálogo/oferta.

## Exclusão de configuração

Configuração sem histórico pode ser removida.

Se já houver `capture_jobs` ou `scraper_logs`, a ação de excluir vira arquivamento lógico:

- `enabled=no`;
- ToS desmarcado;
- `nextRunAt=null`;
- histórico preservado.

## Principais variáveis

Ver `.env.example` para a lista completa. As principais são:

```env
CAPTURE_WORKERS=2
CAPTURE_JOB_POLL_MS=5000
CAPTURE_HEARTBEAT_MS=30000
CAPTURE_RECOVERY_MS=300000
CAPTURE_STALE_MINUTES=15
CAPTURE_CLAIM_CONTENTION_RETRIES=4
CAPTURE_REFRESH_LIMIT=250
CAPTURE_ITEM_WRITE_CONCURRENCY=3
CAPTURE_MAX_WRITE_FAILURE_RATIO=0.10
CAPTURE_MAX_FUZZY_CANDIDATES=500
CAPTURE_AI_MAX_CALLS_PER_MINUTE=20
CAPTURE_AI_MEMORY_LIMIT=2000
CAPTURE_AI_EXAMPLE_LIMIT=12
CAPTURE_FULL_MIN_COVERAGE=0.50
CAPTURE_FULL_WARN_COVERAGE=0.75
```

## UI

Caminho canônico administrativo:

```text
/captura-core
```

A tela reúne:

- saúde dos conectores;
- fila de revisão;
- refresh prioritário;
- cadastro de conectores.

`/scraper-fornecedores` permanece como fachada/configuração técnica durante a transição.

## Checklist antes de produção

O módulo não deve ser promovido apenas por revisão estática.

Antes do merge/deploy, concluir:

1. gerar `drizzle/meta/0016_snapshot.json` com a versão de `drizzle-kit` do projeto;
2. executar `pnpm check`;
3. executar `pnpm test`;
4. executar `pnpm build`;
5. aplicar a migration 0016 em MySQL/MariaDB limpo/de teste;
6. validar constraint/triggers de `activeKey`;
7. smoke autenticado de Tambasa;
8. smoke de um conector search-only/híbrido;
9. confirmar criação/recovery/retry de job;
10. confirmar que uma observação ambígua não altera catálogo antes de revisão.

Enquanto esses gates não estiverem comprovados, o PR deve permanecer draft.
