# Validação e rollout — Plataforma de Integrações

Este checklist é obrigatório antes de promover a refatoração da plataforma de integrações para produção.

## Validação automatizada

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

Os mesmos comandos estão definidos no workflow de CI do PR. Se GitHub Actions estiver indisponível, execute os comandos no checkout do servidor/ambiente de homologação; a aplicação não depende do Actions em runtime.

## Banco

1. criar/aplicar o schema `integration_cache` via Drizzle;
2. confirmar leitura/escrita de `api_logs` e `sync_runs`;
3. confirmar que `ENCRYPTION_KEY` é exatamente a mesma usada antes da implantação;
4. executar backup imediatamente antes da migração.

## Smoke tests por integração

### IA

- salvar override Anthropic e testar;
- restaurar padrão da instalação e testar novamente;
- validar fallback com dois provedores configurados;
- validar uma operação estruturada JSON;
- validar OCR de imagem quando Anthropic estiver ativo.

### E-mail

- testar IMAP;
- alterar `IMAP_MAILBOX` pela interface;
- confirmar que a nova pasta é usada sem restart;
- testar SMTP;
- restaurar padrão da instalação.

### WhatsApp

- testar Meta Cloud API ou webhook configurado;
- confirmar que POST não é repetido automaticamente em falha.

### PNCP

- buscar janela recente;
- abrir itens de uma contratação;
- consultar resultados de item concluído;
- verificar `api_logs` e estado no Diagnóstico.

### Compras.gov.br

- executar consulta na API oficial atual;
- confirmar que fallback legado aparece como `PARTIAL` quando acionado;
- nunca aceitar falha de ambas as APIs como `NO_RESULTS`.

### FIEMG / fontes HTML

- executar Radar manual;
- executar sincronização agendada;
- confirmar mesma URL/parser;
- simular HTML incompatível e confirmar `CONTRACT_DRIFT`/aviso de layout.

## Radar

Cenários obrigatórios:

1. todas as fontes OK com registros;
2. todas as fontes OK e zero registros;
3. uma fonte indisponível e outras OK;
4. uma fonte `PARTIAL`;
5. FIEMG com parser incompatível;
6. usuário abaixo de `editor` tentando acessar endpoint diretamente.

A interface só pode afirmar “nenhuma oportunidade encontrada” no cenário 2.

## Scheduler

- salvar nova expressão cron pela Central de Integrações;
- confirmar recarga sem restart;
- iniciar o mesmo job simultaneamente em dois processos e confirmar que apenas um obtém MySQL `GET_LOCK`;
- confirmar registro em `sync_runs`;
- reiniciar processo durante execução e confirmar que o lock é liberado pelo encerramento da conexão.

## Cache/proveniência

- primeira consulta: origem externa;
- segunda consulta dentro do TTL: cache;
- após TTL com fonte disponível: refresh;
- após TTL com fonte indisponível e dentro do `stale-if-error`: dado stale explicitamente marcado;
- fora da janela stale: falha explícita;
- confirmar `payload_hash`, `source_url`, `fetched_at`, `expires_at` e versão do connector.

## Segurança

- nenhuma resposta administrativa contém segredo em texto;
- `api_logs.raw_sample` não contém Authorization, API key, token, senha ou webhook secreto;
- URL registrada deve ter query secrets redigidos;
- `ENCRYPTION_KEY` e `JWT_SECRET` não podem ser editados na interface;
- usuários sem papel suficiente não acessam rotas administrativas/Radar.

## Critério de promoção

Promover somente quando:

- typecheck, testes e build passarem;
- migrations forem aplicadas em homologação;
- smoke tests P0 (IA, PNCP, Compras.gov, Radar, IMAP/SMTP) passarem;
- nenhuma falha externa estiver sendo convertida em zero resultados;
- backup de pré-migração existir;
- PR tiver revisão humana exigida pela governança do repositório.
