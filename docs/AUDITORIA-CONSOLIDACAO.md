# Auditoria e consolidação do sistema — 17/07/2026

Pente fino completo do sistema após alterações de múltiplas frentes de
desenvolvimento. Registro do que foi corrigido nesta rodada e do que ficou
mapeado para consolidação futura.

## Corrigido nesta rodada

### Bugs críticos (quebravam instalação/operação)

1. **Migração falhava em banco novo** — 5 nomes de constraint FK em
   `drizzle/0000_consolidado_producao.sql` excediam o limite de 64 caracteres
   do MySQL/MariaDB. Nomes encurtados; instalação do zero validada.
2. **Índice inválido `idx_products_active_ficha`** — incluía a coluna
   `fichaTecnica` (TEXT), que o MySQL não indexa sem prefixo. Índice reduzido
   a `isActive` (as consultas de cobertura filtram por `IS NULL`, que não usa
   índice em TEXT de qualquer forma). Corrigido no SQL, no `schema.ts` e nos
   snapshots do Drizzle.

### Captura de catálogo dos fornecedores (motor reescrito)

3. **O scraper não cadastrava produtos novos** — itens sem correspondência no
   catálogo eram descartados. Agora `matchAndUpdate` (scraperEngine.ts)
   **cadastra automaticamente** todo produto novo com nome, preço, código,
   EAN, foto e link, marcado `statusConfiabilidade: pendente_revisao`, com
   oferta (`productSupplierOffers`) e histórico de preço.
4. **Limites baixos para catálogos grandes** — teto de 20 páginas por
   categoria virou `SCRAPER_MAX_PAGES` (padrão 1000) com detecção de página
   repetida (fim real do catálogo). Captura por site (fluxo multi-origem):
   30 → 500 itens; lote de captura: 1.000 → 20.000; catálogo de auto-match:
   5.000 → 100.000. Dimensionado para ~10 mil produtos por fornecedor.
5. **Matching reescrito para escala** — o catálogo é pré-carregado em mapas
   (EAN global, código e nome por fornecedor) em vez de 1–3 consultas SQL por
   item raspado. Segunda rodada da mesma varredura é idempotente (0 duplicatas
   — validado em teste de integração).
6. **Fila de revisão órfã** — a tela "Revisão de Capturas"
   (`/captura-revisao`) lia `product_capture_history`, que **nenhum código
   populava**. O motor agora grava ali a trilha de tudo que aplica (criações
   e mudanças de preço), e o export CSV — que retornava vazio (stub) — foi
   implementado de verdade.
7. **Pedido de login a cada atualização** — "Atualizar Agora" abre o diálogo
   de confirmação de login do fornecedor (e-mail + senha salva no cofre ou
   nova senha), como exigido pela operação. Backend aceita credenciais no
   `scraperAgent.executar` e as regrava criptografadas antes de rodar.
8. **Limpeza de logs de captura desativada** — o `DELETE` estava comentado
   (`captureSchedulerService.cleanupOldCaptureLogs`); reativado.

### Higienização

9. **Router morto removido** — `scraperIntegration` (todas as procedures
   lançavam `METHOD_NOT_SUPPORTED`; zero uso no client).
10. **Resíduos de refactor** — comentários órfãos numerados em
    `server/routers.ts` removidos.
11. **Variáveis de ambiente não documentadas** — `SCRAPER_MAX_PAGES`,
    `SCRAPER_SCHEDULE_ENABLED/CRON`, `UPLOAD_DIR`, `FIEMG_LICITACOES_URL`,
    `LLM_TIMEOUT_MS` adicionadas ao `.env.example`.

### Redesign SaaS

12. **Novo shell da aplicação** — sidebar escura organizada pelo fluxo real
    de trabalho (Visão geral → 1·Oportunidades → 2·Catálogo e preços →
    3·Fornecedores e captura → 4·Propostas e disputa → 5·Execução →
    Administração), topbar com título da página e busca global, layout
    responsivo com menu móvel.
13. **Design system modernizado** (`index.css`) — tokens indigo/esmeralda,
    cantos arredondados, sombras suaves, tabelas/cards/nav repaginados.
    Telas que estavam fora do menu entraram no fluxo: Revisão de capturas,
    Análise de preços, Enriquecimento, Imagens, Importar NF-e, Certidões.

## Consolidação executada (2ª rodada — limpeza profunda)

- **24 routers mortos removidos** (zero chamadas do client, sem webhooks nem
  uso interno; verificado por busca exaustiva antes de cada remoção):
  `editalAnalyzer`, `scraperMulti`, `scraperSync`, `supplierImport`,
  `priceAlerts`, `marginOptimization`, `connectors`, `alertConfig`, `reports`,
  `captureScheduler`, `captureAnalytics`, `operations`, `duplicateDetection`,
  `executiveDecision`, `postAwardContracts`, `importConsolidated`,
  `productMatching`, `importMatching`, `quotations`, `recognition`,
  `drogavet`, `metadata`, `supplierAuth`, `notificationWebhooks`.
- **21 módulos órfãos removidos em cascata** (varridos até ponto fixo —
  módulo sem nenhum importador fora de testes): 18 serviços
  (`captureSchedulerService`, `captureLogService`, `captureAnalyticsService`,
  `duplicateDetectionService`, `executiveDecisionService`,
  `importConsolidationService`, `importMatchingService`,
  `marginOptimizationService`, `materialEquivalence`,
  `postAwardContractsService`, `priceHistoryService`,
  `priceSyncNotificationService`, `priceVariationAlertService`,
  `productImageService`, `scraperTableSyncService`, `supplierRankingService`,
  `notificationService`, `productConsolidationService`) e 3 conectores
  (`connectorFactory`, `scraperConnector`, `supplierConnector`), com os
  respectivos testes.
- **Reclassificação unificada**: as procedures do router EN
  (`reclassification`) foram fundidas no `reclassificacao` — um único
  namespace atende `ReclassificacaoIA`, `DataQualityDashboard` e
  `ReclassificationModal`; teste migrado junto.
- **Scripts one-off superados removidos**: `reclassify-ai/batch/by-keyword/
  outros.mjs` (substituídos pela tela Reclassificação IA) e
  `rebuild-categories.mjs` (substituído pela v2).

## Ainda mapeado para consolidação futura

- **Famílias de pricing**: os routers de preço remanescentes E USADOS pelo
  client (`pricing`, `priceAnalysis`, `priceIntelligence`, `precificacao`,
  `priceSync`, `categoryPricing`, `bulkPricing`, `priceImport`) ainda se
  sobrepõem em conceito; fundir exige redesenho das telas que os consomem.
- **Duas telas gravando em `scraperConfigs`**: "Agente de captura"
  (`scraperAgent`) e "Acessos e credenciais" (`supplierCredentials`) — mesmos
  dados, validações levemente diferentes.
- `PRODEMGE_API_KEY` está documentada mas nenhum conector a usa (o conector
  de Compras usa a API pública). Confirmar se a integração paga será feita ou
  remover a variável.

## Validação executada

- `pnpm check` (tsc), `pnpm test` (810 testes), `pnpm build`, ESLint: verdes.
- Migração completa em banco MariaDB zerado: OK.
- Boot de produção: admin criado, 5 fornecedores semeados, agendadores ativos.
- Login local + navegação nas telas principais via navegador real: OK.
- Teste de integração do motor de captura: atualização de preço com trilha,
  cadastro automático de 3 produtos com foto/EAN, idempotência na 2ª rodada.
