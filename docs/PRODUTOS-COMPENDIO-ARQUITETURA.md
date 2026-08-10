# Central de Produtos + Compêndio de Equivalências

## Arquitetura-alvo

O domínio foi reduzido a duas fronteiras:

### Central de Produtos (`/produtos`)

Responsável por:

- identidade canônica do produto;
- ficha técnica e proveniência;
- ofertas por fornecedor;
- melhor custo vigente;
- qualidade e saúde do catálogo;
- importação;
- deduplicação com merge reversível.

A interface possui somente três superfícies operacionais:

1. **Catálogo**;
2. **Qualidade**;
3. **Importação**.

Preço não é módulo separado. É atributo de uma oferta `Produto × Fornecedor`.

### Compêndio de Equivalências (`/equivalencias`)

Responsável por:

- equivalência técnica multiproduto;
- entradas e membros persistentes;
- bloqueios determinísticos de incompatibilidade;
- decisões humanas persistentes;
- conhecimento validado reutilizado pela IA;
- fallback sem IA.

Produtos não contém mais um segundo motor independente de equivalência.

## Modelo canônico

```text
Produto
  ├─ identidade
  ├─ ficha técnica
  ├─ categoria
  ├─ proveniência
  └─ Ofertas
       ├─ Fornecedor A → preço / código / link
       ├─ Fornecedor B → preço / código / link
       └─ Fornecedor C → preço / código / link
```

A identidade do produto é **global**. Fornecedor não participa da resolução de identidade.

Isso significa que a importação do mesmo item por fornecedores diferentes deve localizar o mesmo produto mestre e criar/atualizar ofertas distintas, em vez de criar produtos duplicados.

## Fonte de verdade comercial

`product_supplier_offers` é a fonte canônica.

`products.price` e `products.supplierId` são somente um **cache de compatibilidade** para consumidores históricos:

- `products.price` = menor custo efetivo atual;
- `products.supplierId` = fornecedor daquela mesma melhor oferta.

Os dois campos devem sempre representar a mesma oferta. Se não existir oferta com preço válido, ambos ficam `NULL`.

Relações Produto × Fornecedor sem preço continuam preservadas em `product_supplier_offers`.

`product_supplier_prices` permanece temporariamente como ponte de escrita/leitura para consumidores antigos. Não deve receber novos consumidores.

## Escrita de ofertas

A escrita canônica é transacional:

1. upsert em `product_supplier_offers`;
2. atualização da ponte `product_supplier_prices`;
3. histórico quando o preço realmente mudou;
4. recálculo do cache de compatibilidade do produto.

Escritas em lote são deduplicadas por `(productId, supplierId)` e executadas em chunks limitados.

## Importação simplificada

`/importar` é o fluxo principal e possui quatro passos:

1. arquivo;
2. mapeamento;
3. revisão;
4. resultado.

Fornecedor é opcional. Um produto mestre pode ser importado sem fornecedor.

Se uma coluna de preço for mapeada sem fornecedor, o preço é ignorado porque preço pertence à oferta e não ao produto mestre.

A importação canônica faz somente:

1. resolução global da identidade;
2. criação do produto quando não há identidade compatível;
3. preenchimento apenas de campos técnicos vazios do produto existente;
4. criação/atualização da oferta quando existe fornecedor;
5. encaminhamento de casos ambíguos para revisão, sem merge automático.

Ela **não** executa classificação por IA, geração de equivalências ou enriquecimento oculto. Esses processos pertencem aos respectivos módulos especializados.

`/importar/legado` preserva temporariamente o fluxo histórico para rollback durante homologação.

## Performance

### Central

A listagem canônica utiliza:

- consulta paginada de produtos;
- count em paralelo;
- uma consulta de ofertas para todos os produtos da página;
- agrupamento O(M) em memória;
- seleção linear da melhor oferta.

A página é limitada a 200 produtos, evitando N+1 e crescimento de memória sem limite.

### Ofertas em lote

`batchUpsertSupplierPrices`:

- normaliza e deduplica pares em memória;
- consulta preços anteriores em lote;
- executa upsert canônico em chunks;
- registra histórico em lote;
- recalcula os caches dos produtos afetados de forma set-based.

### Análise e busca

Os fluxos de análise de preço, busca inteligente, autocomplete, sugestões para propostas e similares históricos foram migrados para a melhor oferta canônica em vez de depender do antigo “fornecedor do produto”.

## Qualidade e health-check

`catalog.health` verifica:

- disponibilidade do banco;
- quantidade de produtos ativos;
- quantidade de ofertas canônicas;
- fornecedor legado sem oferta correspondente;
- divergência entre `products.price` e a melhor oferta;
- divergência entre `products.supplierId` e o fornecedor da melhor oferta;
- existência da FK de fornecedor;
- `ON DELETE SET NULL`;
- nullabilidade de `products.supplierId`;
- estado do Compêndio;
- merges ativos.

`catalog.repair` é explícito e data-only. Ele:

- cria ofertas faltantes a partir da ponte legada ainda visível;
- sincroniza preço e fornecedor da melhor oferta;
- normaliza aliases vazios;
- executa health-check novamente.

Não existe DDL em request, boot ou timer por processo.

## Migrações

### 0016 — Compêndio e governança

Cria:

- `equivalence_compendium_entries`;
- `equivalence_compendium_members`;
- `equivalence_compendium_feedback`;
- `product_field_provenance`;
- `product_merge_events`.

### 0017 — Hardening do catálogo

A migration:

- descobre dinamicamente o nome da FK histórica de `products.supplierId`;
- remove a FK antiga sem depender de nome fixo;
- torna `supplierId` nullable;
- cria FK `ON DELETE SET NULL`;
- preserva toda relação histórica Produto × Fornecedor em `product_supplier_offers`, inclusive sem preço;
- normaliza aliases vazios;
- sincroniza `products.price` e `products.supplierId` com a mesma melhor oferta.

## Contrato de schema

O banco definido pela `0017` exige:

```ts
supplierId: int("supplierId")
  .references(() => suppliers.id, { onDelete: "set null" })
```

O arquivo monolítico `drizzle/schema.ts` ainda precisa receber essa alteração no checkout real.

Para impedir que uma futura geração de migration use silenciosamente o contrato antigo, foi adicionado:

```bash
node scripts/check-product-schema-contract.mjs
```

O comando falha se o schema continuar `.notNull()` + `CASCADE`.

A correção segura no checkout é:

```bash
node scripts/check-product-schema-contract.mjs --fix
git diff -- drizzle/schema.ts
```

O modo `--fix` só altera o arquivo quando encontra **exatamente um** bloco legado conhecido. Se o padrão estiver ausente, duplicado ou diferente, ele aborta sem alteração.

`Dockerfile.validate` executa a verificação antes de TypeScript, lint, testes e build.

## Segurança

Escritas canônicas e mutações da fachada legada usam `editorProcedure`.

Produto usa soft-delete.

Produto consolidado por merge não pode ser restaurado por edição comum; somente pelo undo auditado do evento de merge.

Importação não sobrescreve dados técnicos já preenchidos e não promove correspondência ambígua automaticamente.

## IA do Compêndio

A IA é um agente especializado e grounded no conhecimento persistente do sistema, não um fine-tuning externo alegado sem evidência.

Ordem de decisão:

1. estruturação da referência;
2. seleção determinística;
3. hard guards técnicos;
4. conhecimento humano validado;
5. precedentes aplicáveis;
6. IA;
7. reaplicação de memória humana;
8. ordenação comercial somente entre candidatos admissíveis.

Divergência crítica de composição/princípio ativo, concentração/unidade, forma ou via não pode ser promovida pela IA.

## Deduplicação

A identidade e a deduplicação priorizam:

- EAN/GTIN/barcode;
- registro regulatório;
- CATMAT/CATMAS;
- score técnico multi-campo.

A busca de identidade não é filtrada por fornecedor.

A Central usa uma fila de grupos e métricas derivada da mesma execução do detector.

Merge é transacional e registra snapshot em `product_merge_events`. Undo restaura de forma conservadora produtos, referências, histórico, ofertas e memória do Compêndio.

## Validação obrigatória

No checkout real:

```bash
node scripts/check-product-schema-contract.mjs --fix
git diff -- drizzle/schema.ts
bash scripts/validate-free.sh
pnpm check
pnpm test
pnpm vitest run server/services/equivalenceGuardService.test.ts
```

Em staging:

1. aplicar migrations até `0017`;
2. abrir `/produtos` e exigir `catalog.health.healthy=true`;
3. criar produto sem fornecedor;
4. criar produto com fornecedor sem preço e confirmar relação em ofertas;
5. adicionar duas ofertas com preços diferentes e confirmar que cache de preço e fornecedor apontam para a mesma melhor oferta;
6. remover a melhor oferta e confirmar promoção automática da segunda;
7. importar planilha sem fornecedor;
8. importar a mesma identidade com dois fornecedores diferentes e confirmar um produto mestre com duas ofertas;
9. importar linha sem preço sobre oferta existente e confirmar preservação do preço anterior;
10. importar dados técnicos adicionais e confirmar preenchimento somente de campos vazios;
11. testar filtros de qualidade;
12. executar `catalog.repair` e exigir health saudável;
13. fazer merge/undo de duplicidade com dados fictícios;
14. executar Compêndio com IA ligada e desligada;
15. validar persistência de rejeição/aprovação humana.

## Estado para merge

O PR deve permanecer draft enquanto:

- `drizzle/schema.ts` não estiver alinhado pelo patch seguro;
- a validação executável acima não tiver sido concluída;
- o smoke test de staging não estiver aprovado.

Não é necessário remover tabelas históricas nesta onda.

## Rollback

Durante homologação:

- Produtos legado: `/produtos/legado`;
- Importador legado: `/importar/legado`;
- Equivalências legado: `/equivalencias/legado`.

A reversão de schema deve ocorrer somente por migration explícita e testada, nunca por DDL ad hoc no processo web.

## Limpeza futura

Após homologação e confirmação de zero consumidores:

- remover `product_supplier_prices`;
- retirar caches comerciais de `products` ou mantê-los apenas se houver benefício mensurável;
- consolidar/remover `master_products` após migrar todos os importadores antigos;
- remover rotas legadas;
- remover ferramentas históricas que tenham substituto canônico e nenhum consumidor.
