# Política de migrations

1. Arquivo de migration já aplicado é imutável.
2. Qualquer correção gera novo arquivo e nova entrada no journal.
3. `check-migration-drift.mjs` roda antes da migration de produção.
4. `MIGRATION_STRICT=true` é obrigatório em produção.
5. Alteração de schema durante o boot da aplicação não é fonte de verdade; deve ser removida/migrada para SQL versionado.
