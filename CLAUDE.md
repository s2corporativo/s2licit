# CLAUDE.md

Orientações para o Claude Code ao trabalhar neste repositório.

## Diretrizes para operações Git/GitHub

- Antes de qualquer sequência de comandos `gh`, rode `gh auth status` uma única vez no início da tarefa; se retornar não autenticado, pare e reporte ao usuário — nunca tente `gh auth login` de forma autônoma, pois esse comando abre fluxo interativo de navegador e trava a sessão.
- Nunca execute `gh pr create`, `gh issue create` ou comandos `gh` equivalentes sem todas as flags necessárias (`--title`, `--body`, `--base`, `--head` conforme o caso); chamadas sem flags entram em modo interativo de terminal e travam aguardando entrada que não será fornecida.
- Para consultas em lote de múltiplos PRs ou issues, uma única chamada via `gh api graphql` é preferível a N chamadas sequenciais de `gh pr view`/`gh issue view`, por reduzir requisições contra o rate limit da API do GitHub; note porém que `gh api` está na denylist e exige confirmação explícita do usuário a cada uso, inclusive para leitura, porque a mesma sintaxe permite escrita (`-X POST/PUT/DELETE`, mutations GraphQL).
- Para clonagem apenas de inspeção pontual, sem necessidade de histórico completo, use `git clone --depth 1` em vez de clone completo.
- Se qualquer comando `git` ou `gh` não retornar em tempo razoável, não repita a mesma chamada indefinidamente: interrompa, verifique se há prompt interativo pendente (autenticação, GPG, hook) e reporte a causa provável ao usuário.
- Não use `git commit --no-verify`, `git push --force` ou `git reset --hard` sem confirmação explícita do usuário para aquele comando específico.
- O push de branch de trabalho é liberado, mas nunca grave direto em branch protegida: um refspec explícito contorna a revisão de PR (`git push origin HEAD:main`) e o prefixo `+` é force-push disfarçado (`git push origin +HEAD:main`). Essas formas estão na denylist, assim como o push direto para `main`/`master`. Da mesma forma, nunca use `gh api` com `-X POST/PUT/DELETE` ou mutations GraphQL sem confirmação: isso dispara workflows via `workflow_dispatch`, altera branch protection e cria recursos públicos sem passar por revisão. Merge de pull request (`gh pr merge`) é sempre decisão humana.
- A denylist do `.claude/settings.json` casa comandos por prefixo, então ela cobre as formas perigosas com o remote `origin`, mas não toda variante possível (por exemplo `git push upstream HEAD:main`). Trate-a como uma barreira contra o acidente, não como fronteira de segurança: a proteção efetiva de `main` são as regras de branch protection do GitHub, aplicadas no servidor.
