# Central de Produtos + Compêndio de Equivalências

## Estado arquitetural

Esta implementação cria duas fronteiras funcionais independentes:

1. **Central de Produtos (`/produtos`)**
   - identidade canônica do produto;
   - ficha técnica e proveniência;
   - ofertas por fornecedor;
   - melhor custo atual;
   - qualidade e reconciliação;
   - deduplicação com merge reversível;
   - importadores antigos preservados por compatibilidade.

2. **Compêndio de Equivalências (`/equivalencias`)**
   - base multiproduto persistente;
   - critérios técnicos estruturados;
   - produtos equivalentes/alternativos/incompatíveis;
   - decisões humanas persistentes;
   - conhecimento validado reutilizado pela IA;
   - motor determinístico obrigatório antes da IA;
   - fallback sem IA.

Rotas antigas permanecem temporariamente em `/produtos/legado` e `/equivalencias/legado`.

## Fonte de verdade de preço

`product_supplier_offers` é a fonte operacional canônica.

`products.price` permanece apenas como espelho do menor custo efetivo para consumidores legados. A manutenção local reconcilia esse espelho automaticamente.

`product_supplier_prices` permanece temporariamente como ponte de compatibilidade. Não deve receber novos consumidores.

## Autonomia operacional

O sistema não depende de GitHub Actions, cron do SO ou ação humana para a manutenção diária do catálogo.

Ao iniciar a aplicação:

- o timer de manutenção local é iniciado;
- no primeiro uso de `catalog`/`equivalenceCompendium`, o schema auxiliar é garantido com `CREATE TABLE IF NOT EXISTS`;
- o catálogo legado é reconciliado;
- ofertas ausentes são criadas a partir do legado;
- aliases EAN/GTIN/barcode são normalizados sem sobrescrever dados existentes;
- a FK `products.supplierId` é migrada para nullable + `ON DELETE SET NULL` quando o banco permite DDL;
- o menor preço canônico é espelhado para consumidores legados.

Variáveis opcionais:

- `CATALOG_MAINTENANCE_ENABLED=false` desativa o loop autônomo;
- `CATALOG_MAINTENANCE_INTERVAL_MS=<ms>` altera o intervalo (mínimo 60 s; padrão 5 min).

## IA do Compêndio

A IA não é um fine-tuning externo. É um agente especializado com conhecimento persistente e auditável.

Ordem da análise:

1. estruturação da referência;
2. seleção determinística de candidatos;
3. bloqueios críticos (composição/princípio ativo, concentração/unidade, forma crítica, via);
4. consulta às entradas validadas do Compêndio;
5. consulta a precedentes humanos aplicáveis;
6. avaliação da IA;
7. reaplicação da memória humana persistida;
8. ordenação comercial somente entre candidatos tecnicamente admissíveis.

Se a IA estiver indisponível, o fluxo continua pelo motor determinístico + memória humana.

## Deduplicação

O motor usa blocking em vez de comparação O(n²) completa:

- EAN/GTIN/barcode;
- registro regulatório;
- CATMAT/CATMAS;
- princípio ativo + concentração;
- blocos de nome somente quando necessário.

O merge canônico redireciona referências e registra um snapshot em `product_merge_events`.

O undo restaura de forma conservadora:

- produtos duplicados;
- referências de propostas;
- histórico de preço;
- grupos de equivalência;
- ofertas;
- memória do Compêndio.

Edições novas feitas no produto mestre depois do merge não são apagadas pelo undo.

## Migração 0016

`drizzle/0016_product_catalog_compendium.sql` cria, de forma aditiva:

- `equivalence_compendium_entries`;
- `equivalence_compendium_members`;
- `equivalence_compendium_feedback`;
- `product_field_provenance`;
- `product_merge_events`.

As mesmas estruturas são garantidas em runtime como segunda camada de segurança.

## Validação obrigatória antes do merge

No checkout real do projeto, executar:

```bash
bash scripts/validate-free.sh
```

Além disso, executar especificamente:

```bash
pnpm check
pnpm test
pnpm vitest run server/services/equivalenceGuardService.test.ts
```

Com banco de teste/staging, depois de subir a aplicação:

1. abrir `/produtos` e consultar `catalog.health`;
2. confirmar `healthy=true` ou usar `catalog.repair` e repetir;
3. criar produto sem fornecedor;
4. vincular duas ofertas e confirmar menor custo;
5. editar somente um campo e confirmar que os demais permanecem intactos;
6. pesquisar incompletos e conferir contagem server-side;
7. detectar um grupo de duplicatas em dados fictícios;
8. fazer merge e undo do merge;
9. abrir `/equivalencias?productId=<id>`;
10. executar análise com IA ligada e desligada;
11. rejeitar um candidato e confirmar que a rejeição persiste na análise seguinte;
12. validar uma entrada do Compêndio e confirmar que ela aparece em `compendiumKnowledgeCount`.

## Rollback

A implementação preserva rotas legadas e não remove tabelas históricas.

Em caso de regressão de interface:

- Produtos: usar `/produtos/legado`;
- Equivalências: usar `/equivalencias/legado`.

Em caso de problema na manutenção automática:

```env
CATALOG_MAINTENANCE_ENABLED=false
```

As tabelas novas são aditivas e não precisam ser removidas para retornar às rotas antigas.

## Pendências deliberadamente preservadas

Não remover nesta mesma onda, sem validar dados reais de produção:

- `product_supplier_prices` (ponte de compatibilidade);
- `master_products` (ainda participa de fluxos antigos de reconhecimento/importação);
- ferramentas históricas de reclassificação/enriquecimento, embora tenham saído da navegação principal.

A remoção física dessas estruturas deve ocorrer somente depois de confirmar zero consumidores e migração integral dos dados em produção.
