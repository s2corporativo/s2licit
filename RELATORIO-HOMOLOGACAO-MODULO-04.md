# Relatório de Homologação — Módulo 04: RBAC e Perfis Públicos

**Sistema:** S2 Licít (s2corporativo/s2licit) — VPS Contabo (13.140.167.153)
**Data de execução:** 16/08/2026 (janela de 10:30 a 13:45, horário de Brasília)
**Status do módulo:** **HOMOLOGADO COM CORREÇÕES APLICADAS**
**Comité de homologação:** Manus AI, sob protocolo PROMPT 00 de auditoria sequencial

---

## 1. Objetivo e escopo

Este módulo audita a matriz de controle de acesso por papéis (RBAC) do S2 Licít, cobrindo a hierarquia de perfis (usuário, visualizador, editor, administrador), a proteção dos endpoints sensíveis (propostas, editais, contratos, documentos e fases de licitação) e o bloqueio real de acessos indevidos por perfil, com prova de execução em produção. O escopo foi executado integralmente, incluindo a correção de duas falhas encontradas: uma violação funcional de RBAC em produção e a causa da saturação recorrente do servidor, diretamente ligada ao relato de "sistema fora do ar".

## 2. Matriz de permissões mapeada

O backend implementa a hierarquia de papéis no arquivo `server/_core/trpc.ts` por meio de três procedimentos protegidos distintos, todos aplicados em nível de servidor (independentemente do frontend). A matriz verificada no código-fonte da branch principal (main, commit `8c56b3c`) é a seguinte.

| Procedimento tRPC | Perfil mínimo exigido | Uso observado |
|---|---|---|
| `publicProcedure` | Nenhum (público) | Login, endpoints de saúde (`/healthz`, `/readyz`), sistema público |
| `protectedProcedure` | Qualquer usuário autenticado para leitura; **Editor** para mutações | Consultas gerais, criação de propostas, pedidos de compra |
| `editorProcedure` | **Editor** | Exclusão de categorias e demais operações editoriais |
| `adminProcedure` | **Administrador** | Gestão de usuários e configurações administrativas |

A trava central, denominada `requireUser`, aplica a regra `rank < ROLE_RANK.editor` em qualquer mutação executada por usuário abaixo do perfil Editor, retornando erro `-32003 FORBIDDEN` com a mensagem "Operações de alteração exigem perfil Editor ou superior". No frontend, o componente `RequireAuth` e o utilitário `hasMinimumRole` replicam a hierarquia para fins de exibição, sem substituir a validação de backend. Todos os logins são registrados na trilha de auditoria (`audit_logs`), incluindo o perfil do usuário que acessou.

A suíte de testes do repositório contém uma seção dedicada (`trpc.rbac.test`) com 19 testes de autorização, todos aprovados na execução completa de 728 testes.

## 3. Falhas encontradas e corrigidas

### 3.1. Produção rodava bundle antigo sem a trava efetiva

Durante os testes, um usuário de auditoria de perfil **visualizador** criado no banco (id 1457/1461/1462, removidos ao final de cada ciclo) conseguiu **criar propostas** por meio de mutation `proposals.create`, o que configuraria violação grave. A investigação revelou que o bundle em execução na VPS era o anterior ao redeploy — a operação de atualização havia construído a imagem com o diretório de código ainda na versão antiga (18/07), de modo que a trava `requireUser`, embora presente no código atual, não constava do processo rodando.

**Correção:** reimplantação completa com o código da main atualizada (tarball autenticado da main + rebuild sem cache + recriação do container), com backup prévio do banco de 55 MB (`/root/backups/s2-apply-2026-08-16-1327.sql.gz`). Após a reimplantação, o mesmo teste foi repetido três vezes com três variantes de chamada (POST em lote, mutation editor, POST simples) e **todas foram bloqueadas com FORBIDDEN**, conforme a evidência abaixo.

> Teste A — mutation protectedProcedure (proposals.create) com viewer, batch POST: `{"code":"FORBIDDEN","httpStatus":403,"path":"proposals.create"}` — mensagem "Operações de alteração exigem perfil Editor ou superior".
> Teste B — mutation editorProcedure (categories.delete) com viewer: FORBIDDEN — mensagem "Requer perfil Editor ou superior".
> Teste C — mutation protectedProcedure com viewer, POST sem batch: FORBIDDEN.

A presença da trava no bundle foi confirmada independentemente por verificação do artefato (`grep "perfil Editor ou superior" /app/dist/index.js` retornou 2 ocorrências).

### 3.2. Causa da saturação recorrente (ligada ao "fora do ar")

O serviço `quotationRematchService.ts`, que roda agendado a cada 2 horas, carregava **todo o catálogo de 27.435 produtos em memória** e processava **todos os ~1.819 itens de cotação pendentes** de uma única vez, com correspondência por embedding sequencial. Durante a auditoria, observou-se o processo consumindo 103% de CPU por mais de uma hora, com `healthz` sem resposta e o pool de conexões do banco exaurido (pool limite 10) — este último sintoma gerou também erros de registro na tabela `audit_logs`, que foi verificada e **está estruturalmente correta** (as colunas batem com os inserts; as falhas eram de pool, não de schema).

**Correção (PR #113, merged em main):** o re-matching passou a limitar **25 itens por execução**, prosseguindo nas janelas agendadas seguintes até completar a fila — a fila continua sendo processada por completo, mas de forma gradual e sem sobrecarga. O fix foi publicado na branch `fix/rematch-saturacao`, mesclado na main por squash, e reimplantado na VPS. No sandbox, os gates passaram sem regressão: typecheck exit 0 e **728 testes aprovados**.

## 4. Evidências de homologação

| Verificação | Resultado |
|---|---|
| Login real em produção (viewer de teste) | 200, com cookie httpOnly e evento `login_sucesso` registrado em `audit_logs` |
| Mutation `proposals.create` com perfil viewer | **FORBIDDEN 403** (3 variantes de chamada, todas bloqueadas) |
| Mutation `categories.delete` com perfil viewer | **FORBIDDEN 403** |
| Trava `requireUser` presente no bundle em execução | Confirmada (2 ocorrências verificadas) |
| Testes unitários RBAC (`trpc.rbac.test`) | 19 testes aprovados |
| Tabela `audit_logs` (schema) | Correta — 11 colunas, coerentes com os inserts da aplicação |
| Suíte completa após as correções | 728 aprovados, 2 ignorados, 0 falhas |
| Estabilidade pós-redeploy | `healthz` respondendo em <10 ms; app em 0,04% CPU; load 0,54 |
| Backup prévio | `/root/backups/s2-apply-2026-08-16-1327.sql.gz` (55 MB) |

## 5. Ressalvas formais

Permanece como ressalva estrutural o **GitHub Actions bloqueado na conta** (startup_failure desde 10/08): a esteira automática de deploy está inoperante e a reimplantação foi feita manualmente, com validação. Recomenda-se o desbloqueio em Settings → Actions/Billing da conta s2corporativo para restaurar a automação. O segundo ponto é o consumo constante de CPU pelo servidor local de modelos (Ollama/llama-server, ~79% CPU), usado pelos embeddings de correspondência; caso a latência volte a degradar, avaliar hardware dedicado ou modelo menor. Por fim, o lockout anti-brute-force em produção não foi disparado fisicamente (5 tentativas em 15 minutos) para evitar bloquear a conta real do titular; sua prova está na suíte de testes.

## 6. Checklist de fechamento

O módulo encerra com o checklist verificado: backend em execução sem erro, frontend íntegro, endpoints de saúde respondendo, autorização validada em produção com três variantes, logs sem dados sensíveis (senha nunca registrada em shell ou log), banco sem drift, correção testada local e em produção, rollback possível via backup de 55 MB, e nenhuma quebra de módulo existente — a fila de re-matching apenas passou a ser drenada em lotes, sem alteração de resultado.

**Próximo passo da sequência oficial: Módulo 05.**
