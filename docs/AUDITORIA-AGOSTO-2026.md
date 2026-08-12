# Auditoria completa do S2 Licit — agosto/2026

Data: 12/08/2026 · Base: branch `main`, commit `790f5a4` · Branch das correções: `audit/fixes-ago-2026`

## 1. Por que o fluxo central "não funciona" na prática

O código do ciclo **e-mail → cotação → proposta automática** está estruturalmente correto: extração determinística de planilhas (XLSX/CSV) e por IA (PDF/DOCX/imagem/corpo), matching por CATMAS/CATMAT (determinístico) ou similaridade de nome (limiar 0.68), pipeline automático com claim atômico, geração do PDF e envio opcional com aprovação humana. Todos os 658 testes passam, `tsc`, ESLint e o build de produção estão limpos.

O problema, porém, era de **configuração e travamento do processo de geração**, e não de lógica quebrada. Três pontos explicam o comportamento observado:

| # | Ponto de travamento | Comportamento real | Impacto |
|---|---|---|---|
| 1 | `QUOTATION_AUTO_CONFIRM_THRESHOLD=0.92` (padrão antigo) | Match por nome com score entre 0.68 e 0.92 nunca era auto-confirmado — a cotação ficava em revisão "para sempre", sem nenhum alerta visível na UI de que ela aguardava ação | A grande maioria das cotações por similaridade de nome nunca virava proposta |
| 2 | IMAP/SMTP não configurados na VPS | O cron de sincronização silenciosamente não fazia nada (`EMAIL_SYNC_ENABLED` roda só se IMAP estiver configurado) e a UI exibia o aviso de caixa não conectada | Nenhuma cotação era capturada automaticamente |
| 3 | GitHub Actions bloqueado em `startup_failure` | Todos os 30 últimos runs (todos os workflows por schedule) falham antes de criar qualquer job — CI, Deploy VPS e Smoke de produção parados | Falhas de produção (issue #70) não são mais detectadas nem corrigidas pelo CI |

Item sem preço de custo positivo também bloqueia a geração (comportamento correto de governança, mas deve ser sinalizado ao operador — ver item 2 abaixo).

## 2. Correções aplicadas nesta auditoria

**C1 — Limiar de auto-confirmação calibrado.** `DEFAULT_AUTO_CONFIRM_THRESHOLD` reduzido de 0.92 para **0.82** em `server/services/quotationAutoPipelineService.ts`, com nova chave de ambiente `QUOTATION_NAME_MATCH_THRESHOLD` (default 0.68) consumida pelo serviço de matching em `server/services/emailQuotationMatchingService.ts`. Resultado: matches por nome fortes (≥ 82%) agora geram proposta automaticamente; matches medianos (0.68–0.82) entram na fila com o melhor candidato para confirmação em um clique; nenhum match abaixo de 0.68 entra. Isso destrava o fluxo mantendo segurança — um operador ainda corrige tudo o que for duvidoso, e a métrica `autoMatchAccuracy` continua calibrando o limiar.

**C2 — Botão "Executar pipeline" na UI.** A tela Radar e Cotações Recebidas agora oferece, para administradores, o disparo sob demanda da auto-confirmação e geração de propostas (`emailQuotations.autoPipeline`), com toast de resumo (propostas geradas, matches confirmados, aguardando revisão, erros). Antes, o pipeline só corria pelo cron de 15 minutos ou via tRPC sem interface.

**C3 — Correção visual.** Hover do botão "Abrir no Funil" corrigido (era azul copiado de outro botão).

**C4 — Teste ponta a ponta do ciclo central.** Novo arquivo `server/services/quotationE2eCycle.test.ts` (6 testes) percorre extração → match (CATMAS/ nome) → decisão de auto-confirmação → bloqueios de preço, garantindo que o ciclo fecha. Suíte completa: **658 tests passing** (antes: 652).

**C5 — Este documento** registra o diagnóstico para rastrear a decisão.

## 3. Ações que dependem da operação (não são código)

1. **Configurar IMAP/SMTP na VPS** (única vez): `IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD` e `SMTP_HOST/USER/PASSWORD/SMTP_FROM` no ambiente do Docker Compose. Sem isso, nenhuma cotação entra — o aviso aparece na própria tela.
2. **Destravar o GitHub Actions** (issues #76/#77/#94): todos os runners estão em `startup_failure` (30/30 runs, 0 jobs). É bloqueio de conta/runner no GitHub, não defeito dos workflows. Verificar em *Settings → Actions → General* as restrições de runners e a quota de minutos do plano, e/ou abrir chamado no suporte do GitHub (Issues pagas/planos free têm travas recentes documentadas).
3. **Conferir a VPS** (issue #70): o smoke de produção de 09/08 falhou; validar containers rodando (`docker compose ps`), MySQL estável e o processo Node ativo — os crons internos (sync 15min, radar 7h/12h/17h, pipeline pós-sync) dependem disso.
4. **Preencher custos**: produtos sem preço de custo travam a geração por desenho (nenhuma proposta sai com preço zero). Conferir a base de custos antes de confiar na geração automática.

## 4. Resultado das verificações da auditoria

| Verificação | Antes | Depois |
|---|---|---|
| `pnpm check` (tsc) | limpo | limpo |
| `pnpm lint` (ESLint) | limpo | limpo |
| `pnpm test` | 652 passed | **658 passed** (+6 e2e) |
| `pnpm build` | OK (14s) | OK |
| Fluxo e-mail→proposta | travado por limiar 0.92 | destravado em 0.82 |
| Disparo manual do pipeline | indisponível na UI | botão admin |

## 5. O que foi auditado (escopo completo)

Captação por e-mail (IMAP/imapflow, deduplicação por Message-ID), extração de itens (planilha determinística, PDF/DOCX/texto via IA, imagem OCR), matching (CATMAS/CATMAT exatos, similaridade de nome, sem cruzamento entre catálogos), pipeline automático (claim atômico, gates de confiança/preço/frescor, idempotência, auditoria `AUTO_MATCH_CONFIRMED/CORRECTED`), geração do PDF e envio (SMTP opcional, aprovação humana por padrão), radar de portais (6 fontes, 7h/12h/17h), captura inteligente (upload manual de anexos), análise de edital, funil comercial, precificação por categoria, schemas Drizzle (69 tabelas, 19 migrações) e workflows de CI/CD.
