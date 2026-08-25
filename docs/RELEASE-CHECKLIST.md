# Checklist de homologação S2 Licit

> Enquanto o GitHub Actions estiver indisponível no nível da conta, os dois primeiros itens
> são satisfeitos pela evidência local no corpo do PR (`pnpm check && pnpm test && pnpm build`,
> portão a portão, commit e branch), conforme o CLAUDE.md. Quando a esteira voltar, valem
> literalmente.

- [ ] CI verde (lint, typecheck, testes, build, audit)
- [ ] Security workflow verde
- [ ] migration drift = zero
- [ ] database integrity = healthy
- [ ] smoke autenticado verde
- [ ] SMTP usado apenas para propostas/respostas
- [ ] auto-send de proposta = false
- [ ] auto-match nominal/vetorial não decide item técnico sozinho
- [ ] custo automático possui data/fonte ou revisão humana
- [ ] tributo/frete da operação conferidos
- [ ] backup local e externo testados
- [ ] restore ensaiado
- [ ] deploy não-root por chave SSH
- [ ] aplicação acessível apenas via proxy HTTPS
