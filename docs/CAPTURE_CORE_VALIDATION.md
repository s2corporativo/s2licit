# Capture Core — runbook de validação

Este documento define o gate executável oficial do Capture Core antes de retirar o PR de draft ou promover o módulo.

## Comando único

Na VPS, dentro do checkout da branch do PR:

```bash
git checkout feat/capture-core-autonomo
git pull --ff-only origin feat/capture-core-autonomo
bash scripts/validate-capture-core.sh
```

O comando **não executa deploy**.

Ele encadeia, em ordem:

1. `scripts/generate-capture-core-snapshot.sh`;
2. `scripts/validate-free.sh`;
3. `scripts/smoke-capture-connectors.sh`.

Qualquer etapa com exit code diferente de zero bloqueia o gate inteiro.

## Etapa 1 — snapshot Drizzle reproduzível

`generate-capture-core-snapshot.sh` usa o `drizzle-kit` travado no próprio projeto dentro de Docker isolado.

O helper:

- parte do `0015_snapshot.json`;
- remove a entrada/migration 0016 somente dentro do container temporário;
- gera novamente a migration 0016 a partir dos schemas reais;
- valida `dialect`, `version` e `prevId`;
- exige as cinco tabelas do Capture Core;
- falha se o `drizzle-kit` detectar mutação em qualquer tabela fora do Capture Core;
- falha em operações destrutivas inesperadas;
- copia para o checkout real somente `drizzle/meta/0016_snapshot.json`.

O SQL manual e o `_journal.json` reais não são sobrescritos.

## Etapa 2 — qualidade, build e MySQL isolado

`validate-free.sh` executa:

- TypeScript (`pnpm check`);
- ESLint;
- Vitest;
- build frontend/backend;
- build da imagem Docker de produção;
- MySQL 8 temporário;
- migrations em duas passagens;
- inspeção das tabelas/índices/constraints/triggers do Capture Core;
- testes `*.integration-db.test.ts`.

O teste de integração do Capture Core comprova no MySQL real que:

- `queued`/`running` recebem `activeKey` derivado;
- um segundo job ativo da mesma configuração recebe `ER_DUP_ENTRY`;
- estados terminais liberam `activeKey`;
- um novo job pode ser criado depois da liberação.

## Etapa 3 — smoke autenticado bounded

`smoke-capture-connectors.sh` constrói uma imagem efêmera da **branch em validação** e a conecta à mesma rede Docker da aplicação já publicada.

Ele não reinicia nem substitui o container de produção.

O wrapper:

- lê `DATABASE_URL` e a chave de criptografia do container atual sem imprimi-las;
- grava os valores em env-file temporário com permissão restrita;
- executa Chromium da imagem de validação;
- apaga env-file e imagem temporária ao terminar.

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

O smoke reduz deliberadamente o escopo do navegador neste processo:

- `SCRAPER_MAX_PAGES <= 2`;
- `TAMBASA_MAX_CATEGORIES <= 3`;
- `CAPTURE_REFRESH_LIMIT <= 5`.

Ele valida autenticação, extração, preço positivo, nome válido e capacidade de busca/full declarada.

O smoke **não chama matching, offer service, review service nem grava produtos/ofertas**. A autenticação pode renovar a sessão criptografada do fornecedor, que é estado operacional esperado.

## Resultado esperado

Ao final, o script imprime:

```text
CAPTURE CORE VALIDADO COM SUCESSO
Nenhum deploy foi executado.
```

Se o snapshot tiver sido gerado localmente, `git status` continuará mostrando o arquivo até ele ser versionado.

## Critérios para retirar o PR de draft

Todos devem estar comprovados:

1. `0016_snapshot.json` gerado pelo helper e versionado;
2. `validate-free.sh` integralmente verde;
3. migration 0016 aplicada duas vezes no MySQL temporário sem erro;
4. invariantes `activeKey` verdes;
5. smoke Tambasa verde;
6. smoke search-only/híbrido verde;
7. nenhuma mutação de catálogo ocorreu durante o smoke;
8. branch continua mergeable e sem drift relevante da `main`.

Somente depois desses critérios o PR deve ser reavaliado para sair de draft. Merge e deploy continuam sujeitos à governança humana do repositório.
