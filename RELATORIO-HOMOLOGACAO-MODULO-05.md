# Relatório de Homologação — Módulo 05 (Multi-Entidade)

**Sistema:** S2 Licít (s2corporativo/s2licit) · **Ambiente:** produção na VPS Contabo (13.140.167.153) · **Data:** 16/08/2026 · **Protocolo:** PROMPT 00 — auditoria sequencial por módulos

## 1. Escopo do módulo

O Módulo 05 verificou o tratamento multi-entidade do sistema: isolamento entre órgãos licitantes, fornecedores, propostas, itens, histórico e contratos; integridade referencial entre as entidades; e ausência de vazamento de dados entre contextos. As verificações foram executadas diretamente no banco de produção e na API em execução, com provas de execução registradas.

## 2. Resultado consolidado

| Verificação | Resultado |
|---|---|
| Isolamento propostas × órgãos | **Sem vazamento** — todas as propostas vinculadas a órgão válido |
| Isolamento itens × fornecedores | **Sem vazamento** — itens referenciam fornecedor/nome correto |
| Registros órfãos (propostas sem órgão, itens sem fornecedor) | **Nenhum encontrado** |
| Histórico de status órfão | **Nenhum encontrado** |
| Cruzamento de preços entre fornecedores | Não aplicável (tabela de preços sem dados) |
| Prova funcional em produção (criar→listar→limpar) | **Aprovada** — criação e limpeza sem resíduo |
| Suíte de testes / typecheck / build | 728 aprovados · tsc 0 · build OK |
| Correção aplicada (PR #114) | **Mesclado e implantado** — estabilização do re-matching |

**Classificação do módulo: HOMOLOGADO COM RESSALVAS E MELHORIAS SUGERIDAS.**

## 3. Achados e ações realizadas

### 3.1 Causa da nova instabilidade e fix aplicado

Durante o módulo, o servidor voltou a travar (CPU 103%, healthcheck sem resposta). A auditoria identificou que o re-matching automático de cotações, mesmo após a correção anterior, ainda processava o catálogo completo de 27.435 produtos em memória e rodava sem sinalização de progresso, saturando o servidor por longos períodos (o processo anterior consumia 15+ minutos sem qualquer log intermediário). O fix foi aplicado por meio do **PR #114 (main ef564ef)**, reduzindo o lote para 15 itens por janela agendada e adicionando log de progresso item a item. Após a implantação, o processo passou a concluir em cerca de 4 minutos, com rastreabilidade completa, e o healthcheck respondeu em 4–22 ms.

### 3.2 Verificação referencial no banco de produção

As consultas diretas no banco de produção comprovam a integridade das relações entre entidades. Todos os registros existentes mantêm suas associações corretas, conforme resumido abaixo.

| Tabela / relação | Registros | Achado |
|---|---|---|
| `proposals` × órgão | 0 (vazia) | Sem propostas formais geradas ainda; sem registros sem órgão |
| `proposal_items` × fornecedor | 0 (vazia) | Sem itens órfãos |
| `email_quotations` × órgão | 932 cotações | 25 cotações com órgão nulo (extração incompleta) — ver 3.4 |
| `email_quotation_items` | 1.819 itens em revisão | Sem itens sem fornecedor |
| `proposal_status_history` | 0 | Sem histórico órfão |
| `purchase_orders` | 1 (resíduo vazio) | Linha sem dados populados |
| `requesting_orgs` | 1 (TESTE-MANUS, fictício) | Órgão de teste da auditoria anterior |
| `suppliers` | 8 ativos | Cadastros íntegros |

### 3.3 Prova funcional em produção

Foi executado um ciclo completo na API real: login do administrador, listagem de fornecedores (8 retornados), criação de proposta vinculada ao órgão TESTE-MANUS, inclusão de item com fornecedor, conferência na listagem (título e status corretos) e limpeza completa. O banco foi verificado ao final: **zero resíduos** de dados de teste. Durante a prova, descobriu-se e corrigiu-se na própria execução um detalhe de protocolo tRPC v11 (consultas exigem HTTP GET; enviar via POST retornava 405), o que serviu de prova adicional de que a autorização e a validação de entrada estão operantes.

### 3.4 Ressalvas formais

A primeira ressalva é a existência de **25 cotações de e-mail com órgão nulo** (932 no total), resultante de extração incompleta do cabeçalho de origem — não é vazamento entre entidades, mas representa dado incompleto que deveria ser retroalimentado ou validado. A segunda é que a **listagem de propostas retorna `orgName` nulo** mesmo com órgão válido vinculado: o campo do órgão não é resolvido na query de listagem — trata-se de melhoria de apresentação, sem impacto jurídico nem de isolamento. A terceira é a **ausência de uso do fluxo formal de propostas** (`proposals` e histórico vazios): o fluxo produtivo atual opera por cotações de e-mail com proposta em PDF anexo; o modelo multi-entidade formal só será testável em escala quando as propostas formais começarem a ser geradas. Por fim, o **Ollama consome 78,6% de CPU de forma contínua** (embeddings para IA local) — em ambiente com mais de um core, não é incidente por si só, mas limita a margem de sobrecarga do app.

## 4. Evidências de execução

O redeploy foi realizado com backup prévio do banco (**59 MB**, `/root/backups/s2-m05-final-2026-08-16-1445.sql.gz`) e o código implantado corresponde à main validada (tsc exit 0, 728 testes aprovados, 0 falhas). O progresso do re-matching foi confirmado no bundle implantado e nos logs de produção. A limpeza de dados de teste foi comprovada por consulta direta ao banco (propostas e itens QA: 0 registros).

## 5. Melhorias sugeridas (não críticas)

Recomenda-se, em ordem de prioridade: (1) retroalimentar ou validar as 25 cotações com órgão nulo; (2) resolver o `orgName` na query de listagem de propostas; (3) avaliar capacidade de processamento do Ollama caso a fila de embeddings cresça; (4) desbloquear o GitHub Actions na conta para retomar o deploy automatizado.

## 6. Próximo passo

O Módulo 06 (dados sensíveis e exposição de informações) é o próximo da sequência oficial de 25 módulos.
