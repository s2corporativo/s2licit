# Plano Técnico de Mitigação — Ressalvas do Módulo 06 (Fornecedores)

**Sistema:** S2 Licít (s2corporativo/s2licit) — backend Fastify/tRPC + Drizzle/MySQL, frontend React
**Base de referência:** homologação do Módulo 06 em 16/08/2026
**Filosofia do plano:** evoluções incrementais, migrations idempotentes e reversíveis, sem quebra dos fluxos existentes (cotações, scraping, propostas), seguindo o padrão `router → schema → service → persistência → auditoria`.

---

## Ressalva 1 — Sanções (inexistente)

### Detalhe técnico

Não existe hoje nenhuma entidade, rota ou tela de sanções no sistema. O código de sanção mais próximo é o campo `status` da tabela de compras (`ativa | encerrada | cancelada | suspensa`), que descreve a compra, não o fornecedor. O ponto de impacto é o fluxo de cotações: a geração do orçamento (`emailQuotationResponseService.ts`) valida itens com `produtoMatchId == null`, mas não consulta nenhum flag de suspensão do fornecedor.

### Estrutura proposta

Nova tabela `supplier_sanctions`:

| Campo | Tipo | Observação |
|---|---|---|
| `id` | int PK | autoincremento |
| `supplierId` | int FK → `suppliers.id` (ON DELETE RESTRICT) | impede exclusão acidental de fornecedor sancionado |
| `orgao` | varchar(256) | órgão sancionador (SEFAZ, TCU, prefeitura etc.) |
| `processo` | varchar(128) | número do processo administrativo |
| `penalidade` | enum `advertencia | multa | impedimento | inidoneidade` | penalidades da Lei 14.133/21, art. 155 |
| `dataInicio / dataFim` | date | vigência da penalidade |
| `referenciaLegal` | varchar(512) | fundamentação (artigo/dispositivo) |
| `observacoes` | text | — |
| `criadoPor` | varchar(256) | rastreabilidade (auditoria) |
| `status` | enum `ativa | revogada | expirada` | controle do ciclo de vida |

### Regra de bloqueio (o ponto de maior valor prático)

No serviço de geração de orçamento, inserir verificação prévia: se o produto vinculado pertence a fornecedor com sanção **ativa e vigente**, o sistema deve **alertar e exigir confirmação expressa do operador** (não bloquear cegamente — a decisão de participar é do cliente). A tela de Fornecedores ganha uma aba "Sanções" e a lista principal exibe selo visual quando houver sanção ativa.

### Plano de ação

1. Migration `0xx_supplier_sanctions.sql` (CREATE TABLE + índices `idx_supplier` e `idx_status_datafim`). **Idempotente** (CREATE TABLE IF NOT EXISTS) e com downgrade (DROP TABLE IF EXISTS, apenas por a tabela estar vazia na implantação).
2. Router `server/routers/sanctions.ts` com `create/update/list/remove` protegido (editorProcedure); service `supplierSanctionService.ts` com função `getActiveSanctions(supplierId)`; registro de auditoria em toda inserção/revogação.
3. Frontend: aba Sanções em `Fornecedores.tsx` + modal de cadastro; ajuste no fluxo de orçamento com aviso confirmável.
4. Backfill: vazio (sistema novo, nenhuma sanção registrada em produção).

**Risco:** baixo. Nova tabela não altera nenhum fluxo existente; o bloqueio de cotação é acréscimo condicional.

---

## Ressalva 2 — Certidões sem vínculo com fornecedor

### Detalhe técnico

A tabela `certidoes` (linha 1604 do schema) é global: `tipo, orgaoEmissor, numero, dataEmissao, dataValidade, arquivoUrl, observacoes, ativa` — sem FK para `suppliers`. O módulo `certidoes.alertas` (alerta de vencimento em 30 dias) funciona hoje como um controle institucional genérico. `operational_certifications` já usa o padrão correto (`entityType="supplier"`, `entityId`), que serve de referência de desenho.

### Estrutura proposta

Adicionar coluna `supplierId int NULL` à tabela `certidoes` (nullable = **retrocompatível**: as certidões institucionais existentes continuam válidas sem fornecedor).

| Mudança | Justificativa |
|---|---|
| `supplierId` nullable + índice `idx_certidoes_supplier` | Vincula CND/CRT à empresa do fornecedor sem quebrar dados existentes |
| View/query `certidoesBySupplier(supplierId)` | Tela exibe certidões do fornecedor com status (válida, vence em 30d, vencida) |
| Reaproveitar `certidoes.alertas` | Mesmo mecanismo de alerta, filtrado por fornecedor |

### Plano de ação

1. Migration `0xx_certidoes_supplier_id.sql` — `ALTER TABLE certidoes ADD COLUMN IF NOT EXISTS supplierId INT NULL`, índice condicional. **Idempotente e reversível** (DROP COLUMN, sem perda pois dados existentes permanecem sem vínculo).
2. Router/service: parâmetro opcional `supplierId` em `certidoes.list`; nova query `certidoes.bySupplier`.
3. Frontend: seção "Regularidade Fiscal" dentro do detalhe do fornecedor (expandir `Fornecedores.tsx` para exibir o painel por fornecedor), com semáforo de validade.
4. Migração de dados: nenhuma (backfill vazio; o usuário cadastra certidões já vinculadas a partir da implantação).

**Risco:** baixo. Coluna nullable não afeta consultas existentes.

---

## Ressalva 3 — Histórico de preços estruturado, não alimentado

### Detalhe técnico

`price_history` e `product_supplier_prices` têm FKs, índices e tipos corretos (`supplierId`, `productId`, preço decimal 12,2, data), mas produção tem **zero registros** nas duas tabelas. Os gatilhos naturais de alimentação já existem no sistema e estão **ativos e gerando dados**: 15 importações de listas de preços em `import_logs` (Tambasa 5, inicial 10) e o scraping de ofertas de fornecedores (`ScraperFornecedores.tsx` + `product_supplier_offers`). Ou seja, os dados de preço **entram** no sistema, mas o pipeline de análise/gravação não grava o histórico por fornecedor.

### Diagnóstico provável

A escrita em `product_supplier_prices` está condicionada a um fluxo que não é disparado nos cenários atuais (análise de preço de cotação salva apenas na proposta; importação de lista atualiza `products` e grava logs). É um gap de **gravação**, não de estrutura.

### Plano de ação

1. **Auditoria do pipeline (etapa 1, sem código):** mapear exatamente onde cada entrada de preço termina hoje — importação de lista (`importLogs` service), scraping (`supplierSessionService`/`tambasaCatalogService`), cotação recebida (`emailQuotationResponseService`) e proposta. Identificar o ponto de inserção único recomendado (ideal: uma função `recordSupplierPrice(productId, supplierId, price, source)` chamada de todos os gatilhos).
2. **Correção (etapa 2):** inserir a chamada única nos 3-4 gatilhos confirmados, com `INSERT ... ON DUPLICATE KEY UPDATE` na `product_supplier_prices` (unique `productId+supplierId` já existe) e append em `price_history`.
3. **Backfill (etapa 3):** script pontual que lê o preço atual dos produtos vinculados a fornecedores e grava o primeiro registro de histórico (snapshots de hoje = linha de base), executado **uma única vez**, com transação e rollback documentado.
4. **Indicador:** contagem mensal de registros por tabela monitorável no dashboard existente.

**Risco:** baixo-médio. Etapa 1 é puramente diagnóstica; a etapa 2 exige cuidado para não duplicar gravações (por isso a função única centralizada).

---

## Ressalva 4 — Participação em licitações indireta

### Detalhe técnico

Hoje o vínculo fornecedor-licitação ocorre por dois caminhos frágeis: `products.supplierId` (o produto que venceu a licitação "empresta" o fornecedor) e `proposal_items.supplierName` como **texto livre** (sem FK — risco de divergência de nomenclatura e sem rastreabilidade). Não existe entidade de participação com lances e resultado.

### Estrutura proposta (evolução maior — fazer por último)

Nova tabela `supplier_participations`:

| Campo | Tipo | Observação |
|---|---|---|
| `id` | int PK | — |
| `proposalId` | int FK → `proposals.id` | a proposta no certame |
| `supplierId` | int FK → `suppliers.id` | fornecedor formalizado |
| `licitacaoId` | int FK → `licitacoes.id` (nullable) | certame quando houver |
| `resultado` | enum `em_disputa | vencedor | derrotado | desistente` | — |
| `valorLance` | decimal(14,2) | valor ofertado |
| `observacoes` | text | — |

### Plano de ação

1. **Curto prazo (sem nova tabela):** normalizar `supplierName` → substituir por FK `supplierId` em `proposal_items` (coluna nova nullable, migração de dados cruzando nome→fornecedor existente). Resolve 80% do problema de rastreabilidade sem mudar a arquitetura.
2. **Médio prazo:** criar `supplier_participations` e alimentar a partir das propostas já existentes (backfill baseado no vencedor por item).
3. **Frontend:** painel do fornecedor com histórico de participações, taxa de vitória e valor total ganho — base natural para o relatório de desempenho por fornecedor.

**Risco:** médio (é a mudança mais invasiva). Sequenciar após as ressalvas 1-3 e testar com carga real de propostas antes do deploy.

---

## Sequenciamento e esforço estimado

| Ordem | Ressalva | Esforço | Dependência | Impacto imediato |
|---|---|---|---|---|
| 1 | Sanções (R1) | Baixo (~1-2 dias) | Nenhuma | Bloqueio/alerta de fornecedores suspensos nas cotações |
| 2 | Certidões por fornecedor (R2) | Baixo (~1 dia) | Nenhuma | Painel de regularidade fiscal por fornecedor |
| 3 | Histórico de preços (R3) | Médio (~2 dias) | Diagnóstico do pipeline | Histórico real começa a ser alimentado |
| 4 | Participação formal (R4) | Médio-alto (~3-5 dias) | R3 (mesma disciplina de dados) | Rastreabilidade completa fornecedor-licitação |

**Critérios comuns de implantação (todos os itens):** branch + PR com gates (`tsc`, `vitest`, `build`, `lint`); migration idempotente com rollback documentado; backup do banco antes do deploy; testes unitários cobrindo as novas rotas; registro de auditoria nas operações sensíveis; rollback reversível na VPS via `S2_IMAGE` da tag anterior.

**Recomendação prática:** iniciar pela **Ressalva 1 (Sanções)** — é a de maior risco jurídico para o escritório (participar de licitação com fornecedor suspenso pode gerar responsabilização) e a de menor custo de implantação. Posso executar imediatamente após sua autorização.
