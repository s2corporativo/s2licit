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

- Push só para a branch de trabalho; integração em `main` via PR.
- **Autorização permanente do usuário (01/09/2026)**: para as solicitações que
  ELE faz nos chats, o Claude Code está autorizado a mergear o PR na `main`
  assim que todos os portões passarem, sem pedir confirmação a cada vez — o
  pedido no chat já é a decisão humana de merge. Em seguida o deploy é
  automático (ver seção Deploy). Isso vale em toda sessão do Claude Code.
  Fora desse escopo — PRs de terceiros, ou PRs que o próprio autor marcou como
  "não mesclar"/bloqueado — o merge continua decisão humana caso a caso.
  Mesmo com a autorização, o Claude nunca faz push direto em `main` nem força
  merge sem os portões verdes; a integração é sempre via PR revisado.
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

## Deploy em produção

- Produção: VPS `root@13.140.167.153` → https://s2.s2corporativo.com.br
  (app em `/opt/s2licit`; mecânica em `scripts/vps-deploy-approved.sh`).
- Fluxo definido pelo usuário (01/09/2026): o que ele solicita no chat deve
  chegar em produção. Quando ele pede uma mudança, esse pedido já é a decisão
  humana de merge para o PR correspondente — depois de todos os portões
  passarem, o merge na `main` conclui a entrega. O deploy a partir daí é
  automático: o timer `s2licit-deploy-approved.timer` na VPS roda a cada
  ~5 min e publica o último SHA da `main` aprovado pelo Woodpecker
  (idempotente, backup pré-deploy, rollback automático).
- Sessões do Claude Code na web NÃO alcançam a porta 22 (rede só HTTPS via
  proxy) — não tente SSH; o caminho de publicação é o merge na `main`.
  Deploy manual imediato (humano, na VPS):
  `systemctl start s2licit-deploy-approved.service`.
- Verificação pós-deploy sem SSH: `https://s2.s2corporativo.com.br/readyz` e
  o badge `https://ci.depaulateixeira.adv.br/api/badges/3/status.svg`.
