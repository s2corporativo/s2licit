# Relatório de Diagnóstico e Recuperação — Sistema S2 Licít

**Data:** 15/08/2026 · **Repositório:** `s2corporativo/s2licit` (branch `main`, commit `04654e6`) · **Autor:** Manus AI

---

## 1. Diagnóstico

### 1.1 O que foi constatado na produção (medição direta)

O domínio `s2.s2corporativo.com.br` (IP `13.140.167.153`, certificação TLS válida até 12/10/2026) **responde, mas de forma severamente degradada**. Medições repetidas no momento da análise:

| Endpoint | Comportamento observado | Esperado |
|---|---|---|
| `/healthz` (sem banco) | 15,7s / 9,0s / 12,4s / 3,4s / timeout 20s | < 100 ms |
| `/readyz` (SELECT 1 no banco) | 10,7s na 1ª tentativa; timeouts subsequentes | < 200 ms |
| `/` (interface web) | Timeout em todas as tentativas | < 2 s |
| `/api/trpc/*` (API) | Respostas em 9–20 s, frequentes travamentos | < 1 s |

O processo do Node **não está morto** (o uptime reportado foi de ~9.700 s, ou seja, o container subiu há cerca de 2h40), mas o *event loop* está saturado: até uma rota que não consulta banco demora 17 segundos para devolver um JSON de 39 bytes. É exatamente esse quadro que gera o relato de que "a API não está funcionando, nada está funcionando": as requisições do navegador e dos robôs internos expiram antes de concluir, e os jobs agendados (leitura de e-mails, radar de portais, scrapers, pipeline de propostas) não avançam.

### 1.2 Achado decisivo: o pipeline de deploy está parado desde 18/07

A análise do histórico de workflows do GitHub Actions revelou que o **último deploy de sucesso na produção foi em 18/07/2026** (`run 29664285005`). Os dois únicos disparos posteriores do workflow "Deploy VPS" (10/08 e 12/08, manuais) terminaram em `startup_failure` com duração de 1 segundo — o runner auto-hospedado na VPS (`self-hosted, s2licit, contabo`) não foi alocado. Além disso, **100% dos últimos 60 runs de todos os workflows do repositório encerram em `startup_failure` com 0s de duração**, e a issue `#94` do próprio repositório ("infra: GitHub Actions encerra com startup_failure antes dos jobs") descreve exatamente o mesmo bloqueio, já reportado desde 10/08/2026.

Consequências diretas:

| Falha relatada | Causa raiz mapeada |
|---|---|
| "Só recebo e-mail dizendo que o sistema está fora do ar" | O relatório diário das 7h e os alertas de falha (`notifyJobFailure`, `runDailyAlerts`) são as únicas funções que ainda executam — eles disparam justamente porque os demais jobs falham, confirmando a falha em vez de resolvê-la. |
| "Não está lendo os e-mails que solicito" | O sincronizador IMAP (`emailQuotationSyncService`, a cada 15 min) depende do banco e do event loop, ambos saturados; a fila não processa. |
| "Não está buscando propostas" | O radar de portais (3x/dia), os scrapers e o pipeline de propostas ficam bloqueados nos mesmos gargalos. |
| Sistema instável como um todo | O processo em produção está degradado há dias e, pelo gap de deploy, **a versão em produção é anterior a 18/07** — sem os correções já mergadas na `main` (fim da saturação do pool MySQL na reindexação RAG, correção do worker `reindexAll` que processava apenas 1 produto, seletores de login dos portais). |

### 1.3 Correções já na `main` que precisam chegar à produção

Os commits `687e611` (fim da saturação do pool MySQL na reindexação de embeddings) e `f0bc14c` (worker do `reindexAll` que saía após processar 1 produto) tratam exatamente do tipo de degradação medida em produção. Como a `main` tem esses fixes mas a produção não, o redeploy é o caminho de correção primário — depois de confirmado que o código atual é íntegro (ver seção 2).

### 1.4 Hipóteses complementares (a confirmar na VPS, com seu acesso)

Primeiro, o estado da VPS Contabo (memória e disco), pois a reindexação RAG em CPU e o Chromium dos scrapers consomem recursos pesados e a `main` anterior tinha o bug de pool MySQL. Segundo, o estado do runner auto-hospedado de GitHub Actions dentro da própria VPS — se ele está down, o ciclo de deploy não volta sozinho. Terceiro, a configuração `.env` da produção (IMAP/SMTP/IA), que não é versionada e portanto não posso verificar daqui; a sincronização de e-mails só opera com `IMAP_HOST`, `IMAP_USER` e `IMAP_PASSWORD` preenchidos, e o envio com `SMTP_HOST`, `SMTP_USER` e `SMTP_PASSWORD`.

---

## 2. Integridade do código atual (validação local completa)

A branch `main` atual foi validada de ponta a ponta neste ambiente isolado, e o resultado é o seguinte:

| Gate | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `tsc --noEmit` (typecheck) | OK — sem erros |
| `pnpm run build` (vite + esbuild) | OK — `dist/index.js` gerado |
| `vitest run` (suíte completa) | OK — **728 testes aprovados** (84 arquivos), 2 ignorados |
| `pnpm run lint` | **FALHOU** com 5 erros menores |

Os 5 erros de lint foram identificados, corrigidos e revalidados (ver seção 3). Após as correções: **lint OK, typecheck OK, build OK e vitest 728/730 verde** — a `main` está tecnicamente íntegra e pronta para redeploy.

---

## 3. Correções aplicadas e enviadas ao repositório

Apenas três arquivos foram alterados, todos sem qualquer mudança funcional (higiene de código exigida pelo padrão de qualidade do projeto). As alterações foram commitadas na branch `fix/lint-higiene-20260815` e publicadas no GitHub, aguardando sua avaliação para merge.

| Arquivo | Correção |
|---|---|
| `server/rag/indexer.ts` | Remoção dos imports não usados `desc` e `lte` (drizzle-orm) e `DEFAULT_EMBEDDING_MODEL` (embedding) |
| `server/rag/ragConfig.ts` | Remoção do import não usado `eq` (drizzle-orm) |
| `client/src/pages/Produtos.tsx` | Remoção do comentário `eslint-disable-next-line react-hooks/exhaustive-deps` — a regra referenciada não está instalada no projeto e o `useEffect` já lista todas as dependências relevantes |

Nenhuma regra de negócio, rota, endpoint ou lógica de e-mail/cotação foi tocada. O merge é decisão sua: a branch está em `fix/lint-higiene-20260815` e pode ser revisada e mesclada pela interface do GitHub ([criar PR](https://github.com/s2corporativo/s2licit/pull/new/fix/lint-higiene-20260815)).

---

## 4. Roteiro de recuperação (ordem recomendada)

**Passo 1 — Desbloquear o GitHub Actions (causa-raiz do ciclo).** A issue `#94` indica limitação na conta/organização (billing, planos ou restrição de Actions), não defeito de workflow. Verificar em `github.com → Settings → Actions/Billing` se há cota ou restrição ativa, e reativar. Enquanto estiver bloqueado, **nenhum deploy automático volta a funcionar**, e a CI não valida mais nada — o que torna o sistema cada vez mais difícil de manter com segurança.

**Passo 2 — Redeploy manual de emergência (independente do GitHub).** O guia `DEPLOY-CONTABO.md` documenta o caminho manual: conectar via SSH na VPS, entrar em `/opt/s2licit`, `git pull`, `scripts/vps-bootstrap.sh` (que instala, migra e sobe os containers), validando ao final com `curl http://127.0.0.1:3000/readyz` e depois `curl -fsS https://s2.s2corporativo.com.br/readyz`. Este é o atalho que resolve o sintoma imediatamente, pois a `main` atual (com os fixes do pool MySQL e do worker RAG) foi validada integralmente. Antes de subir, rodar `./scripts/backup.sh` na VPS (backup do banco).

**Passo 3 — Confirmar a configuração de e-mail na VPS.** Com o sistema redeployado, verificar se `IMAP_HOST/IMAP_USER/IMAP_PASSWORD` e `SMTP_HOST/SMTP_USER/SMTP_PASSWORD` estão preenchidos no `.env` da VPS — sem eles, a leitura e o envio de e-mails ficam desabilitados por desenho, e o relatório diário será o único e-mail que chega. Não é necessário me informar os valores (regra de segurança): apenas confirme se as seis variáveis existem e apontam para o provedor correto.

**Passo 4 — Verificar o runner auto-hospedado.** Se o Actions voltar a funcionar mas o deploy continuar em `startup_failure`, o runner dentro da VPS (`s2licit, contabo`) precisa ser reiniciado (o serviço systemd na VPS Contabo).

---

## 5. Riscos e ressalvas

A latência medida em produção é um sintoma; as causas prováveis foram ordenadas por evidência, mas a confirmação definitiva requer acesso à VPS (memória, disco, logs dos containers), que por regra de segurança não deve ser feito sem sua autorização explícita. Não foi feito qualquer alteração em produção — todas as modificações limitam-se à branch de higiene publicada, e a validação completa foi executada apenas no ambiente isolado. A issue `#107` (P0 — operações em massa do módulo Produtos, aberta em 13/08) permanece aberta e é independente deste diagnóstico. A reativação do monitor `uptime-monitor.yml` (pausado em 12/08) deve ocorrer somente após o Actions voltar, sob pena de gerar runs falsos.

---

## 6. Checklist de fechamento

| Item | Status |
|---|---|
| Diagnóstico da produção medido com dados reais | Concluído |
| Causa-raiz do bloqueio de deploys identificada | Concluído (Actions `startup_failure` desde 10/08) |
| Last deploy com sucesso identificado | 18/07/2026 |
| Gates locais (install, typecheck, build, 728 testes, lint) | Verdes |
| Correções de higiene publicadas em branch | `fix/lint-higiene-20260815` |
| Merge na `main` | **Aguardando sua decisão** |
| Redeploy em produção | **Aguardando sua autorização** (SSH na VPS ou desbloqueio do Actions) |
| Confirmação das variáveis IMAP/SMTP na VPS | **Aguardando sua confirmação** |
