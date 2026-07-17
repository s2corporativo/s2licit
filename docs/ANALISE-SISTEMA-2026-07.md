# Análise crítica do Sistema S2 — Julho/2026

Parecer de revisão completa do sistema (backend, segurança, frontend, banco de
dados e infraestrutura/operação), produzido por auditoria automatizada com
verificação em código. Cada achado traz referência `arquivo:linha`, severidade
e sugestão de correção.

**Estado verificado nesta data:** `pnpm check` (tsc) = 0 erros ·
`pnpm lint` = 0 erros · `pnpm test` = 599 testes passando (64 arquivos, sem
banco real) · `pnpm build` = ok (chunks > 500 kB) · CI ativo em todo push/PR.

---

## Sumário executivo

O sistema tem uma base técnica sólida — CI real, 599 testes verdes, tRPC com
type-safety fim a fim, autenticação bem construída (scrypt, lockout, MFA,
RBAC), zero SQL injection encontrada, compose com MySQL restrito a localhost e
bootstrap de VPS que gera segredos fortes. As rodadas anteriores de
higienização (PRs #43–#62) surtiram efeito visível.

Os problemas mais graves se concentram em **quatro frentes**:

1. **Violação da regra central do domínio (4 camadas de preço).** Três pontos
   do código sobrescrevem o produto do catálogo com dados de fornecedor ou de
   IA, e o "custo do fornecedor" está fisicamente triplicado em
   `products.price`, `product_supplier_prices` e `product_supplier_offers`.
2. **Operações destrutivas sem rede de proteção.** Nenhuma operação
   multi-tabela usa transação (exceto importação de NF-e); merge de duplicatas
   perde vínculos de ofertas/histórico; scripts ad-hoc alteram produção sem
   dry-run, backup ou trilha; um deles referencia tabela inexistente com o
   erro engolido.
3. **Pipeline de deploy sem freio.** O deploy dispara em todo push no `main`
   sem depender do CI passar, via SSH root com senha e sem verificação de
   host; não existe rollback; e os backups automáticos são gravados dentro do
   container — **apagados a cada deploy**.
4. **Observabilidade quase nula.** ~140 `console.*`, sem logger estruturado,
   sem alertas (o commit de alertas foi revertido sem justificativa), sem
   monitoramento externo.

---

## 1. Regras de negócio — camadas de preço e produto mestre

A regra do domínio: manter 4 camadas por item (custo real do fornecedor,
referência do órgão, benchmark externo, preço final de venda) e **nunca**
sobrescrever o produto mestre ao atualizar custo de fornecedor.

| Sev. | Onde | Crítica | Sugestão |
|---|---|---|---|
| CRÍTICO | `server/importSmartRouter.ts:188-203` | `atualizar_existente` sobrescreve o produto do catálogo com dados da planilha do fornecedor (manufacturer, fichaTecnica, imageUrl, productUrl) e rebaixa `statusConfiabilidade`, apagando curadoria. `detectDuplicate` (`deduplicationEngine.ts:67-94`) não filtra por `supplierId` — a importação do fornecedor A pode reescrever o produto do fornecedor B. | Atualização de custo grava só na tabela de ofertas; alteração de campos técnicos exige fluxo de revisão explícito. |
| CRÍTICO | `server/importSmartRouter.ts:257-262` | `atualizar_preco` grava o custo do fornecedor também em `products.price` ("campo legado"), fundindo a camada de custo com o preço exibido/base de precificação. | Eliminar a escrita no campo legado; derivar preço exibido da tabela de ofertas. |
| CRÍTICO | `server/jobs/importBatchJob.ts:476-483` | Enriquecimento IA grava categoria livre do LLM em coluna enum e se autodeclara `completo_validado` com `confidence > 0.7` — a máquina "valida" a si mesma, quebrando a governança de confiabilidade. | Whitelist de categorias mapeadas para o enum; teto em `enriquecido_ia`. |
| ALTO | `drizzle/schema.ts:1407` vs `:1994` + `products.price` | Três repositórios paralelos para o mesmo dado (custo por fornecedor): `product_supplier_prices`, `product_supplier_offers` e `products.price`. Fluxos diferentes escrevem/leem tabelas diferentes; risco permanente de divergência. | Eleger uma tabela canônica, migrar dados e criar facade única de leitura. |
| ALTO | `drizzle/schema.ts:98-104` | Modelagem invertida: `products` é a oferta do fornecedor (supplierId NOT NULL + price) e não há FK ligando a `master_products` — o "produto mestre" é uma ilha usada só no matching de importação. As 4 camadas não se ancoram num produto canônico. | Criar `products.masterProductId` (FK) e migrar custo para a camada de ofertas. |
| ALTO | `server/services/priceSyncService.ts:89-96` | Compara `number` com `string` decimal do mysql2 — toda linha é reportada como mudança de preço; aritmética number×string em `priceChange`. Módulo também tem placeholders semiacabados (`:103,145,215`). | `Number(product.price)` antes de comparar; terminar ou remover o módulo. |
| ALTO | `server/services/priceImportService.ts:328-332` | Importação de tabela de preço atualiza `products.price` direto, sem histórico e sem upsert na tabela de ofertas — custo fora da trilha; status "conflict" é código morto (`:175,252`). | Passar pelo caminho `upsertProductSupplierPrice` + `recordPriceHistory`. |
| ALTO | `drizzle/schema.ts:2011` | `productSupplierOffers.priceHistory` em JSON duplica a tabela relacional `price_history` — histórico não indexável e propenso a divergir. | Remover o JSON; usar só a tabela. |
| MÉDIO | `server/services/scraperEngine.ts:1041,1156-1167` | Match fuzzy por substring dos 20 primeiros caracteres pode casar produto errado e gravar o preço capturado no produto errado. | Usar `combinedStringSimilarity` com limiar ≥ 0,9; matches fuzzy vão para revisão. |
| MÉDIO | `server/db/supplierPrices.ts:39-42,48-57` | Update com `?? null` apaga código/link do fornecedor quando não informados; `origem` aceito e nunca persistido; `getPriceHistory` lê da tabela errada (1 linha por par — não é histórico). | `?? undefined` para preservar; apontar para `price_history`. |
| MÉDIO | `drizzle/schema.ts:432-464` | `proposal_items` carrega as 4 camadas como snapshot solto: sem FK para a oferta de origem (supplierName é texto livre), sem data da cotação, e o benchmark externo (`publicPriceHistory`) não é referenciado por nenhuma tabela de proposta — perde-se a rastreabilidade "de onde veio este custo". | Guardar `offerId` + `quotedAt` no item; referenciar o benchmark. |

## 2. Integridade de dados e operações destrutivas

| Sev. | Onde | Crítica | Sugestão |
|---|---|---|---|
| CRÍTICO | `scripts/merge-duplicates.mjs:100-113` | Redireciona referências para a tabela `product_equivalence_members`, **que não existe** (a real é `equivalence_members`); o try/catch engole o erro e o passo é pulado em silêncio — membros de equivalência ficam apontando para produtos desativados. | Corrigir o nome da tabela e remover o catch silencioso. |
| CRÍTICO | `scripts/merge-duplicates.mjs` (todo) | Sem dry-run, sem backup prévio, sem transação, sem auditoria; não redireciona `quotation_items`, `product_supplier_prices/offers`, `price_history`, `equivalence_members`. | Transação + flag `--dry-run` + cobrir todas as tabelas referenciadoras. |
| CRÍTICO | `scripts/rebuild-categories-v2.mjs:12-15` | `UPDATE products SET categoryId = NULL` + `DELETE FROM categories` com FK checks desligados, sem backup/confirmação — apaga irreversivelmente a categorização da base e não recategoriza depois. | Confirmação explícita + dump prévio de productId→categoryId. |
| ALTO | `server/db/*` (0 ocorrências de `.transaction(`) | Nenhuma operação multi-tabela da camada de dados usa transação (única exceção: `nfeProductImportService.ts:67`): merge de produtos, criação de proposta+itens, pricing em massa, `criar_novo` do import — falha intermediária deixa estado parcial. | Envolver operações compostas em `db.transaction`. |
| ALTO | `server/db/duplicateMerge.ts:179-191` | `mergeProductGroup` (API de produção) redireciona só `proposal_items`; ofertas, preços e histórico das duplicatas ficam órfãos atrás de `isActive='no'`. | Redirecionar/mesclar ofertas e histórico na mesma transação. |
| ALTO | `server/deduplicationEngine.ts:74-91` | `eq(ean, valor \|\| "")` faz produtos com campo vazio casarem entre si (merges indevidos); para não-medicamentos os candidatos vêm só por nome exato/EAN — quase-duplicatas nunca são detectadas (dedupe ilusória). | Montar condições só com campos presentes; candidatos por token/prefixo do nome. |
| ALTO | `server/db.audit.ts:20-39` | `EXPECTED_TABLES` desatualizada: espera 3 tabelas inexistentes (warning falso permanente) e não inclui as tabelas críticas do domínio de preços — a "auditoria de integridade" está cega. | Derivar a lista do próprio schema Drizzle. |
| MÉDIO | trilha de auditoria funcional | `audit_logs` só recebe eventos de usuários/MFA/workflow/documentos; CRUD de produtos, propostas, preços, merges e importações — as operações mais destrutivas — não são auditados. Há ainda 2 tabelas de auditoria sobrepostas (`auditLog` schema.ts:1670 vs `audit_logs`:1844). | `logAudit` nos routers de produtos/propostas/pricing/merge; unificar tabelas. |
| MÉDIO | `scripts/` (~15 scripts ad-hoc) | Manipulam produção direto via DATABASE_URL sem dry-run obrigatório, transação ou backup automático prévio. | Padrão único: `--dry-run` default, backup automático antes de escrever, log do que mudou. |
| MÉDIO | `scripts/migrate-production.mjs:12-18,205-224` | Engole erros "já existe" (1050/1060/1061/1826) mascarando drift real de schema; reescreve hashes de migrações já aplicadas ("reconciliação") — legitima edição retroativa. | Registrar reconciliações em tabela própria; hash rewrite só com flag explícita. |
| MÉDIO | soft-delete | Nenhum `deletedAt` no schema; soft-delete é `isActive='no'` sem carimbo de quando/quem/motivo — merges irreversíveis na prática. | `deletedAt` + `mergedIntoId` em products. |

## 3. Segurança

Sem SQL injection (todo `` sql`` `` do Drizzle está parametrizado) e sem XXE
explorável (xml2js/sax). Lockout, MFA, RBAC e rate limiting bem feitos.

| Sev. | Onde | Crítica | Sugestão |
|---|---|---|---|
| ALTO* | `Dockerfile` (sem `USER`) | Container roda como **root**, com Chromium/Puppeteer `--no-sandbox` — qualquer RCE via página raspada/parsing executa como root no container. | Usuário não-privilegiado + sandbox do Chromium (ou seccomp/cap-drop). |
| MÉDIO | `server/services/credentialEncryptionService.ts:22` | Chave de fallback hardcoded (`default-insecure-key-...`) para decriptar credenciais CBC legadas se `ENCRYPTION_KEY` faltar. | Remover o default; exigir a env. |
| MÉDIO | `server/services/scraperEngine.ts:445-736`, `propostaAgent.ts:489-491` | SSRF via Puppeteer: `page.goto(url)` com URLs de config sem allow-list nem bloqueio de IPs internos (127.0.0.1, 169.254.169.254, RFC1918). | Allow-list de hosts + bloqueio de ranges privados. |
| MÉDIO | `server/_core/index.ts` (startServer) | Sem `helmet`: faltam `X-Content-Type-Options`, `X-Frame-Options`/CSP, HSTS, `Referrer-Policy`. | Adicionar `helmet()`. |
| MÉDIO | `server/_core/index.ts:76-77` | `express.json({ limit: "50mb" })` global — vetor de DoS por memória (50 MB × concorrência, memoryStorage). | Default 1–2 MB; limite alto só nas rotas de upload/import. |
| MÉDIO | `server/_core/sdk.ts:200-227` | `verifySession` não valida `appId`/`iss`/`aud` — aceita qualquer JWT HS256 assinado com o mesmo segredo. | Validar `appId === ENV.appId` + claims iss/aud. |
| MÉDIO | logout (`server/routers/auth.ts:16-20`) | Logout é só `clearCookie`; JWT stateless segue válido por 7 dias se capturado. | TTL menor + refresh, ou revogação por `jti`. |
| MÉDIO | `.env.production.example:8-20` | Defaults previsíveis commitados (senhas "troque-esta-...", admin fixo) — armadilha no caminho de deploy manual. | Placeholders vazios que façam o boot falhar se não preenchidos. |
| BAIXO | `server/_core/index.ts:167-215` | Endpoints de PDF/XLSX de proposta buscam por ID sem checagem de propriedade (IDOR) — aceitável em single-tenant interno, mas sem controle por recurso. | Checar papel/escopo por recurso se o sistema virar multiusuário externo. |
| BAIXO | `server/_core/index.ts:260-289` | Handlers Express de export/import devolvem `err?.message` cru ao cliente. | Mensagem genérica + log interno. |

\* elevado a ALTO pela combinação root + `--no-sandbox` + conteúdo remoto não confiável (scraping).

## 4. Deploy, infraestrutura e operação

| Sev. | Onde | Crítica | Sugestão |
|---|---|---|---|
| CRÍTICO | `.github/workflows/deploy-vps.yml:10-11` | Deploy dispara em todo push no `main` **sem depender do CI passar** (workflows independentes) — código quebrado vai para produção. | `workflow_run` condicionado ao sucesso do CI, ou workflow único com `needs`. |
| CRÍTICO | `deploy-vps.yml:59-75` | SSH como **root com senha** (sshpass) + `StrictHostKeyChecking=no` — MITM pode capturar a senha root da VPS. IP/usuário/domínio hardcoded no YAML (`:31-33`). | Chave SSH dedicada (usuário deploy não-root) + known_hosts fixado + vars/secrets. |
| CRÍTICO | `scheduledJobs.ts:151` + `docker-compose.yml:56-60` | Backup automático grava `BACKUP_DIR` **dentro do container, sem volume** — todo `docker compose up --build` (todo deploy) apaga os backups. | Volume `backups_data:/app/backups` (ideal: cópia offsite). |
| CRÍTICO | pipeline de release | **Rollback inexistente**: rsync `--delete` + rebuild no host, sem registry, sem tag de imagem, sem release anterior; migrações forward-only com erros mascarados. O artefato que entra em produção nunca é o testado no CI, e o build na VPS compete por CPU/RAM com o app rodando. | Publicar imagem por SHA em registry (ghcr.io); deploy = pull + up; manter imagem anterior para rollback em 1 comando. |
| ALTO | `Dockerfile:1-38` | Single-stage: devDependencies inteiras + toolchain + Chromium na imagem final (estimativa > 2 GB). | Multi-stage (builder/runtime) + `pnpm prune --prod` + `USER node`. |
| ALTO | observabilidade | ~140 `console.*`, sem logger estruturado, sem Sentry, sem métricas, sem uptime externo. O commit de alertas de falha (captura/backup, 09ee520) foi **revertido 11 min depois sem justificativa** (ff400a0) — falhas em produção voltaram a ficar só no console. | Logger estruturado (pino) + Sentry + UptimeRobot no `/readyz`; reintroduzir os alertas ou registrar por que foram removidos. |
| ALTO | `scripts/backup-db.mjs` | Sem retenção/rotação, sem verificação de integridade (`gunzip -t`), sem teste de restauração, destino default no mesmo disco do banco. | Rotação (7 diários/4 semanais), verificação e restore drill documentado. |
| ALTO | `INSTALAR.bat:40-56` + `INICIAR.bat` | Fluxo Windows não cria `.env` nem configura MySQL; erros são engolidos (`2>nul`) e imprime "PRONTO!" mesmo sem banco; `INICIAR.bat:2` usa `>/dev/null` (sintaxe Unix em batch). | Ou consertar o fluxo Windows de ponta a ponta, ou removê-lo e assumir Docker/VPS como único caminho suportado. |
| MÉDIO | `docker-compose.yml` | Sem limites de memória: MySQL + Node + Chromium na mesma VPS — um scrape pesado pode causar OOM derrubando app e banco juntos. Sem staging em nenhum documento/workflow. | `mem_limit` por serviço; ambiente de staging mínimo. |
| MÉDIO | `.dockerignore` (5 linhas) | Não exclui `uploads/`, `backups/`, `docs/` nem variantes `.env.*` — um `.env.local` esquecido entra na imagem via `COPY . .`. | Ampliar para `.env*`, uploads, backups, docs. |
| MÉDIO | documentação vs realidade | `PRODEMGE_API_KEY` documentada como funcional mas nunca consumida pelo código; 14 variáveis `COMPANY_*` e `BUILT_IN_FORGE_*` usadas e não documentadas; `setup.sh:88` anuncia porta 5000 (real: 3000); `DEPLOY-CONTABO.md:96` instrui porta 3000 (default real: 80). | Reconciliar `.env.example`/README/docs com o código. |
| MÉDIO | `scripts/vps-bootstrap.sh:88-97` | Senha do admin persistida em texto plano em `/root/s2licit-acesso.txt` indefinidamente. | Instruir remoção pós-primeiro-login ou expirar o arquivo. |

## 5. Backend — correção, jobs e performance

| Sev. | Onde | Crítica | Sugestão |
|---|---|---|---|
| ALTO | `scheduledJobs.ts:171` + `emailInboxService.ts:66-69` | Sync IMAP a cada 15 min sem guard de sobreposição e ImapFlow sem timeouts — servidor IMAP travado acumula execuções e conexões indefinidamente. | Flag de execução (como `runningConfigIds` do scraper) + `socketTimeout`/`greetingTimeout`. |
| ALTO | `jobs/importBatchJob.ts:344-348` | Auto-vinculação de imagens consulta sempre os mesmos 10 primeiros produtos do lote dentro do loop — N+1 e matches errados para lotes > 10. | Carregar os produtos do lote uma vez, sem limit. |
| ALTO | `scraperEngine.ts:987-1006` | Cada execução carrega todos os produtos com EAN do banco inteiro + todo o catálogo do fornecedor em memória — escala linearmente por execução diária. | Consulta em lote (`inArray` dos EANs raspados) ou cache com TTL. |
| ALTO | quadruplicação de similaridade | 4 implementações divergentes de fuzzy matching (`matching/productMatcher.ts`, `deduplicationEngine.ts`, `db/importDuplicates.ts`, `jobs/importBatchJob.ts:351-392` — esta com bug: prefixo -1 do `findIndex` penaliza o melhor caso do Jaro-Winkler) e 3 `normalizeText` com regras diferentes — decisões de dedupe inconsistentes conforme o fluxo. | Consolidar tudo em `matching/` e importar. |
| MÉDIO | `scheduledJobs.ts:115-143` | Scrapers disparam só no tick de minuto exato (`scheduleTime === hhmm`): tick atrasado = fornecedor não roda no dia, sem registro. | Janela: `lastRunAt < hoje && scheduleTime <= hhmm`. |
| MÉDIO | `scraperEngine.ts:1269-1285` | Lock em `Set` de memória (não sobrevive a multi-instância) e sem teto de duração — `MAX_PAGES=1000` × 2,5 s pode segurar lock e Chromium por horas. | `GET_LOCK` MySQL ou coluna `runningSince` + timeout global. |
| MÉDIO | `priceImportService.ts:71-85,134-143,305-325` | Detecção de fornecedor por inicial de 1 letra casa qualquer arquivo; LIKE sem `escapeLike` (`%`/`_` viram curinga; helper existe) com `.limit(1)` sem ranking; recupera ID por nome ignorando `insertId` (corrida + produto errado com nomes repetidos). | Initials ≥ 3 chars; `escapeLike` + ranking; usar `insertId`. |
| MÉDIO | `server/db/products.ts:27` (padrão em `db/*`) | `if (!db) return []` — banco indisponível vira "catálogo vazio" bem-sucedido para o usuário. | Lançar `INTERNAL_SERVER_ERROR` quando o pool não existe fora de dev. |
| MÉDIO | `routers/enrichmentGroup.ts:78-124,841-869` | Loops seriais de LLM dentro de mutations tRPC (requests de minutos); timeout aborta no meio deixando escrita parcial. | Mover para o padrão de job assíncrono já existente (queueId + polling). |
| MÉDIO | `matching/productMatcher.ts:486` | `parseEditalItemText` retorna só a primeira palavra como nome do item do edital — degrada o critério de 40 % do score de matching. | Retornar o texto sem os tokens já classificados. |
| MÉDIO | fronteira de camadas | Routers acessam Drizzle direto em uns fluxos, `server/db/*` em outros, `services/*` em outros; `db.ts` é barrel de 35 `export *` (colisão silenciosa). | Padronizar router → service → db; exports nomeados. |
| MÉDIO | `db/importDuplicates.ts:44-58,170-173` | Jaro-Winkler de cada linha contra o catálogo inteiro, recarregando o catálogo a cada lote de 100 (~30 SELECTs numa importação de 3.000 linhas). | Carregar uma vez por job + bucketing por primeira palavra. |
| BAIXO | `db/_client.ts:10-33` | `getDb` sem mutex (boot concorrente pode criar 2 pools); `resetDb` deprecated ainda em uso; `getDb` retorna `null` silencioso sem DATABASE_URL. | Memoizar a Promise; falhar ruidosamente fora de dev. |

## 6. Frontend

| Sev. | Onde | Crítica | Sugestão |
|---|---|---|---|
| ALTO | `pages/Produtos.tsx` (2.896 linhas, 82 useState, 38 `as any`), `PropostaEditor.tsx` (1.905), `ImportarPlanilha.tsx` (1.776), `ImportarEdital.tsx` (1.279) | Os 4 monólitos concentram exatamente o fluxo crítico da operação; qualquer setState re-renderiza a página inteira; impossíveis de testar/revisar. | Extrair modais/painéis/etapas para arquivos próprios; filtros em reducer/URL. |
| ALTO | `pages/BuscaRapida.tsx:358`, `Comparacao.tsx:108` | Queries principais sem tratamento de `error`: falha de rede = **tela em branco silenciosa** na busca (coração da operação). | Estado de erro visível com "tentar novamente". |
| ALTO | 13 ações destrutivas com `confirm()` nativo (Produtos, Fornecedores — "Todos os produtos serão removidos", Usuarios, Sinonimos, Propostas, Equivalencias, Scraper...) | Bloqueante, sem detalhe do que será perdido, suprimível pelo navegador; o `AlertDialog` do shadcn existe e quase não é usado. | Padronizar em `AlertDialog` com descrição do impacto. |
| ALTO | 20+ modais artesanais `div fixed inset-0` | Sem focus trap, sem Esc, sem `aria-modal`; caso pior: `CheaperSimilarModal` (`BuscaRapida.tsx:155-229`) só fecha executando a ação. | Migrar para `Dialog` do Radix já instalado. |
| ALTO | tripla identidade visual | Shell "Verdelimp azul" com hex hardcoded (`AppLayout.tsx:51-53`), estilo editorial "its-*" nas páginas, tokens shadcn indigo — três cores primárias disputando. Dark mode é código morto inalcançável (definido, toggle existe, mas não montado e páginas com cores hardcoded). | Eleger uma paleta única em CSS vars; remover ou completar o dark mode — não deixar meio-termo. |
| ALTO | acessibilidade | 259 `<label>` nas páginas, só 13 com `htmlFor` — inputs sem associação programática. | `Label` do shadcn com `htmlFor`/`id`. |
| MÉDIO | listas paginadas sem `placeholderData: keepPreviousData` (0 usos) | Cada mudança de página/filtro derruba a tabela para loading — flicker constante na tela mais usada (`Produtos.tsx:1035`, que também usa `as any` no input da query principal). | `placeholderData: (prev) => prev` + tipar com `RouterInputs`. |
| MÉDIO | formatação pt-BR | 4+ formatadores de moeda duplicados e casos errados (`toFixed(2)` exibindo "R$ 1234.56" em `PriceImportComponent.tsx:381`, `ImportarEdital.tsx:421`; string crua do banco em `ImportarPlanilha.tsx:1049`). | `lib/format.ts` único com `Intl.NumberFormat("pt-BR")`. |
| MÉDIO | `patches/wouter@3.7.1.patch` | Injeta `window.__WOUTER_ROUTES__` — **zero consumidores no repositório**; efeito colateral no render, prende à versão exata, expõe mapa de rotas (incl. `/admin/*`) a qualquer script. | Remover o patch e o `patchedDependencies`. |
| MÉDIO | performance | recharts estático no Dashboard (rota `/`); zero virtualização (BuscaRapida/Comparacao renderizam todos os resultados); `refetchInterval` incondicional em 2 páginas; agregações recalculadas em todo render em BuscaRapida. | Lazy-load de gráficos; virtualizar > 200 linhas; `refetchInterval` condicional; `useMemo`. |
| BAIXO | `AppLayout.tsx:145-153,241-242` | Item ativo/título por `startsWith`: `/importar-nfe` acende também "Importar planilha". | Comparar por segmento. |
| BAIXO | `index.css:262-265` | `.flex { min-height: 0; min-width: 0 }` sobrescreve a utility global do Tailwind para todo o app — comportamento invisível que vai morder qualquer dev. | Remover; aplicar `min-w-0` pontualmente. |
| BAIXO | fontes Google via `@import` + logo em CloudFront externo | Bloqueia render e depende de rede externa num sistema auto-hospedado. | Self-host das fontes e do logo. |

## 7. Testes e qualidade contínua

599 testes verdes é um ativo real, mas a cobertura é enviesada para funções
puras:

| Sev. | Onde | Crítica | Sugestão |
|---|---|---|---|
| ALTO | `vitest.config.ts:17-22` | `include` não contém `scripts/**` — `scripts/migrate-production.test.ts` existe e **nunca roda** (65 arquivos no disco, 64 executados). O único teste do pipeline de migração de produção está morto. | Adicionar `scripts/**/*.test.ts` ao include. |
| ALTO | lacunas de cobertura | ~45 dos 55 routers sem teste; `server/db/*` (~40 arquivos de queries) com 0 testes; zero teste contra MySQL real (migrações nunca exercitadas no CI); client com 2 testes de lógica pura, zero componente/E2E; Puppeteer/e-mail/WhatsApp/jobs sem teste. | Priorizar: teste de integração com MySQL efêmero no CI (migrações + queries críticas) e smoke E2E do fluxo colar itens → proposta → exportar. |
| BAIXO | `eslint.config.js:20-23` | Única regra ativa é `unused-imports` — "lint verde" no CI não verifica correção nem segurança. | Habilitar `typescript-eslint` recommended (gradual). |
| BAIXO | `tsconfig.json:3` | `exclude: ["**/*.test.ts"]` deixa os testes fora do `pnpm check`. | Incluir testes no typecheck. |

---

## Plano de ação sugerido (priorizado)

**Rodada 1 — estancar risco de perda de dados e produção (1–2 dias de esforço):**
1. Backup: volume Docker para `BACKUP_DIR` + rotação/verificação (§4).
2. Deploy condicionado ao CI + chave SSH sem root (§4).
3. Corrigir `merge-duplicates.mjs` (tabela inexistente) e congelar
   `rebuild-categories-v2.mjs` até ter dry-run/backup (§2).
4. `db.audit.ts` derivado do schema (§2) e `vitest.config` incluindo
   `scripts/**` (§7).

**Rodada 2 — regra de negócio das 4 camadas (1 semana):**
5. Consolidar o custo de fornecedor numa única tabela de ofertas; parar toda
   escrita em `products.price` a partir de importação/scraper (§1).
6. `db.transaction` em merge, import e criação de proposta; redirecionar
   ofertas/histórico no merge (§2).
7. Remover autovalidação da IA (`completo_validado`) e o overwrite de campos
   curados no import (§1).

**Rodada 3 — operação e experiência (2–3 semanas, incremental):**
8. Logger estruturado + Sentry + uptime externo; reintroduzir alertas de
   falha de captura/backup (§4).
9. Helmet, limite JSON 2 MB, usuário não-root no Docker + multi-stage,
   allow-list no Puppeteer (§3).
10. Frontend: estado de erro na busca, `AlertDialog` nas 13 ações
    destrutivas, `keepPreviousData` nas listas, quebrar `Produtos.tsx` (§6).
11. Unificar identidade visual (uma paleta) e decidir o destino do dark mode
    e do patch do wouter (§6).
12. Teste de integração com MySQL efêmero no CI + smoke E2E do fluxo de
    cotação (§7).

## Pontos positivos (registrar o que já está bom)

- CI completo (tsc + lint + 599 testes + build) em todo push/PR, tudo verde.
- Autenticação madura: scrypt + salt, lockout 5/15min, mensagens uniformes,
  MFA TOTP, RBAC hierárquico, revogação por conta desativada.
- Zero SQL injection: todo SQL cru do Drizzle parametrizado; XXE não
  explorável; uploads com fileFilter/limites e path traversal tratado.
- Compose bem configurado: MySQL só em 127.0.0.1, healthchecks reais
  (`/readyz` exige DB), `MYSQL_PWD` fora da linha de comando.
- `vps-bootstrap.sh` idempotente, segredos gerados com `openssl rand`,
  `.env` com chmod 600, convivência Nginx/Caddy tratada.
- `migrate-production.mjs` com lock nomeado MySQL (GET_LOCK).
- Schema com 0 float em dinheiro (125 decimal), 247 índices, 116 FKs.
- Frontend: lazy-loading por rota, ExcelJS sob demanda, react-query com
  defaults maduros, redirect central de 401, importação com progresso e
  cancelamento.
