# AGENTS.md — S2 Licit

Regras obrigatórias para agentes de IA que alterem este sistema.

## Missão e criticidade

O S2 Licit apoia análise de editais, produtos, fornecedores, formação de preços, propostas e operação de licitações. Cálculos, equivalência técnica, documentos e automações podem produzir efeito comercial relevante; não aceite aproximações silenciosas.

## Antes de alterar

1. Pesquise implementação existente antes de criar rota, serviço, tabela, componente ou integração.
2. Não duplique motores de cálculo, matching, importação, precificação ou integração.
3. Localize consumidores de APIs/tabelas antes de mudar contrato ou schema.
4. Preserve rastreabilidade entre dado original, transformação e resultado calculado.

## Validação mínima

O projeto usa pnpm. Para mudança relevante:

- `pnpm check`
- `pnpm lint`
- `pnpm test`
- `pnpm build`

Correções de bug devem incluir teste de regressão quando tecnicamente possível.

## Regras para licitações e preços

- Nunca inventar preço, fabricante, registro, CATMAT/CATSER, especificação, prazo, condição tributária ou equivalência.
- Informação inferida deve ser identificável como inferência e não como dado oficial.
- Preserve unidade de fornecimento, quantidade, impostos, frete, margem e arredondamento nos cálculos.
- Matching técnico deve manter evidência do texto de origem e dos critérios usados.

## Dados e migrations

- Use o fluxo Drizzle existente (`db:generate`/`db:push`).
- Não alterar migration aplicada para reescrever histórico.
- Mudança destrutiva exige backup verificável, plano de rollback e registro no PR.

## Segurança e integrações

- Segredos e credenciais apenas por secrets/variáveis de ambiente.
- Nunca registrar senha, token, cookie de sessão, conteúdo integral de e-mail ou credenciais de portais.
- Integrações externas devem ter timeout, tratamento de erro e retry controlado quando adequado.
- Não contornar CAPTCHA, MFA ou controles de segurança de terceiros.

## Observabilidade

- O projeto já possui integração Sentry em `server/_core/sentry.ts`; estenda a implementação canônica em vez de criar outra.
- Preserve sanitização de contexto e inicialização condicional por `SENTRY_DSN`.
- Não enviar documentos comerciais sensíveis ou credenciais ao serviço de observabilidade.

## Entrega

Toda alteração deve ocorrer em branch/PR. O PR deve registrar causa, escopo, testes, alterações de dados, riscos de cálculo, integrações afetadas e rollback quando aplicável.
