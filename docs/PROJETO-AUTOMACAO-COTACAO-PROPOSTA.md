# Projeto: automação cotação→proposta (e-mail + portais autenticados)

**Data:** 2026-08-10 · **Status:** implementado, com melhorias incrementais (v2)

## 1. Objetivo

Ler automaticamente os pedidos de cotação que chegam por **e-mail** e pelos
**portais** (Funarbe, Compras MG, FIEMG, Fundep, COPASA, CEMIG), reconhecer os
produtos cotados contra o catálogo e **gerar a proposta automaticamente**,
inclusive entrando nos portais **com o login e a senha cadastrados** no cofre.

## 2. Estudo de viabilidade — o que o sistema já tinha

| Capacidade | Situação anterior |
| --- | --- |
| Leitura IMAP da caixa de cotações | ✅ `emailInboxService` + cron a cada 15 min |
| Extração de itens (anexo XLSX/CSV/PDF/DOCX ou corpo) | ✅ `emailQuotationExtractor` |
| Matching produto×catálogo (CATMAS/CATMAT/nome) | ✅ `emailQuotationMatchingService` |
| Radar dos seis portais (murais públicos) | ✅ `s2PortalOpportunitySyncService`, 3×/dia |
| Cofre de credenciais (AES-256-GCM) | ✅ `portalCredentials` + `credentialEncryptionService` |
| Robô de portal com login (preenche proposta) | ✅ `propostaAgent` (assistido) |
| Geração do PDF de proposta + envio SMTP | ✅ `emailQuotationResponseService` |

**Conclusão da viabilidade:** a fundação existia; faltava exatamente o "auto".
A geração de proposta exigia confirmação humana de **todos** os itens, e o
radar de portais lia **apenas murais públicos** — nunca a área logada do
fornecedor.

## 3. O que este projeto implementou

### 3.1 Pipeline automático cotação→proposta (`quotationAutoPipelineService`)

1. **Auto-confirmação de matches** — itens com match determinístico por código
   (CATMAS/CATMAT) ou similaridade de nome ≥ limiar de alta confiança
   (`QUOTATION_AUTO_CONFIRM_THRESHOLD`, padrão **0,92**; o limiar de sugestão
   continua 0,68) são confirmados sozinhos, com trilha de auditoria
   (`matchAuto=true`). Match `manual`/`nenhum` nunca é auto-confirmado.
2. **Geração automática da proposta** — quando todos os itens ficam
   confirmados e com custo positivo, o PDF é gerado pelo mesmo caminho
   validado do fluxo manual (margem sobre o preço de venda, dados da empresa),
   armazenado (`propostaPdfUrl`) e a cotação registrada no funil de
   oportunidades. Qualquer item abaixo do limiar segura a cotação na fila de
   revisão humana — nunca sai proposta com item duvidoso.
3. **Envio** — padrão do sistema mantido: **geração automática, envio
   aprovado**. O envio 100 % automático existe, mas atrás de opt-in explícito
   (`QUOTATION_AUTO_SEND_ENABLED=true`), exige SMTP configurado e remetente
   identificado.

Disparos: após cada sincronização de e-mail, após cada radar de portais e sob
demanda via tRPC (`emailQuotations.autoPipeline`). Idempotente (cotação com
`propostaGeradaEm` é pulada). Propostas geradas notificam o dono
(notificação interna/WhatsApp).

### 3.2 Radar autenticado dos portais (`portalAuthenticatedDiscoveryService`)

Quando o mural público não expõe as cotações, o robô agora **entra no portal
com a credencial do cofre** (Funarbe, Compras MG, FIEMG, Fundep, COPASA,
CEMIG), coleta o HTML da área do fornecedor e o entrega aos mesmos parsers e
ao mesmo matching do radar público. Ordem de tentativa por portal: HTML
público → navegador (páginas dinâmicas) → **área autenticada**.

- FIEMG e CEMIG entraram no cofre de credenciais (`PORTAL_CONFIGS.fiemg`/
  `.cemig`), com seletores a confirmar na primeira execução real.
- **Conformidade preservada:** CAPTCHA nunca é resolvido — é detectado, o
  fluxo é interrompido e fica registrado que precisa de intervenção humana.
- **Reuso de sessão** (v2): a sessão (cookies) fica salva e criptografada
  junto da credencial (`portal_credentials.sessaoCookies`/`sessaoExpiraEm`,
  TTL configurável em `PORTAL_SESSION_REUSE_TTL_HOURS`, padrão 6h). Enquanto
  válida, o robô reaproveita a sessão em vez de logar de novo — menos
  exposição a CAPTCHA e menor risco de bloqueio de conta por tentativas
  repetidas. Login completo é o fallback automático quando a sessão expira
  ou não confirma. Os cookies são persistidos com domínio/path/flags
  completos (não apenas nome=valor), para portais que separam host de login
  do host de aplicação.
- **Contador de falhas de login** (v2): depois de 3 falhas consecutivas, a
  credencial fica bloqueada para novas tentativas (a sessão salva, se ainda
  válida, continua funcionando) — protege contra o próprio bloqueio de conta
  do portal. Reseta ao logar com sucesso ou ao recadastrar a credencial no
  cofre.
- **Teste de fumaça semanal** (v2, `runPortalLoginSmokeTest`, segunda-feira às
  6h): para cada portal com credencial cadastrada, tenta *só* logar — sem
  coletar nem preencher nada — e avisa (notificação/WhatsApp) se algum login
  parou de funcionar, para flagrar mudança de layout antes que uma cotação
  real fique de fora por falha silenciosa.
- Desligável com `PORTAL_AUTH_DISCOVERY_ENABLED=false`.

### 3.3 Margem por categoria (v2)

`emailQuotationResponseService.priceQuotationItems` resolve a margem de cada
item pela regra de precificação da categoria do produto casado (tela **Regras
por Categoria**) quando ativa; sem regra, cai na margem padrão (empresa ou
parâmetro). Medicamento e material de limpeza, por exemplo, podem sair na
mesma proposta com margens diferentes. O núcleo de precificação é
compartilhado entre o PDF de orçamento e a proposta preparada para o portal
(`quotationPortalHandoffService`) — os dois preços nunca divergem.

### 3.4 Frescor de preço (v2)

Antes de gerar a proposta automaticamente, o pipeline verifica (via
`priceFreshnessService`) se algum produto casado tem preço **consultado e
vencido** (mais velho que a validade configurada em Configurações). Se sim, a
cotação fica na revisão humana em vez de sair com custo desatualizado. Produto
sem histórico de consulta (preço de cadastro estático) não é bloqueado por
esta regra.

### 3.5 Calibração da auto-confirmação (v2)

Toda auto-confirmação grava `AUTO_MATCH_CONFIRMED` na auditoria; se o operador
depois substitui o produto de um item que foi auto-confirmado, grava-se
`AUTO_MATCH_CORRECTED` (e o item deixa de contar como automático). A query
`emailQuotations.autoMatchAccuracy` expõe confirmados/corrigidos/taxa de
acerto dos últimos N dias — exibida na própria tela da fila (banner do
pipeline) para orientar o ajuste de `QUOTATION_AUTO_CONFIRM_THRESHOLD`.

### 3.6 Extração de anexo em imagem (v2)

Anexos fotografados/escaneados (PNG/JPG/WEBP/GIF) de um pedido de cotação
passam a ser tratados como anexo processável: OCR por IA de visão
(`ocrService`) extrai o texto, que segue pelo mesmo extrator por IA já usado
em PDF/DOCX. Novo `sourceType: "image"`.

### 3.7 Fechar o ciclo com o portal (v2)

Para cotação vinda de um portal, o botão **"Preencher no portal"** (tela da
fila) cria — de forma idempotente (`proposals.emailQuotationId`) — uma
proposta com os preços já calculados (margem por categoria incluída) e abre o
Agente de Propostas já com o formulário preenchido, para o robô logar e
pré-preencher no portal (revisão e envio continuam humanos).

### 3.8 Alerta cirúrgico de prazo (v2)

Além do resumo diário (8h), quando o pipeline não consegue concluir uma
cotação (item pendente, preço vencido) e o prazo de resposta está a ≤2 dias,
um alerta imediato é disparado (notificação/WhatsApp) — em vez de esperar até
o próximo resumo diário.

### 3.9 Banco de dados

Migrações `0016`–`0018` (+ `ensure*Columns()` idempotentes no boot para
bancos legados):

- `email_quotations.propostaPdfUrl` — PDF gerado automaticamente
- `email_quotations.propostaGeradaEm` — carimbo de geração (idempotência)
- `email_quotations.propostaMargemPercent` — margem efetiva aplicada
- `email_quotations.sourceType` — enum estendido com `'image'`
- `email_quotations.status` — usa `'processando'` como claim atômico durante
  o pipeline (evita duas execuções concorrentes gerarem a mesma proposta)
- `email_quotation_items.matchAuto` — auditoria da confirmação automática
- `portal_credentials.sessaoCookies` / `sessaoExpiraEm` — reuso de sessão
- `portal_credentials.loginFailCount` — contador de falhas consecutivas
- `proposals.emailQuotationId` — vínculo idempotente proposta↔cotação
  (índice único: uma corrida entre duas requisições nunca cria duplicata)

## 4. Fluxo completo (visão do operador)

```text
E-mail (IMAP, 15 em 15 min) ─┐
                             ├─► Extração de itens ─► Matching catálogo
Portais (3×/dia; público  ───┘        │
e agora também autenticado)           ▼
                    ┌── score ≥ 0,92 ou código CATMAS/CATMAT ──► auto-confirma
                    │                                             │ todos ok?
                    └── abaixo do limiar ──► fila de revisão      ▼
                                              humana        PDF da proposta
                                                            gerado sozinho
                                                                  │
                              envio: 1 clique (padrão) ◄──────────┤
                              ou automático (opt-in)  ◄───────────┘
```

## 5. Configuração

```dotenv
QUOTATION_AUTO_PIPELINE_ENABLED=true      # pipeline ligado (padrão)
QUOTATION_AUTO_CONFIRM_THRESHOLD=0.92     # limiar de auto-confirmação
QUOTATION_AUTO_SEND_ENABLED=false         # envio sem revisão: opt-in explícito
PORTAL_AUTH_DISCOVERY_ENABLED=true        # radar autenticado com o cofre
PORTAL_SESSION_REUSE_TTL_HOURS=6          # validade da sessão reaproveitada
PORTAL_LOGIN_SMOKETEST_ENABLED=true       # teste de fumaça semanal de login
PORTAL_LOGIN_SMOKETEST_CRON=0 6 * * 1     # segunda-feira às 6h
```

Pré-requisitos operacionais: IMAP/SMTP configurados (tela Configurações ou
`.env`), credenciais dos portais cadastradas na tela **Portais** (cofre),
catálogo de produtos com preços atualizados e consultados (o matching sugere
o custo a partir dele; o frescor exige que a consulta tenha data), e — para
margem por categoria — regras cadastradas em **Regras por Categoria**.

## 6. Riscos e salvaguardas

| Risco | Salvaguarda |
| --- | --- |
| Proposta com produto errado | Limiar alto (0,92) + códigos determinísticos; item duvidoso segura a cotação na revisão; taxa de acerto monitorada (§3.5) |
| Envio indevido sem revisão | Auto-envio desligado por padrão; opt-in explícito e por escrito no `.env` |
| Preço defasado/custo zero | Item sem custo positivo bloqueia a geração; preço consultado e vencido também bloqueia (§3.4) |
| Cotação travada perde o prazo | Alerta cirúrgico quando bloqueada e prazo ≤2 dias (§3.8), além do resumo diário |
| Quebra de layout dos portais | Seletores tolerantes + fallback público→navegador→autenticado; teste de fumaça semanal avisa antes de afetar uma cotação real (§3.2) |
| Bloqueio de conta / CAPTCHA por login repetido | Reuso de sessão reduz a frequência de login (§3.2) |
| CAPTCHA | Nunca resolvido; detectado → interrompe e pede intervenção humana |
| Auditoria (Lei 14.133/TCU) | `matchAuto`/correções, margem efetiva e carimbo de geração persistidos; oportunidade criada no funil |

## 7. Próximos passos sugeridos (fora deste PR)

1. Ajustar seletores reais de FIEMG/Funarbe/CEMIG na primeira execução com credencial.
2. Rasterizar PDF escaneado sem camada de texto para OCR (hoje só a imagem
   anexada em si passa por OCR; um PDF-imagem sem texto extraível ainda
   depende de revisão manual).
3. Painel dedicado (além do banner na fila) para a taxa de acerto da
   auto-confirmação, com série histórica.
