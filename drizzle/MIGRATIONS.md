# Migrações do banco

**Fonte de verdade do schema:** `drizzle/schema.ts`.

## Como funciona (fluxo atual)

- **`drizzle/0000_consolidado_producao.sql` + `drizzle/meta/`**
  Migração consolidada gerada do `schema.ts` (todas as ~109 tabelas).
  É o que o `pnpm db:push` (= `drizzle-kit migrate`) aplica. Num banco novo,
  cria tudo de uma vez; o drizzle registra o que já foi aplicado na tabela
  `__drizzle_migrations` e nunca reaplica.

- **Ao mudar o schema:** edite `drizzle/schema.ts`, rode `pnpm db:generate`
  (gera a próxima migração numerada em `drizzle/`) e **commite** o SQL e a
  pasta `meta/` juntos. Em produção, o boot do container roda
  `pnpm db:push` e aplica só o que falta.

- **Nunca** rode `drizzle-kit generate` em produção/container — geração é
  passo de desenvolvimento; produção só aplica migrações commitadas.

## Pastas históricas (não são aplicadas automaticamente)

- **`drizzle/legacy/`** — as migrações antigas (0000–0020 geradas +
  journal antigo + `0_scraper_tables.sql`). Mantidas só como histórico;
  o consolidado 0000 atual já cobre todo o schema.
- **`drizzle/migrations/`** — migrações escritas à mão (0001–0061) da fase
  em que o journal estava desatualizado. Também cobertas pelo consolidado.
  Úteis apenas para atualizar manualmente um banco antigo pré-consolidação.

## Banco existente de antes da consolidação

Um banco criado pelo fluxo antigo já tem as tabelas, mas não tem o registro
do consolidado no `__drizzle_migrations`. Nesse caso (só uma vez):
aplique manualmente as diferenças que faltarem e insira o registro do
consolidado, ou (mais simples, se os dados forem descartáveis) recrie o
banco e deixe o `pnpm db:push` criar tudo.
