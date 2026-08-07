# CLAUDE.md

Orientações para o Claude Code ao trabalhar neste repositório.

## Diretrizes para operações Git/GitHub

- Antes de qualquer sequência de comandos `gh`, rode `gh auth status` uma única vez no início da tarefa; se retornar não autenticado, pare e reporte ao usuário — nunca tente `gh auth login` de forma autônoma, pois esse comando abre fluxo interativo de navegador e trava a sessão.
- Nunca execute `gh pr create`, `gh issue create` ou comandos `gh` equivalentes sem todas as flags necessárias (`--title`, `--body`, `--base`, `--head` conforme o caso); chamadas sem flags entram em modo interativo de terminal e travam aguardando entrada que não será fornecida.
- Para consultas em lote de múltiplos PRs ou issues, prefira uma única chamada via `gh api graphql` a N chamadas sequenciais de `gh pr view`/`gh issue view`, reduzindo requisições contra o rate limit da API do GitHub.
- Para clonagem apenas de inspeção pontual, sem necessidade de histórico completo, use `git clone --depth 1` em vez de clone completo.
- Se qualquer comando `git` ou `gh` não retornar em tempo razoável, não repita a mesma chamada indefinidamente: interrompa, verifique se há prompt interativo pendente (autenticação, GPG, hook) e reporte a causa provável ao usuário.
- Não use `git commit --no-verify`, `git push --force` ou `git reset --hard` sem confirmação explícita do usuário para aquele comando específico.
