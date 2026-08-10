# Central de Produtos + Compêndio de Equivalências

## Estado arquitetural

A arquitetura possui duas fronteiras funcionais independentes:

1. **Central de Produtos (`/produtos`)**
   - identidade canônica;
   - ficha técnica e proveniência;
   - ofertas por fornecedor;
   - melhor custo atual;
   - qualidade, saúde e reconciliação;
   - deduplicação com merge reversível;
   - importadores históricos preservados apenas por compatibilidade.

2. **Compêndio de Equivalências (`/equivalencias`)**
   - base multiproduto persistente;
   - critérios técnicos estruturados;
   - produtos equivalentes, alternativos e incompatíveis;
   - decisões humanas persistentes;
   - conhecimento validado reutilizado pela IA;
   - motor determinístico obrigatório antes da IA;
   - fallback sem IA.

A navegação de Produtos foi reduzida a três superfícies operacionais:

- **Catálogo**;
- **Qualidade**;
- **Importação**.

Preço não é um submódulo separado: é uma oferta vinculada à ficha do produto. Ferramentas especializadas de imagem, reclassificação e enriquecimento são acessadas a partir de Qualidade.

As rotas antigas permanecem temporariamente em `/produtos/legado` e `/equivalencias/legado` somente como fallback de rollback. Elas não devem receber novas funcionalidades.

## Fonte de verdade de preço

`product_supplier_offers` é a fonte operacional canônica.

`products.price` permanece apenas como cache de compatibilidade do menor custo efetivo para consumidores antigos.

`product_supplier_prices` permanece temporariamente como ponte de compatibilidade e não deve receber novos consumidores.

As escritas de oferta são transacionais:

1. upsert canônico;
2. atualização da ponte legada;
3. registro de histórico quando o preço efetivamente mudou;
4. recálculo do menor preço dos produtos afetados.

A operação em lote é vetorizada em chunks limitados, evitando executar um fluxo completo de múltiplas queries por item.

## Performance e complexidade

### Listagem do catálogo

A Central não executa mais uma consulta de ofertas por produto.

Fluxo atual:

- consulta paginada de produtos + categoria;
- count em paralelo;
- uma consulta de ofertas para todos os IDs da página;
- agrupamento por `Map` em memória;
- seleção linear da melhor oferta.

Para `N` produtos na página e `M` ofertas correspondentes:

- round-trips de ofertas: **O(1)** por página;
- agrupamento: **O(M)**;
- montagem: **O(N + M)**;
- memória temporária: **O(N + M)**, limitada pela paginação máxima de 200 produtos.

A seleção da melhor oferta é **O(M)** e não depende de sort **O(M log M)**.

### Atualização em massa

Campos de produto são atualizados por operação set-based. Preços/reajustes são agregados e enviados ao provider canônico por lote.

A quantidade de round-trips passa a ser proporcional ao número de chunks, e não ao número de produtos.

## Schema e operação em produção

DDL não é executado dentro de request, boot da aplicação ou timer local.

O processo web apenas verifica se as estruturas obrigatórias existem. Se o schema estiver incompleto, a aplicação retorna erro explícito solicitando a execução das migrações.

Isso evita:

- metadata locks em requests;
- necessidade de privilégios `CREATE`/`ALTER` para o usuário da aplicação;
- corrida entre réplicas horizontais;
- alterações estruturais silenciosas fora do histórico de migrações.

A reconciliação operacional é explícita e data-only por `catalog.repair`:

- cria ofertas canônicas faltantes a partir do legado;
- sincroniza o cache `products.price`;
- normaliza aliases vazios sem sobrescrever informação existente;
- executa health-check depois da correção.

Não existe loop/timer por processo para essa manutenção.

## Migrações

### 0016 — Compêndio e governança do catálogo

`drizzle/0016_product_catalog_compendium.sql` cria:

- `equivalence_compendium_entries`;
- `equivalence_compendium_members`;
- `equivalence_compendium_feedback`;
- `product_field_provenance`;
- `product_merge_events`.

### 0017 — Hardening do catálogo canônico

`drizzle/0017_product_catalog_hardening.sql`:

- torna `products.supplierId` nullable no banco;
- troca a FK para `ON DELETE SET NULL`;
- migra custos legados ainda sem oferta;
- normaliza aliases vazios;
- sincroniza o cache de preço.

Produto passa a existir independentemente de fornecedor. Fornecedor é uma relação comercial representada por oferta.

## Segurança e autorização

As operações canônicas de escrita usam `editorProcedure`:

- criação/edição/desativação/restauração de produto;
- criação/remoção de oferta;
- merge/undo de duplicidade;
- reparo do catálogo.

O router legado `products` é uma fachada de compatibilidade. Suas mutações também foram restringidas a editor.

Exclusão de produto é lógica. Merge não é restauração comum: registros consolidados só podem ser recuperados pelo undo auditado do merge.

## IA do Compêndio

A IA não é apresentada como fine-tuning externo. É um agente especializado com conhecimento persistente e auditável.

Ordem da análise:

1. estruturação da referência;
2. seleção determinística de candidatos;
3. bloqueios críticos de composição/princípio ativo, concentração/unidade, forma e via;
4. consulta às entradas validadas do Compêndio;
5. consulta a precedentes humanos aplicáveis;
6. avaliação da IA;
7. reaplicação da memória humana persistida;
8. ordenação comercial somente entre candidatos tecnicamente admissíveis.

Se a IA estiver indisponível, o fluxo continua pelo motor determinístico + memória humana.

O contrato legado usado pelo editor de propostas não possui mais um segundo algoritmo independente de equivalência: ele delega ao Compêndio e apenas adapta o DTO.

## Deduplicação

O motor usa blocking em vez de comparação quadrática integral:

- EAN/GTIN/barcode;
- registro regulatório;
- CATMAT/CATMAS;
- princípio ativo + concentração;
- blocos de nome somente quando necessário.

A Central usa uma única `reviewQueue` para grupos e métricas, evitando rodar a detecção novamente apenas para compor os cards da tela.

O merge canônico redireciona referências e grava snapshot em `product_merge_events`.

O undo restaura de forma conservadora:

- produtos duplicados;
- referências de propostas;
- histórico de preço;
- grupos de equivalência;
- ofertas;
- memória do Compêndio.

Edições novas realizadas no produto mestre depois do merge não são apagadas pelo undo.

## Validação obrigatória antes do merge

No checkout real do projeto, executar:

```bash
bash scripts/validate-free.sh
pnpm check
pnpm test
pnpm vitest run server/services/equivalenceGuardService.test.ts
```

Com banco de teste/staging:

1. aplicar as migrações até `0017`;
2. abrir `/produtos` e consultar `catalog.health`;
3. exigir `healthy=true` antes de homologação;
4. criar produto sem fornecedor;
5. vincular duas ofertas e confirmar menor custo;
6. editar um único campo e confirmar ausência de perda dos demais;
7. testar busca, paginação e todos os filtros de qualidade;
8. criar, atualizar e remover uma oferta, validando histórico e cache de preço;
9. testar importação com centenas/milhares de ofertas e validar atomicidade;
10. detectar um grupo de duplicatas com dados fictícios;
11. fazer merge e undo;
12. abrir `/equivalencias?productId=<id>`;
13. executar análise com IA ligada e desligada;
14. rejeitar um candidato e confirmar persistência da decisão;
15. validar uma entrada do Compêndio e confirmar reutilização do conhecimento.

## Bloqueador conhecido antes de produção

A migração `0017` define corretamente `products.supplierId` como nullable + `ON DELETE SET NULL`, porém o arquivo gerador `drizzle/schema.ts` ainda declara esse campo como `.notNull()` e `onDelete: "cascade"`.

Esse drift **não deve ser aceito como estado final de produção**, porque uma futura geração de migração pode tentar reverter a regra do banco. Antes do merge/homologação é obrigatório alinhar `drizzle/schema.ts` e executar `pnpm check`, corrigindo consumidores que ainda assumem `supplierId` não nulo.

Enquanto esse item não for resolvido e a suíte não rodar em checkout real, o PR deve permanecer draft.

## Rollback

A implementação preserva rotas e tabelas históricas.

Em regressão de interface:

- Produtos: `/produtos/legado`;
- Equivalências: `/equivalencias/legado`.

A reversão da aplicação não exige apagar as estruturas aditivas do Compêndio. Alterações de schema da migração `0017` devem ser revertidas somente por migração explícita e testada; nunca por DDL ad hoc no processo web.

## Pendências deliberadamente preservadas

Não remover sem validação de dados reais e confirmação de zero consumidores:

- `product_supplier_prices` — ponte temporária;
- `master_products` — ainda participa de reconhecimento/importação históricos;
- rotas e ferramentas históricas de enriquecimento/reclassificação;
- `/produtos/legado` e `/equivalencias/legado` — apenas até a homologação da nova Central.

Depois da homologação, a próxima onda de limpeza deve remover os consumidores remanescentes e então eliminar as estruturas de compatibilidade, em vez de mantê-las indefinidamente.
