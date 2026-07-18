# Avaliação de usabilidade — Sistema S2 pelos olhos de um leigo (Julho/2026)

> **Status (atualizado no mesmo PR):** as críticas deste parecer foram
> corrigidas em 4 lotes de commits — ver a seção
> [Status das correções](#status-das-correções) no fim do documento.
> O escopo do sistema foi confirmado como **multissegmento**: cotações de
> produtos diversos (medicamentos veterinários e humanos, materiais de
> construção, insumos e equipamentos) — o viés "farmácia veterinária" foi
> removido dos prompts de IA e dos textos.

Simulação de primeiro uso: um usuário inteligente, mas **sem manual, sem
treinamento e sem conhecimento técnico**, recebe o S2 e tenta operá-lo de
ponta a ponta. Cada achado tem referência `arquivo:linha` verificada em
código. Complementa (não repete) a auditoria técnica de
`docs/ANALISE-SISTEMA-2026-07.md`.

---

## Sumário executivo

O S2 é um sistema **poderoso operado por especialista, vestido de produto
simples**. A infraestrutura de backend é sólida (retry, guardas de jobs,
diagnóstico com ações em português), os estados vazios em geral orientam o
próximo passo, e o fluxo edital → proposta "em 1 clique" é genuinamente bom.
Mas um leigo de primeira viagem trava em quatro paredes:

1. **Não existe "comece por aqui".** Sem onboarding, sem wizard, sem
   checklist. O primeiro login cai num painel executivo com ~30 links e um
   indicador **"100% saudável" com o banco vazio** (`Dashboard.tsx:324-330`).
2. **Funções essenciais estão escondidas ou duplicadas.** Motor Tributário,
   Custo Total, Precificação em Massa, Comparação e Templates de Proposta
   **não estão no menu**; enquanto isso há 4 telas de "captura", 3
   importadores de planilha, 2 cadastros de credencial de fornecedor e 2
   buscas concorrentes.
3. **A linguagem é de desenvolvedor/especialista.** "Seletores CSS",
   "Jaro-Winkler", "Master Products", "DIFAL/ICMS-ST/FCP", "IMAP/SMTP",
   "MFA" — sem glossário nem ajuda contextual.
4. **Há armadilhas que produzem erro real de negócio:** três telas de preço
   usam **três fórmulas diferentes de margem/markup**; o PDF da proposta sai
   com **endereço e conta bancária hardcoded de outra empresa**; a
   reclassificação por IA **grava em massa sem revisão**.

Veredito: um leigo consegue *navegar*, mas **não consegue operar o ciclo
completo sozinho com segurança**. As correções são majoritariamente de
produto/UX, não de engenharia pesada.

---

## 1. Primeiro contato — instalação e primeiro login

**O que funciona:** `LEIA-ME.txt` tem a melhor linguagem para leigo de todo
o projeto ("digite nodejs.org", "botão verde LTS", "NÃO feche a tela preta
enquanto usar!"). `INSTALAR.bat` trata a ausência do Node com instrução
amigável.

**Onde o leigo trava:**

| Problema | Onde | Efeito |
|---|---|---|
| `INICIAR.bat` abre fixo `localhost:3000`, mas o servidor procura porta livre 3000→3020 (`server/_core/index.ts:40-44`) | `INICIAR.bat:20` | Porta 3000 ocupada → navegador abre tela em branco, sem explicação |
| MySQL é pré-requisito e **não é citado** no LEIA-ME nem instalado pelos .bat | `LEIA-ME.txt`, `INSTALAR.bat` | Sistema sobe "funcionando" sem banco; telas mostram listas vazias em vez de erro (`server/db/products.ts:27`) |
| `pnpm dev` (servidor de desenvolvimento) é apresentado como modo definitivo de uso | `INICIAR.bat` | Operação diária em modo frágil e lento |
| `mysqldump` não garantido no Windows | `backupService.ts:137` | Backup automático falha e o aviso só vai para log/WhatsApp, nunca para uma tela |
| Não existe cadastro: o admin nasce de `ADMIN_EMAIL/ADMIN_PASSWORD` no boot | `Login.tsx` | Adequado a ERP interno, mas exige que alguém técnico entregue as credenciais |

**Primeiro login:** nenhum tour, wizard ou checklist (busca por
`onboarding|wizard|tour|bem-vindo` em `client/src` = zero resultados). O
usuário cai na "Central de Operações" com 7 CTAs no topo, painel de
autodiagnóstico com botões destrutivos ("Reset Jobs Travados", "Limpar
Erros (+30d)" — `Dashboard.tsx:504-512`) e um hub com ~30 links
(`Dashboard.tsx:1004-1025`). Com base vazia, o `healthScore` cai no ramo
`catalogTotal > 0 ? … : 100` e exibe **"100% saudável"** — informação falsa
que desorienta ("está tudo pronto?" não está).

---

## 2. Navegação e rotas

Menu: **7 grupos / 34 itens** para admin (`AppLayout.tsx:72-142`). A ordem
segue o fluxo real (comentário em `AppLayout.tsx:67-71`), mas isso nunca é
comunicado ao usuário.

### 2.1 Jargão nos rótulos do menu
"Equivalências", "Enriquecimento", "Captura multi-origem", "Revisão de
capturas", "Radar PNCP", "Segurança (MFA)", "Habilitação", "Certidões",
"Agente de proposta" — nenhum autoexplicativo para leigo. Rótulos bons:
Dashboard, Agenda, Produtos, Fornecedores, Propostas, Financeiro.

### 2.2 Rotas órfãs (existem, funcionam, mas não estão no menu)
Só alcançáveis por URL direta ou link incidental — **funcionalidade paga
que não é descoberta**:

- `/tributos` — Motor Tributário (`App.tsx:96`)
- `/custo-total` — Custo Total & Fretes (`App.tsx:97`)
- `/aplicar-precificacao` — Precificação em massa (`App.tsx:151`)
- `/comparacao` — Comparação de preços (`App.tsx:107`)
- `/templates-proposta` — Templates (só atalho no Dashboard, `Dashboard.tsx:128`)
- `/diligencias` — Diligências, impugnações e recursos (`App.tsx:209`)
- `/sinonimos`, `/qualidade`, `/regras-categoria`, `/historico-enriquecimento`,
  `/reclassificacao`, `/enriquecimento-nfe`, `/admin/database-health`,
  `/categorias`, `/agente`, `/busca`

### 2.3 O mesmo destino tem nomes diferentes (colisão de rótulos)
- `/scraper-fornecedores`: menu = "Captura automática"; Dashboard = "Agente
  de preços" (`Dashboard.tsx:146,396`).
- `/captura-inteligente`: menu = "Captura multi-origem"; Dashboard =
  **"Captura automática"** (`Dashboard.tsx:147`) — ou seja, "Captura
  automática" significa **duas telas diferentes** dependendo de onde se lê.
- `/central-ia`: "Inteligência artificial" × "Central de IA";
  `/portais-licitacao`: "Portais de licitação" × "Acessos aos portais".

### 2.4 Fluxo de criação de proposta ambíguo
O botão **"Criar proposta →"** do Dashboard (`Dashboard.tsx:790`) leva a
`/proposta-rapida`, que **redireciona para `/edital`** (Importar edital) —
enquanto o CTA "Nova Proposta" do topo (`Dashboard.tsx:363`) vai para
`/propostas`. Dois botões de "criar proposta", dois destinos diferentes. O
próprio comentário `Dashboard.tsx:88-90` ("rotas canônicas, sem redirects")
é violado 8 vezes na mesma página (`Dashboard.tsx:415,723-814`).

### 2.5 Duas buscas, nenhuma no menu
- **Busca Global** (`/busca-global`): todas as entidades; só descoberta pela
  lupa da topbar (`AppLayout.tsx:376-388`).
- **Busca Rápida** (`/busca`): menor preço de produto; só descoberta pelo
  Dashboard (`Dashboard.tsx:109,400`).

Nomes quase idênticos, entradas diferentes, sobreposição em produtos. O
leigo provavelmente nunca descobre a Busca Rápida — que é justamente a
ferramenta central da operação de cotação.

---

## 3. Fluxos principais — onde o leigo trava

### 3.1 Trazer uma oportunidade (4 portas sem hierarquia)
Radar PNCP, Cotações recebidas, Importar edital e Portais são 4 entradas
concorrentes sem um "comece por aqui". Pontos específicos:

- **Pré-requisito invisível nº 1: o catálogo.** Todo o valor do Importar
  Edital é o match com o catálogo; com catálogo vazio tudo vira "Sem match"
  e nada avisa antes.
- **Cotações recebidas exige variáveis de ambiente** (`IMAP_HOST`,
  `IMAP_USER`, `IMAP_PASSWORD` — `CotacoesRecebidas.tsx:87-88`). Leigo não
  configura env no servidor. Não há UI para isso.
- Radar → "Enviar ao Funil" (`RadarPncp.tsx:242`) leva ao Funil, não à
  proposta; o caminho até a proposta é indireto e não explicado.
- Link morto: banner "Voltar às Licitações" é um `<a>` sem `href`
  (`ImportarEdital.tsx:840-844`).
- Ponto forte: a tela de edital ensina a si mesma com 3 cards ("1. Envie o
  edital / 2. IA extrai os itens / 3. Proposta em 1 clique",
  `ImportarEdital.tsx:1254-1266`).

### 3.2 Precificação — o risco mais grave do sistema
**Três telas, três fórmulas conflitantes com o mesmo nome de campo:**

| Tela | Rótulo | Fórmula real |
|---|---|---|
| `ImportarEdital.tsx:906-923` | "Margem s/ venda (%)" | `preço = custo ÷ (1 − margem)` (com aviso "não confundir com markup") |
| `AplicarPrecificacao.tsx:56,109` | "Margem de Lucro (%)" | `preço = custo × (1 + margem)` — **isto é markup** |
| `PropostaEditor.tsx:1122,1152` | "Markup" | `custo × (1 + markup)` |

Um leigo que digitar "30" nas três telas obterá três preços diferentes —
numa licitação, isso é prejuízo ou desclassificação. Agrave-se: 4 das 5
telas de preço (Tributos, Custo Total, Aplicar Precificação, Comparação)
estão fora do menu, e a dependência Custo Total ← Motor Tributário é
silenciosa (sem regra tributária, impostos = 0 e o "PISO" fica irreal,
`CustoTotal.tsx:128`).

### 3.3 Proposta — dados de terceiros no PDF
O editor de proposta imprime no rodapé do PDF **endereço e dados bancários
hardcoded** ("Rua 1 de Janeiro, 415 — Betim/MG", "Banco do Brasil /
Agência: 750-1 / Conta: 126941-0" — `PropostaEditor.tsx:1410,1420-1422`).
Qualquer outro usuário envia proposta oficial com dados errados **sem
aviso**. Esses dados deveriam vir exclusivamente de "Dados da empresa"
(`/configuracao`). Outros pontos:

- Templates pré-preenchem impostos/frete/declarações, mas a tela está fora
  do menu — o leigo cria propostas a vida toda sem saber que templates
  existem.
- Inconsistência: botão importa "4 templates padrão (Federal, Estadual,
  Municipal e **Venda Direta**)" mas os presets são "Prefeitura / Estadual /
  Federal / **Cliente Privado**" (`TemplatesProposta.tsx:89-146,570`).
- Bom: exportação de PDF bloqueada explica o motivo item a item
  (`PropostaEditor.tsx:795,972`).

### 3.4 Captura e importação — excesso estrutural
O grupo "Fornecedores e captura" tem **7 itens** e é o mais confuso:

- **4 telas de captura** (Captura automática, Captura multi-origem, Revisão
  de capturas, Acessos e credenciais) sem explicação navegável da relação
  capturar → revisar → aplicar.
- **Scraper × Configurador cadastram a mesma coisa** (fornecedor + tipo de
  scraper + credencial + horário; já mapeado em
  `docs/AUDITORIA-CONSOLIDACAO.md`). O Configurador aceita só 3 fornecedores
  fixos (Tambasa/Cristália/Ourofino — `ConfiguradorFornecedores.tsx:196-199`).
- **3 importadores de planilha**: `/importar`, aba "Importar Preços" de
  `/importar-nfe` e aba "Planilha/CSV" da Captura multi-origem.
- **Jargão de desenvolvedor na tela**: o scraper personalizado pede
  "seletores CSS… botão direito → Inspecionar"
  (`ScraperFornecedores.tsx:190-193`); a Captura multi-origem exibe texto de
  changelog ("O parser XML foi ajustado para remover BOM… eliminando o erro
  'Non-whitespace before first tag'" — `IntelligentCaptureCenter.tsx:380`);
  a importação mostra "algoritmo fuzzy (Jaro-Winkler)… base mestre"
  (`ImportarPlanilha.tsx:1098`) e "Master Products" (`ImportarNfe.tsx:83`).
- Undo de lote só vale "enquanto esta sessão permanecer aberta"
  (`CaptureReview.tsx:333`).

### 3.5 Catálogo
- **Produtos com catálogo zerado não orienta**: a única mensagem é a de
  filtro ("Nenhum produto encontrado com os filtros aplicados",
  `Produtos.tsx:1672`) — deveria dizer "Importe sua primeira planilha".
- Enriquecimento duplicado: página `/enriquecimento` + modal dentro de
  Produtos (`Produtos.tsx:2059-2066`).
- Campos "(legado)" expostos no mapeamento ("EAN/GTIN (legado)" —
  `ImportarPlanilha.tsx:153-154`) só confundem usuário novo.
- Opção destrutiva com explicação entre parênteses: "Substituir produtos
  existentes deste fornecedor" (`ImportarPlanilha.tsx:882`).

---

## 4. Design

- **Três identidades visuais disputando**: tokens `oklch` completos em
  `index.css:7-116` (indigo, com dark mode inteiro) × shell "Verdelimp
  azul" com hex fixos (`#2e3c55`, `#e05008` — `AppLayout.tsx:51-53`) × hex
  literais no Login/Dashboard (`#1A3F8F` — `Login.tsx:53-60`,
  `Dashboard.tsx:334`).
- **Dark mode é código morto**: variáveis definidas, nenhum toggle montado,
  e as telas principais não responderiam por usarem hex fixos
  (`App.tsx:322`).
- **Tipografia minúscula**: uso massivo de `text-[9px]`/`text-[10px]`/
  `text-[11px]`; rótulos de grupo do menu em `fontSize: 9` com
  `rgba(255,255,255,.3)` sobre azul escuro (`AppLayout.tsx:234-235`) —
  reprova contraste WCAG AA e pune leigos e baixa visão.
- **Acessibilidade parcial**: Login correto (`htmlFor`, `role="alert"`),
  mas buscas sem label (`BuscaGlobal.tsx:44-50`) e tooltip caseiro só com
  `onMouseEnter` — invisível por teclado (`Dashboard.tsx:205-217`).
- **Três padrões de loading coexistem** (barra pulsante, skeleton, spinner)
  sem regra.
- Responsividade razoável (sidebar mobile com overlay), mas tabelas densas
  + fontes de 9px sofrem em telas pequenas.

---

## 5. IA

**O que existe de verdade:** um núcleo único (`server/_core/llm.ts`) com
failover Anthropic/Groq/Forge; enriquecimento de ficha técnica;
reclassificação em lote; agente conversacional **somente-leitura** com 12
ferramentas (`server/routers/agente.ts:30-190`); agente de proposta com
Puppeteer que loga em portais e preenche a proposta; extração de
editais/cotações PDF/DOCX.

**Problemas para o leigo:**

1. **Custo invisível.** O campo `usage` da resposta do LLM existe
   (`llm.ts:94-98`) e **nunca é lido nem exibido**. "Enriquecer Tudo
   Automaticamente" ou reclassificar 30 mil produtos roda sem qualquer
   noção de gasto.
2. **Human-in-the-loop inconsistente.** Enriquecimento exige "Aplicar"
   (bom); NF-e não grava dado clínico incerto (bom,
   `NfeEnrichmentPipeline.tsx:68`); mas a **Reclassificação IA grava
   direto no banco em massa** sem revisão item a item nem confirmação
   (`enrichmentGroup.ts:290-294,453`), e a IA se autopromove a
   `completo_validado` com `confidence > 0.7` (`enrichmentGroup.ts:805`).
3. **Erros engolidos em lote**: `catch (_) { errors += batch.length }`
   (`enrichmentGroup.ts:298,458,585`) — o usuário vê só um contador
   "erros: N" sem saber quais produtos nem por quê.
4. **Sem aviso preventivo nas telas de trabalho**: se a chave de IA não
   está configurada, o usuário só descobre **depois** de clicar, via toast
   com mensagem crua do backend (`EnriquecimentoCatalogo.tsx:395`,
   `Agente.tsx:61`). A Central de IA (`CentralIA.tsx:47-52,89-93`) trata
   bem — mas é tela de admin.
5. **Quatro "IAs" com nomes confusos**: "Assistente IA" (`/agente`),
   "Agente de proposta", "Agente de preços" (scraper) e "Central de IA".
   Leigo não distingue.
6. Ponto forte: o agente de proposta recomenda modo rascunho, detecta
   CAPTCHA e **exige intervenção humana** (`propostaAgent.ts:22-60`) — mas
   ainda oferece "Enviar diretamente" numa proposta real, risco alto na mão
   de leigo.

---

## 6. Confiabilidade (visão do usuário)

**Sólido por baixo:** crons com validação e guarda de sobreposição
(`scheduledJobs.ts`), retry/backoff e log de chamadas nos conectores
(`baseConnector.ts:94-104`), guard anti-HTML no tRPC
(`_core/index.ts:306-317`), boot fail-fast em migração, backup diário com
retenção de 14 dias.

**Frágil por cima (o que o leigo vê):**

- **Falha de banco vira "lista vazia"**: o padrão `if (!db) return []`
  transforma indisponibilidade em "0 resultados" bem-sucedidos
  (`server/db/products.ts:27`, `enrichmentGroup.ts:71,127`).
- **Mensagens técnicas cruas em toasts**: "Falha ao consultar o Radar: " +
  `error.message` (`RadarPncp.tsx:82`); "Erro: " + `error.message` em todos
  os handlers do Configurador (`ConfiguradorFornecedores.tsx:39-73`).
- **Falha parcial mascarada**: busca multi-fonte do Radar não diz qual
  fonte caiu.
- **Nenhuma UI de operação**: não há botão "Fazer backup agora",
  "Restaurar", nem painel para ver/ligar/desligar jobs — tudo por env e
  log de container.
- **Logs (`/logs`) é trilha de auditoria, não diagnóstico**: não existe
  tela de erros de aplicação/IA/scraper.
- **O Diagnóstico (`/diagnostico`) é a melhor peça de UX do sistema** —
  semáforo por categoria com campo "Ação" em português ("Importe o
  catálogo em Catálogo → Importar planilha", `diagnostico.ts:158`). Porém
  várias ações mandam o leigo "executar o Deploy VPS" ou "cadastrar no
  GitHub" (`diagnostico.ts:75,246`) — impossível sem um técnico, o que
  admite que a operação real do S2 pressupõe suporte técnico permanente.

---

## 7. Manual e ajuda

- **O Manual (`/manual`) é um mapa de fluxo, não um manual.** 6 passos bons
  (Captar → Funil → Proposta → Habilitar/Disputar → Executar → Gerir), mas:
  - **Não cobre** Produtos, Fornecedores, Equivalências, Importar planilha,
    Configuração da empresa, Usuários, MFA, Logs — o catálogo, coração do
    sistema, não é citado.
  - **Jargão sem glossário**: "GO/NO-GO", "SRP", "habilitação", "Sala de
    Disputa" (`Manual.tsx:35`).
  - Sem screenshots, sem vídeo, sem passo a passo de tela.
  - O próprio Manual admite os módulos órfãos: "Estas rotas foram
    preservadas por compatibilidade…" (`Manual.tsx:209-212`).
- **Ajuda contextual quase inexistente**: zero links "Saiba mais"; tooltips
  reais raros; as poucas caixas informativas boas estão nas telas de IA
  (`EnriquecimentoCatalogo.tsx:666-673`, `AgenteProposta.tsx:413-423`).
- O Manual é passivo: ninguém é levado a ele no primeiro acesso.

---

## 8. Áreas de atuação

O sistema é declarado genérico ("licitações e cotações"), mas o DNA é
**medicamentos/produtos veterinários**: prompts de IA dizem "Você é um
especialista em farmácia veterinária" (`enrichmentGroup.ts:24`), o domínio
usa princípio ativo/MAPA/classe terapêutica, a comparação é por princípio
ativo, e os scrapers fixos são distribuidores do ramo. Para atuar em outros
segmentos de licitação (limpeza, insumos, equipamentos), o matching por
princípio ativo e os prompts precisariam de parametrização por segmento —
hoje um leigo de outro ramo veria campos irrelevantes ("Princípio Ativo",
"MAPA") sem entender por quê.

---

## 9. O que está SOBRANDO (consolidar ou remover)

1. 4 telas de captura → 1 fluxo com etapas (fontes → execução → revisão).
2. Scraper × Configurador de fornecedores → 1 cadastro único de credencial.
3. 3 importadores de planilha → 1 importador com destino selecionável.
4. Enriquecimento em página + modal → um só ponto.
5. Busca Global × Busca Rápida → uma busca com abas (ou a Rápida embutida
   na Global).
6. 2 caminhos de seed de templates ("Usar Modelo Pronto" × "Importar Todos").
7. Rotas-redirect legadas ainda referenciadas pelo próprio Dashboard.
8. Campos "(legado)", textos de changelog e termos internos na UI.
9. 8 famílias de routers de preço sobrepostos (já mapeado em
   `AUDITORIA-CONSOLIDACAO.md`) sustentando 5 telas fragmentadas.
10. Dark mode meio-construído (decidir: completar ou remover).

## 10. O que está FALTANDO

1. **Onboarding ativo**: wizard/checklist de primeiro uso (Dados da empresa
   → Tributos → Importar catálogo → Template de proposta → Primeira
   oportunidade), com progresso persistente no Dashboard enquanto
   incompleto.
2. **Uma única definição de margem** aplicada em todas as telas, com
   simulador ("custo 100 + 30% ⇒ preço X") ao lado do campo.
3. **Dados da empresa no PDF vindos de `/configuracao`** — nunca hardcoded.
4. **Configuração de e-mail (IMAP/SMTP) pela UI** com "testar conexão" —
   hoje só por variável de ambiente.
5. **Glossário + tooltips** nos termos de licitação e do sistema (DIFAL,
   SRP, habilitação, match, enriquecimento…), com link "como funciona" por
   tela apontando para a seção do Manual.
6. **Visibilidade de custo de IA** (tokens/R$ por operação e acumulado) e
   confirmação com prévia antes de qualquer gravação em massa.
7. **Painel de operação para não-técnico**: status dos jobs com última
   execução, botão "Backup agora", lista de erros recentes legível.
8. **Padronização de erros**: mensagem humana + "tentar novamente" +
   detalhe técnico recolhido (nunca `error.message` cru em toast).
9. **Estados vazios com CTA em todas as telas-chave** (prioridade:
   Produtos, Análise de preços).
10. **Frete/transportadoras** — declarado pendente na própria UI
    (`CustoTotal.tsx:235`): concluir ou retirar a promessa da tela.
11. **Manual completo** (cobrir catálogo, fornecedores e administração) com
    capturas de tela, e oferecido no primeiro login.
12. **Correção dos .bat**: porta dinâmica, verificação de MySQL, modo
    produção.

---

## 11. Plano priorizado

**Rodada 1 — eliminar risco de erro real do usuário (dias):**
1. Unificar fórmula/nomenclatura de margem nas 3 telas (§3.2).
2. PDF da proposta lendo dados da empresa de `/configuracao` (§3.3).
3. Confirmação com prévia na Reclassificação IA em massa; remover
   autovalidação `completo_validado` (§5).
4. `INICIAR.bat` com porta real; LEIA-ME citando MySQL (§1).
5. `healthScore` honesto com base vazia (§1).

**Rodada 2 — descoberta e navegação (1–2 semanas):**
6. Levar ao menu (ou fundir) as órfãs: Tributos, Custo Total, Precificação,
   Comparação, Templates, Diligências (§2.2).
7. Unificar rótulos menu×Dashboard; corrigir os dois "criar proposta"
   (§2.3–2.4).
8. Checklist de primeiros passos no Dashboard (§10.1).
9. Fundir Scraper×Configurador e os 3 importadores (§9).
10. Uma busca única no topo, sempre visível (§2.5).

**Rodada 3 — linguagem e confiança (contínuo):**
11. Varredura de jargão na UI (CSS/Jaro-Winkler/Master Products/changelog)
    e glossário com tooltips (§10.5).
12. Padrão único de erro amigável + estados vazios com CTA (§10.8–10.9).
13. Custo de IA visível + aviso preventivo de IA não configurada (§5).
14. Painel de jobs/backup na UI; decidir destino do dark mode e da paleta
    única (§6, §4).

---

## O que já está bom (preservar)

- Diagnóstico com ações em português — referência de UX a replicar.
- Estados vazios orientativos na maioria das telas (Motor Tributário e
  Enriquecimento são exemplares).
- Fluxo edital → proposta "em 1 clique" com tutorial embutido na tela.
- Human-in-the-loop no enriquecimento e no agente de proposta (rascunho +
  CAPTCHA exige humano).
- Permissões (menu + rota) funcionando: usuário comum não vê o miolo
  administrativo.
- LEIA-ME.txt com a linguagem certa para o público leigo.
- Backend resiliente: retry, guardas de jobs, failover de IA, guard
  anti-HTML no tRPC.

---

## Status das correções

Implementadas neste mesmo branch, em 4 lotes (todos com `pnpm check`,
`pnpm lint`, `pnpm test` — 610 testes — e `pnpm build` verdes):

**Lote 1 — riscos reais de negócio**
- ✅ Fórmula de margem unificada (margem sobre a venda, divisor) nas 3
  telas; rótulos e exemplos ao vivo; validação de margem < 100%.
- ✅ Rodapé da proposta lê Dados da empresa (`/configuracao`); aviso com
  link quando não preenchido (fim do endereço/conta bancária hardcoded).
- ✅ IA não se autovalida mais (`completo_validado` exige revisão humana).
- ✅ Reclassificação/Migração em massa exigem confirmação com contagem.
- ✅ Erros de lote de IA retornam `errorMessages` e aparecem no log da tela.
- ✅ `INICIAR.bat` abre o navegador na porta real (arquivo `.port`);
  `INSTALAR.bat` falha ruidosamente sem `.env`/MySQL; LEIA-ME cita o banco.
- ✅ Dashboard: "sem produtos — importe o catálogo" em vez de "100% saudável".

**Lote 2 — navegação e descoberta**
- ✅ Órfãs no menu: novo grupo Preços e Tributos (Análise, Comparação,
  Precificação em massa, Motor tributário, Custo total), Diligências,
  Templates de proposta, Busca de menor preço.
- ✅ Rótulos unificados menu×Dashboard (fim da colisão "Captura automática").
- ✅ Dois botões "criar proposta" levam ao mesmo lugar (/propostas);
  Dashboard sem links para redirects.
- ✅ Checklist "Primeiros passos" no Dashboard (empresa → catálogo →
  impostos → template → 1ª oportunidade), dispensável.
- ✅ Fusões: Configurador de fornecedores → Captura automática de preços
  (redirect; página removida); aba "Importar Preços" da NF-e removida
  (caminho canônico: Importar planilha); botão de diagnóstico só p/ admin.

**Lote 3 — linguagem e multissegmento**
- ✅ Prompts de IA generalizados (vet + humano + construção + insumos).
- ✅ Jargão removido: changelog do parser XML, "Jaro-Winkler/base mestre",
  "Master Products", campos "(legado)", scraper personalizado marcado como
  configuração avançada com texto leigo.
- ✅ Link morto "Voltar às Licitações" corrigido; "Venda Direta"→"Cliente
  Privado"; promessa pendente removida do Custo Total.
- ✅ Manual reescrito: passo 0 de preparação, cobre catálogo/fornecedores/
  administração, glossário com 17 termos.

**Lote 4 — confiança, erros e acessibilidade**
- ✅ Consumo de IA visível (chamadas + tokens por provedor na Central de IA).
- ✅ Aviso preventivo "IA não configurada" nas 4 telas de IA.
- ✅ Backup na UI: status do último backup + botão "Fazer backup agora"
  (admin) no Diagnóstico.
- ✅ Erros humanizados (Radar, Assistente, Enriquecimento, Produtos) e
  estados vazios com CTA (Produtos, Análise de preços).
- ✅ Acessibilidade: contraste/tamanho do menu (AA), aria-label na busca,
  tooltip por teclado; texto do IMAP em linguagem leiga; "AES-256" vira
  "senha criptografada".

**Pendências conscientes (fora do escopo desta rodada, mapeadas para o
futuro):** unificação total das 2 buscas numa tela só (ambas agora estão
expostas e nomeadas de forma distinta); configuração de e-mail (IMAP/SMTP)
por interface (hoje por variável de ambiente, com texto explicativo);
decisão final do dark mode e paleta única (tokens × hex do shell);
quebra dos 4 monólitos de frontend e fusão das famílias de routers de
preço (já mapeadas em `AUDITORIA-CONSOLIDACAO.md`).
