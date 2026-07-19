## Objetivo

Descreva o problema operacional ou técnico que este PR resolve.

## Risco e compatibilidade

- [ ] Não apaga dados existentes.
- [ ] Mantém rotas/contratos antigos por redirecionamento ou compatibilidade transitória.
- [ ] Migrações são idempotentes ou exercitadas no MySQL real da CI.
- [ ] Operações multi-tabela são transacionais.

## Validação

- [ ] `pnpm check`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Migrações MySQL
- [ ] Smoke de produção, quando aplicável

## Evidências

Inclua logs, capturas, resultado dos testes e plano de rollback.
