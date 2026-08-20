# Revisão final — S2 Licit — 19/08/2026

## Escopo revisado

- Dashboard moderno e fila operacional.
- Catálogo moderno e enriquecimento/classificação por IA.
- Cotações por exceção, memória de match, ranking de fornecedores, proteção comercial e feedback humano.
- Inteligência Comercial: radar de preços, equivalentes, duplicidades, assistente de compra, timeline e margem inteligente.
- Comando global do Assistente S2.
- CI, deploy e smoke autenticado de produção.

## Achados corrigidos nesta revisão

1. O smoke pós-deploy não incluía as rotas novas `/inteligencia` e `/agente`.
2. A rota `duplicates.mergeDuplicates` utilizava uma implementação antiga que apenas desativava o duplicado e não redirecionava todas as referências comerciais.
3. As mutações de mesclar/substituir/marcar exceção de duplicidade aceitavam qualquer usuário autenticado.
4. A trilha específica dessas decisões de duplicidade não era registrada nessa rota.

## Correção

- Smoke passa a cobrir `/inteligencia` e `/agente` além das rotas críticas já existentes.
- Merge/substituição passam a usar `mergeProductGroup`, o mecanismo transacional canônico que preserva/redireciona propostas, equivalências, ofertas e histórico de preço.
- Mutações de duplicidade passam a exigir `editorProcedure`.
- Merge, substituição e exceção passam a registrar auditoria.

## Critério de publicação

Somente integrar ao `main` se CI (lint, typecheck, testes e build) concluir com sucesso. Após merge, aguardar o workflow `Deploy VPS` e exigir `production-smoke: success` no commit final.

## Pendências externas que não devem ser confundidas com código incompleto

- Certificação real de credenciais/layouts de portais de terceiros e fornecedores depende das contas e dos sites externos.
- PRs antigos divergentes não devem ser mesclados em bloco; funcionalidades úteis devem ser reaplicadas sobre o `main` corrente e validadas pelo CI.
