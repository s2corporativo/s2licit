# Migrações do banco

Por razões históricas (o projeto foi gerado por IA sem controle), existem
**três conjuntos** de arquivos SQL nesta pasta. Este documento explica o
papel de cada um e o procedimento canônico daqui para frente.

## Os três conjuntos

1. **`drizzle/*.sql` (0000–0020) + `drizzle/meta/_journal.json`**
   Migrações geradas pelo `drizzle-kit`. O `_journal.json` é a fonte de
   verdade para o que o `drizzle-kit migrate` aplica. Corresponde ao schema
   base do projeto.

2. **`drizzle/migrations/*.sql`**
   Migrações **escritas à mão** para tabelas/colunas adicionadas depois
   (numeração 0001–0002 e a partir de 0049). Todas as migrações **novas**
   deste projeto ficam aqui (0054+ em diante: senha local, códigos de
   catálogo, cotações por e-mail, certidões, prazo de resposta).

3. **`drizzle/0_scraper_tables.sql`**
   Script avulso das tabelas do scraper, fora do journal. Aplicado uma vez
   na configuração inicial do scraper.

## Procedimento canônico

- **Banco novo (zero):** rode `pnpm db:push`. O `drizzle-kit` gera/aplica o
  schema a partir de `drizzle/schema.ts` (fonte de verdade do schema atual,
  que já inclui todas as tabelas). As migrações à mão em `drizzle/migrations/`
  são idempotentes (usam `IF NOT EXISTS` / `ADD COLUMN`) e podem ser
  aplicadas por cima sem quebrar.

- **Banco existente:** aplique apenas as migrações à mão novas
  (`drizzle/migrations/00NN_*.sql`) na ordem numérica. Elas são escritas de
  forma defensiva para não falhar se o objeto já existir.

- **Ao adicionar uma tabela/coluna:** edite `drizzle/schema.ts` e crie um
  arquivo `drizzle/migrations/00NN_descricao.sql` com o `ALTER`/`CREATE`
  correspondente (idempotente). Não é necessário mexer no `_journal.json`.

## Observação

Não removemos os arquivos SQL legados porque bancos de produção já podem
tê-los aplicado; apagá-los não desfaz nada no banco e só perde rastreabilidade.
A fonte de verdade do schema é sempre `drizzle/schema.ts`.
