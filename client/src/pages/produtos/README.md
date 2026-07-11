# Módulo Produtos — Scaffolding de Refatoração (FASE 3.4)

Esta pasta contém o scaffolding modular previsto no **Prompt Mestre — FASE 3.4**
para a refatoração de `client/src/pages/Produtos.tsx` (2.999 linhas).

## Objetivo

Extrair de `Produtos.tsx` os seguintes sub-artefatos, preservando
a funcionalidade operacional existente:

### Subcomponentes (`components/`)
- `ProductsPageHeader.tsx` — título, ações globais e breadcrumb.
- `ProductsSummaryCards.tsx` — KPIs e cards de resumo.
- `ProductsFilters.tsx` — filtros avançados, busca, categoria, fornecedor.
- `ProductsBulkActions.tsx` — toolbar de ações em lote (BulkEditPanel atual).
- `ProductsTable.tsx` — tabela virtualizada (usar `react-window` ou `@tanstack/react-virtual`).
- `ProductsDetailPanel.tsx` — painel lateral de detalhes (modal de edição).
- `ProductsQualityBadge.tsx` — indicador de qualidade (já modular em `QualityBadge`).

### Hooks (`hooks/`)
- `useProductsFilters.ts` — estado de filtros e paginação.
- `useProductsSelection.ts` — seleção múltipla e bulk state.
- `useProductsMetrics.ts` — KPIs derivados (evitar cálculo em múltiplas telas).
- `useProductsVirtualization.ts` — integração com `@tanstack/react-virtual`.
- `useDebouncedSearch.ts` — debounce em busca (meta de performance).

## Estratégia Conservadora

A refatoração deve ser feita **incrementalmente**, extraindo um componente
por vez e validando via `pnpm test` e navegação manual em `/produtos`.
O arquivo atual **não deve ser removido até** que todos os consumidores
estejam migrados e cobertos por testes.

## Critérios de Aceitação (FASE 3.4 + FASE 5)

1. Cada subcomponente deve ter máximo de 300 linhas.
2. `Produtos.tsx` final deve ter menos de 500 linhas.
3. Tabela deve suportar virtualização com 10k+ linhas sem lag.
4. Busca deve ter debounce mínimo de 300ms.
5. Re-renderizações desnecessárias eliminadas via `React.memo`, `useMemo`, `useCallback`.
