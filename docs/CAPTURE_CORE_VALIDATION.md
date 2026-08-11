# Capture Core — runbook de validação

Este documento define o gate executável oficial do Capture Core antes de retirar o PR de draft ou promover o módulo.

## Comando único

Na VPS, dentro do checkout limpo da branch do PR:

```bash
git checkout feat/capture-core-autonomo
git pull --ff-only origin feat/capture-core-autonomo
bash scripts/validate-capture-core.sh
```

O comando **não executa merge permanente, push nem deploy**.

## O que é validado

O gate não testa apenas o HEAD isolado da feature. Antes dos testes ele:

1. executa `git fetch --prune origin main`;
2. registra o SHA atual da feature e o SHA mais recente de `origin/main`;
3. cria um `git worktree` temporário e detached a partir da feature;
4. aplica `git merge --no-commit --no-ff <origin/main>` somente nesse worktree;
5. falha imediatamente se houver conflito ou arquivo não resolvido;
6. executa todos os gates sobre esse **merge candidate exato**;
7. destrói o worktree ao final.

Assim, se a `main` avançar enquanto o PR estiver em desenvolvimento, o resultado continua representando o código que efetivamente chegaria ao merge, sem alterar o histórico da branch e sem tomar a decisão humana de merge.

O checkout real deve estar limpo. A única alteração local tolerada na entrada é `drizzle/meta/0016_snapshot.json`, porque ela pode ter sido gerada por uma execução anterior do próprio gate.

## Sequência interna

No merge candidate temporário, o comando encadeia:

1. `scripts/generate-capture-core-snapshot.sh`;
2. `scripts/validate-free.sh`;
3. `scripts/smoke-capture-connectors.sh`.

Qualquer exit code diferente de zero bloqueia o gate inteiro. O snapshot só é copiado de volta ao checkout real depois que **todos** os gates passam.

## Etapa 1 — snapshot Drizzle reproduzível

`generate-capture-core-snapshot.sh` usa o `drizzle-kit` travado no próprio projeto dentro de Docker isolado.

O helper:

- parte do `0015_snapshot.json`;
- remove a entrada/migration 0016 somente dentro do container temporário;
- gera novamente a migration 0016 a partir dos schemas reais do merge candidate;
- valida `dialect`, `version` e `prevId`;
- exige as cinco tabelas do Capture Core;
- falha se o `drizzle-kit` detectar mutação em qualquer tabela fora do Capture Core;
- falha em operações destrutivas inesperadas;
- preserva o SQL manual e o `_journal.json` reais.

As tabelas esperadas são:

```text
capture_jobs
supplier_product_observations
capture_job_events
capture_ai_feedback
capture_connector_health
```

## Etapa 2 — qualidade, build e MySQL isolado

`validate-free.sh` executa:

- TypeScript (`pnpm check`);
- ESLint;
- todos os testes Vitest;
- build frontend/backend;
- build da imagem Docker de produção;
- MySQL 8 temporário e isolado;
- migrations em duas passagens;
- inspeção das tabelas, índices, constraints e triggers do Capture Core;
- testes `*.integration-db.test.ts`.

O teste `captureCore.integration-db.test.ts` comprova funcionalmente no MySQL que:

- `queued` e `running` recebem `activeKey` derivado do `scraperConfigId`;
- um segundo job ativo da mesma configuração é rejeitado com `ER_DUP_ENTRY`;
- estados terminais liberam o `activeKey`;
- outro job pode ser criado depois da liberação.

## Etapa 3 — smoke autenticado bounded

`smoke-capture-connectors.sh` constrói uma imagem efêmera do **merge candidate** e a conecta à mesma rede Docker da aplicação publicada.

Ele não reinicia, substitui ou reconstrói o container de produção.

O wrapper:

- identifica a rede Docker da aplicação atual;
- obtém `DATABASE_URL` e as chaves necessárias sem imprimi-las;
- suporta valores diretos e `DATABASE_URL_FILE`, `ENCRYPTION_KEY_FILE` e `JWT_SECRET_FILE`;
- lê arquivos de segredo somente dentro do container atual;
- rejeita valores multilinha antes de criar o env-file;
- cria env-file temporário com `umask 077`;
- executa Chromium da imagem de validação;
- remove env-file e imagem temporária no cleanup.

O runner TypeScript auto-descobre:

- uma configuração Tambasa ativa e com ToS aprovado;
- um conector search-only/híbrido ativo e com busca homologada;
- um SKU conhecido do próprio fornecedor para semear a busca.

Overrides opcionais para diagnóstico:

```env
CAPTURE_SMOKE_TAMBASA_CONFIG_ID=
CAPTURE_SMOKE_SEARCH_CONFIG_ID=
CAPTURE_SMOKE_SEARCH_QUERY=
```

O smoke restringe deliberadamente o trabalho desse processo:

```text
SCRAPER_MAX_PAGES <= 2
TAMBASA_MAX_CATEGORIES <= 3
CAPTURE_REFRESH_LIMIT <= 5
```

Ele valida:

- autenticação ou reutilização válida da sessão;
- capacidade `full` da Tambasa;
- capacidade de busca do segundo conector;
- extração de pelo menos um produto;
- nome válido;
- preço numérico positivo;
- execução do navegador real da branch candidata.

O smoke **não chama matching, `captureOfferService`, `captureReviewService` nem grava `products` ou `product_supplier_offers`**. A autenticação pode renovar a sessão criptografada do fornecedor, que é estado operacional esperado.

## Resultado esperado

Em sucesso integral, o gate imprime algo equivalente a:

```text
CAPTURE CORE VALIDADO COM SUCESSO
Merge candidate: <feature-sha> + main <main-sha>
Nenhum merge, push ou deploy foi executado.
```

Somente depois dos três gates verdes, o `0016_snapshot.json` gerado no worktree é copiado para o checkout real. Se ele diferir do arquivo versionado, `git status` continuará indicando a alteração para revisão e commit humano/assistido na branch.

## Falhas e interpretação

### Conflito com `main`

O gate termina antes de TypeScript/build. O conflito deve ser resolvido na feature e o gate repetido.

### Snapshot/schema drift

A geração falha se `drizzle-kit` tentar alterar schema antigo ou produzir operação destrutiva inesperada. Não editar o snapshot manualmente para contornar o gate.

### TypeScript/lint/test/build

Corrigir a causa no código e repetir o comando completo. Não promover com etapa parcialmente verde.

### Migration/MySQL

Falha de migration, trigger, unique constraint ou teste de integração bloqueia o PR.

### Smoke de conector

Falha pode indicar credencial expirada, mudança de portal, CAPTCHA/MFA, seletor quebrado, problema de rede ou ausência de configuração homologada. CAPTCHA/MFA não deve ser contornado.

## Critérios para retirar o PR de draft

Todos devem estar comprovados:

1. merge candidate com a `origin/main` mais recente sem conflito;
2. `0016_snapshot.json` gerado pelo helper e versionado;
3. TypeScript, lint, Vitest e build integralmente verdes;
4. imagem de produção construída;
5. migration 0016 validada no MySQL temporário;
6. duas passagens do migrator concluídas;
7. invariantes `activeKey` verdes;
8. smoke Tambasa verde;
9. smoke search-only/híbrido verde;
10. nenhuma mutação de catálogo/oferta ocorreu pelo smoke;
11. PR continua mergeable.

Somente depois desses critérios o PR deve ser reavaliado para sair de draft. Merge e deploy continuam sujeitos à governança humana do repositório.
