# Auditoria operacional de rotas e fluxo

Data: 2026-07-13  
Escopo: frontend, rotas, chamadas tRPC, serviços relacionados, esquema de dados, CI e build do repositório `s2corporativo/s2licit`.

## Resumo executivo

O sistema tem boa cobertura funcional, mas apresenta ferramentas demais no mesmo nível de navegação e vários fluxos paralelos que não compartilham uma oportunidade canônica.

Principais números encontrados:

- 58 páginas carregadas por rota;
- 54 itens na barra lateral, distribuídos em 9 grupos;
- 80 namespaces no roteador tRPC;
- 58 namespaces chamados diretamente por páginas roteadas;
- 3 namespaces usados indiretamente por hooks/componentes;
- 19 namespaces sem consumidor direto identificado no frontend;
- múltiplas famílias de tabelas para oportunidade, contrato, auditoria e captura.

A primeira simplificação reduz a navegação principal para 17 itens em 6 grupos, mantém o Manual no rodapé e preserva todas as rotas existentes. Nenhuma tabela ou dado foi removido.

## O que foi confirmado

- Todos os módulos alcançáveis pelo frontend e pelo servidor resolvem no TypeScript.
- O check `tsc --noEmit` passa.
- O build Vite do frontend passa.
- O bundle de produção do servidor passa.
- As rotas declaradas possuem componente correspondente ou redirecionamento.
- O repositório usa React com carregamento sob demanda, tRPC, Zod e TypeScript.
- O histórico recente da branch principal registrava 618 testes aprovados antes desta auditoria.
- A correção de segurança de preços da PR #25 passou localmente no teste específico, no TypeScript e no build completo.

Essas verificações confirmam estrutura, contratos e compilação. Elas não substituem teste autenticado com banco MySQL e integrações externas reais.

## Navegação canônica adotada

| Grupo | Rotas principais |
| --- | --- |
| Operação | `/`, `/agenda`, `/funil` |
| Oportunidades | `/radar-pncp`, `/cotacoes-recebidas`, `/edital` |
| Propostas | `/propostas`, `/documentos-habilitacao`, `/sala-disputa` |
| Catálogo | `/produtos`, `/fornecedores`, `/importar`, `/equivalencias` |
| Execução | `/pos-venda`, `/financeiro`, `/desempenho` |
| Administração | `/configuracao` |
| Ajuda | `/manual`, no rodapé |

O menu agora é filtrado pelo perfil do usuário. Rotas de editor e administrador deixam de aparecer para perfis sem acesso.

## Inventário das rotas

### Fluxo principal

- `/` e `/dashboard` (redirecionamento): painel geral.
- `/agenda`: prazos e próximos eventos.
- `/funil`: quadro operacional.
- `/radar-pncp`: consulta de oportunidades PNCP.
- `/cotacoes-recebidas`: triagem e resposta de cotações por e-mail.
- `/edital`: extração, vínculo ao catálogo e criação de proposta.
- `/propostas` e `/propostas/:id`: lista e edição de propostas.
- `/documentos-habilitacao`: acervo de habilitação.
- `/sala-disputa`: apoio à disputa.
- `/produtos`, `/fornecedores`, `/importar` e `/equivalencias`: catálogo.
- `/pos-venda` e `/financeiro`: execução e financeiro.
- `/desempenho`: indicadores.
- `/configuracao`: configuração administrativa.
- `/manual`: fluxo operacional e acesso às ferramentas avançadas.

### Apoio funcional preservado

- Pesquisa e preço: `/busca-global`, `/busca`, `/comparacao`, `/analise-precos`, `/custo-total`, `/tributos`, `/aplicar-precificacao`, `/regras-categoria`.
- Catálogo e dados: `/categorias`, `/qualidade`, `/importar-nfe`, `/imagens`, `/enriquecimento`, `/reclassificacao`, `/sinonimos`, `/enriquecimento-nfe`, `/historico-enriquecimento`.
- Documentos: `/certidoes`, `/diligencias`, `/portais-licitacao`, `/templates-proposta`.
- Assistência: `/agente`.

### Módulos implementados, mas paralelos ou desconectados do fluxo principal

- `/central-operacional`: sobrepõe parte de Dashboard, Funil e Propostas.
- `/decisao-executiva`: exige `proposalId`; portanto avalia depois da criação da proposta, não antes.
- `/proposta-rapida`, `/proposta-automatica`, `/propostas-admin` e `/agente-proposta`: quatro caminhos adicionais para o mesmo domínio de proposta.
- `/contratos-pos-licitacao`: painel de leitura paralelo ao módulo transacional `/pos-venda`.
- `/captura-inteligente`, `/captura-revisao`, `/captura-scheduler`, `/captura-analytics`, `/configurador-fornecedores` e `/scraper-fornecedores`: cadeia de captura fragmentada em várias telas.
- `/central-ia`: configuração técnica, não operação diária.
- `/diagnostico` e `/admin/database-health`: diagnóstico técnico.

Essas rotas continuam disponíveis no Manual, dentro de uma seção recolhida de ferramentas avançadas.

### Compatibilidade e erro

- `/analisador-edital` redireciona para `/proposta-automatica`.
- `/404` e a rota final exibem a página de não encontrado.
- Nenhuma rota antiga foi removida nesta fase.

## Pontos que ainda não formam um fluxo único

1. O Radar consulta o PNCP, mas não persiste a oportunidade nem cria um card no Funil.
2. A deduplicação do Radar é mantida em memória e se perde ao reiniciar o processo.
3. O backend do Funil possui criação a partir de licitação, mas a interface não chama esse caminho.
4. Cotações por e-mail podem gerar e enviar resposta sem criar oportunidade ou proposta comercial rastreável.
5. A decisão executiva está ligada à proposta, invertendo a ordem esperada de GO/NO-GO.
6. Documentos de habilitação são globais; não existe matriz por oportunidade, cláusula e validade.
7. Movimentações do Funil não impõem gates de edital, preço, documentação e aprovação.
8. O health check `/healthz` valida o processo, mas não confirma banco ou dependências.
9. Há criação de estrutura em runtime convivendo com migrations, o que aumenta divergência entre ambientes.
10. Muitas mutações usam apenas autenticação; a adoção de `editorProcedure` ainda é parcial.
11. O CI não executa um fluxo E2E autenticado com MySQL.

## Redundância de dados identificada

### Oportunidades

As famílias `gov_licitations`, `licitacoes_descobertas`, `licitacoes`, `oportunidadesLicitacao`, `radarOpportunities`, `funil_oportunidades` e `email_quotations` representam partes sobrepostas do mesmo ciclo.

### Contratos

`contratos` e `post_award_contracts`, além de famílias distintas de reajuste, mantêm modelos paralelos.

### Auditoria

`auditLog` e `audit_logs` coexistem.

### Captura

Há famílias paralelas `scrape_*`, `scraper_*`, `supplier_capture_*` e `captured_product_*`.

Não é seguro apagar essas estruturas sem telemetria de uso, migração de dados e testes de regressão.

## Namespaces tRPC sem consumidor direto identificado

Depois de considerar os usos indiretos de `auth`, `priceImport` e `priceSync`, permaneceram sem chamada direta encontrada no frontend:

`alertConfig`, `drogavet`, `duplicateDetection`, `importConsolidated`, `importMatching`, `marginOptimization`, `metadata`, `notificationWebhooks`, `priceAlerts`, `pricing`, `productMatching`, `quotations`, `recognition`, `reports`, `scraperIntegration`, `scraperMulti`, `scraperSync`, `supplierAuth` e `supplierImport`.

Eles podem atender jobs, webhooks ou integrações externas. A recomendação é instrumentar uso antes de descontinuar.

## Fluxo operacional recomendado

1. Captar no Radar, Cotações ou Edital.
2. Registrar uma oportunidade única no Funil.
3. Fazer GO/NO-GO antes de criar a proposta.
4. Extrair edital, vincular catálogo e validar custo/preço.
5. Verificar habilitação e aprovação.
6. Gerar e enviar uma proposta única.
7. Operar a disputa com preço-piso aprovado.
8. Ao ganhar, criar execução no Pós-venda.
9. Controlar entrega, nota, recebimento e resultado.

Até a integração Radar/Cotações → Funil ser implementada, o número do processo deve ser repetido manualmente para preservar rastreabilidade.

## Próximas fases sugeridas

1. Criar a entidade canônica de oportunidade e integrar Radar e Cotações ao Funil.
2. Colocar GO/NO-GO, edital, preços e habilitação como gates do Funil.
3. Consolidar os caminhos de proposta e contratos.
4. Instrumentar uso de rotas, namespaces e tabelas antes de remover redundâncias.
5. Mover autorização de escrita para o servidor com `editorProcedure`/admin.
6. Adicionar testes E2E autenticados com MySQL e health check de dependências.

