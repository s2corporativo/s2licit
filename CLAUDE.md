# CLAUDE.md

Orientações para o Claude Code neste repositório. Otimizado para execução
rápida: portões proporcionais ao diff, proteções mantidas.

## Verificação — local, proporcional ao diff

O GitHub Actions está indisponível no nível da conta (desde ~22/08); CI
ausente ou `startup_failure` não é sinal em nenhuma direção — não sonde,
registre o estado uma vez e siga. A verificação oficial é local:

| Mudança | Portão antes do push |
|---|---|
| Só documentação/comentários | Nenhum (declare docs-only no PR) |
| Qualquer código | `pnpm check && pnpm test && pnpm build` |
| Tocou `drizzle/` | Acima + integridade do journal (abaixo) |

- **Journal Drizzle**: cada entrada do `_journal.json` com seu `.sql`, sem
  órfãos, `idx` sequencial, timestamps crescentes e únicos. O runner de
  produção (`scripts/migrate-production.mjs`) aplica por hash — migration
  fora do journal simplesmente nunca roda.
- **Evidência no corpo do PR**: resultado portão a portão, commit e branch —
  substitui o verde do CI.
- ~23% da suíte não exercita código de produção: `pnpm test` verde é
  necessário, não suficiente. Para mudança de comportamento, aponte no PR
  qual teste real cobre o fluxo alterado.
- Durante a iteração, rode só o que está depurando; o portão completo roda
  uma vez, antes do push.

## Git/GitHub

- Push só para a branch de trabalho; integração em `main` via PR. Merge de PR
  é sempre decisão humana.
- Exigem confirmação explícita, caso a caso: force em qualquer forma
  (inclusive refspec `+`), refspec de destino (`HEAD:main`), push direto em
  `main`/`master`, `--no-verify`, `git reset --hard`, e `gh api` (a sintaxe
  de leitura também executa escrita — `-X`, mutations — por isso a denylist
  cobre tudo; prefira as ferramentas MCP do GitHub para leitura).
- `gh`: `gh auth status` uma vez no início (não autenticado → pare e
  reporte; nunca `gh auth login`); sempre flags completas, nada interativo;
  leitura em lote numa única chamada GraphQL. Comando travado → interromper
  e reportar, não repetir. Clone de inspeção: `--depth 1`.
- A denylist do `.claude/settings.json` casa por prefixo — é barreira contra
  acidente, não fronteira de segurança. A proteção efetiva da `main` é a
  branch protection do GitHub, aplicada no servidor.
