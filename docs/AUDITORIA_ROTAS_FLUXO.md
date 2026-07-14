# Auditoria e higienização do sistema S2

Data: 2026-07-14  
Escopo: frontend, rotas, permissões, serviços, dependências, logs, configuração de produção, testes e estrutura de dados do repositório `s2corporativo/s2licit`.

## Resultado executivo

O sistema passa a ter um fluxo operacional principal e auditável:

1. captar no Radar PNCP, em Cotações ou por Edital;
2. registrar uma única oportunidade no Funil;
3. decidir GO/NO-GO com justificativa;
4. revisar edital, catálogo, custo e preço;
5. criar uma proposta vinculada à oportunidade;
6. disputar, habilitar e executar no Pós-venda;
7. faturar, receber e medir o resultado.

O menu principal caiu de 54 para 17 entradas, em 6 grupos. Ferramentas especializadas continuam disponíveis no Manual quando possuem função real. Rotas redundantes ou incompletas usam redirecionamentos de compatibilidade.

## Alterações realizadas

### Fluxo e rotas

- Radar PNCP, Cotações e Edital criam ou reutilizam uma oportunidade canônica no Funil.
- A deduplicação usa origem e identificador externo persistidos no banco.
- GO/NO-GO é obrigatório antes de avançar para análise, preço e proposta.
- O Funil aceita apenas transições previstas; o salto livre entre etapas foi removido.
- A proposta registra o vínculo com a oportunidade e devolve o usuário ao histórico correto.
- Links internos do Dashboard, Agenda e Propostas apontam somente para rotas canônicas.
- O script `pnpm audit:routes` bloqueia rota duplicada, item de menu órfão, destino inexistente e novo uso interno de URL legada.

### Compatibilidade simplificada

| Rota antiga | Destino canônico |
| --- | --- |
| `/central-operacional` | `/funil` |
| `/decisao-executiva` | `/funil` |
| `/contratos-pos-licitacao` | `/pos-venda` |
| `/proposta-rapida` | `/edital` |
| `/propostas-admin` | `/propostas` |
| `/analisador-edital` | `/edital` |
| `/proposta-automatica` | `/edital` |
| `/captura-scheduler` | `/captura-inteligente` |
| `/captura-analytics` | `/captura-inteligente` |
| `/dashboard` | `/` |

Os oito componentes de página substituídos por essas rotas foram removidos. As URLs foram preservadas para favoritos e integrações existentes.

### Segurança e permissões

- Consultas autenticadas aceitam Viewer; toda mutação baseada em `protectedProcedure` exige Editor ou Admin por regra central.
- Endpoints sensíveis declaram `editorProcedure` ou `adminProcedure` de forma explícita.
- Upload de logo exige Admin; importação Excel exige Editor.
- Uploads aceitam apenas JPEG, PNG ou WebP confirmados pela assinatura binária, não apenas pelo nome do arquivo.
- A geração de PDF, envio de e-mail e criação de proposta validam preço e vínculo da oportunidade antes de produzir saída.
- Logs deixaram de registrar e-mail administrativo, telefone, conteúdo de notificação e trecho bruto de respostas externas.
- `pnpm audit:secrets` procura credenciais literais sem exibir possíveis valores.

### Saúde e produção

- `/healthz` confirma que o processo está vivo.
- `/readyz` só responde pronto após inicialização e uma consulta real ao MySQL.
- O diagnóstico administrativo também executa consulta real ao banco.
- O `Dockerfile` exige migrations válidas antes de iniciar e usa `/readyz` no health check.
- O CI executa lint, auditoria de rotas, auditoria de segredos, TypeScript, testes e build.

### Código morto e dependências

- Removidos 23 componentes de UI gerados e sem nenhuma importação real.
- Removidos 8 componentes de páginas redundantes ou incompletas.
- Removidos 24 pacotes de produção e 4 pacotes de desenvolvimento comprovadamente sem consumidor.
- `csv-parse` foi preservado porque os scripts de carga do repositório o utilizam.
- O lockfile continua válido com instalação congelada (`--frozen-lockfile`).

### Funcionalidades incompletas encontradas

- O antigo scheduler de captura simulava conclusão sem capturar produtos. A interface foi retirada e as mutações antigas retornam indisponibilidade explícita.
- O antigo analytics de captura expunha métricas ainda não implementadas. A interface foi retirada do fluxo.
- Os endpoints de status e cancelamento do pipeline NF-e sempre devolviam valores fictícios; foram removidos. O processamento real continua síncrono.
- Integrações com PNCP, e-mail, IA, WhatsApp, fornecedores e portais dependem de credenciais e disponibilidade externas; compilação local não comprova esses serviços.

## Estruturas redundantes preservadas com segurança

Não foram apagadas tabelas de produção sem migração e telemetria. Permanecem sob observação:

- oportunidades: `gov_licitations`, `licitacoes_descobertas`, `licitacoes`, `oportunidadesLicitacao`, `radarOpportunities`, `funil_oportunidades` e `email_quotations`;
- contratos: `contratos` e `post_award_contracts`, além das famílias de reajuste;
- auditoria: `auditLog` e `audit_logs`;
- captura: famílias `scrape_*`, `scraper_*`, `supplier_capture_*` e `captured_product_*`.

A navegação autenticada agora registra somente rota e usuário no log de auditoria. O relatório administrativo de uso permite decidir uma remoção posterior com evidência, sem registrar conteúdo comercial.

## Verificações reproduzíveis

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm audit:routes
pnpm audit:secrets
pnpm check
pnpm test
pnpm build
```

Para validar integrações externas de ponta a ponta, ainda é necessário um ambiente de homologação com MySQL, credenciais de teste e endpoints permitidos. Nunca usar dados ou credenciais de produção em testes automatizados.
