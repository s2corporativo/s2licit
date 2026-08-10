# Projeto: automação cotação→proposta (e-mail + portais autenticados)

**Data:** 2026-08-10 · **Status:** implementado (este PR)

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
com a credencial do cofre** (Funarbe, Compras MG, FIEMG, Fundep, COPASA),
coleta o HTML da área do fornecedor e o entrega aos mesmos parsers e ao mesmo
matching do radar público. Ordem de tentativa por portal: HTML público →
navegador (páginas dinâmicas) → **área autenticada**.

- FIEMG entrou no cofre de credenciais (`PORTAL_CONFIGS.fiemg`), com seletores
  ASP.NET a confirmar na primeira execução real.
- **Conformidade preservada:** CAPTCHA nunca é resolvido — é detectado, o
  fluxo é interrompido e fica registrado que precisa de intervenção humana.
- CEMIG segue apenas com mural público (login ainda não mapeado).
- Desligável com `PORTAL_AUTH_DISCOVERY_ENABLED=false`.

### 3.3 Banco de dados

Migração `0016` (+ `ensureQuotationAutomationColumns()` no boot para bancos
legados):

- `email_quotations.propostaPdfUrl` — PDF gerado automaticamente
- `email_quotations.propostaGeradaEm` — carimbo de geração (idempotência)
- `email_quotations.propostaMargemPercent` — margem aplicada
- `email_quotation_items.matchAuto` — auditoria da confirmação automática

## 4. Fluxo completo (visão do operador)

```
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

```
QUOTATION_AUTO_PIPELINE_ENABLED=true    # pipeline ligado (padrão)
QUOTATION_AUTO_CONFIRM_THRESHOLD=0.92   # limiar de auto-confirmação
QUOTATION_AUTO_SEND_ENABLED=false       # envio sem revisão: opt-in explícito
PORTAL_AUTH_DISCOVERY_ENABLED=true      # radar autenticado com o cofre
```

Pré-requisitos operacionais: IMAP/SMTP configurados (tela Configurações ou
`.env`), credenciais dos portais cadastradas na tela **Portais** (cofre), e
catálogo de produtos com preços atualizados (o matching sugere o custo a
partir dele).

## 6. Riscos e salvaguardas

| Risco | Salvaguarda |
| --- | --- |
| Proposta com produto errado | Limiar alto (0,92) + códigos determinísticos; item duvidoso segura a cotação na revisão |
| Envio indevido sem revisão | Auto-envio desligado por padrão; opt-in explícito e por escrito no `.env` |
| Preço defasado/custo zero | Item sem custo positivo bloqueia a geração |
| Quebra de layout dos portais | Seletores tolerantes + fallback público→navegador→autenticado; erros viram avisos no radar, nunca derrubam o job |
| CAPTCHA | Nunca resolvido; detectado → interrompe e pede intervenção humana |
| Auditoria (Lei 14.133/TCU) | `matchAuto`, margem e carimbo de geração persistidos; oportunidade criada no funil |

## 7. Próximos passos sugeridos (fora deste PR)

1. Ajustar seletores reais de FIEMG/Funarbe na primeira execução com credencial.
2. UI: badge "proposta gerada automaticamente" + botão de envio na fila.
3. Métricas: taxa de auto-confirmação correta (feedback do operador ao corrigir
   um match auto-confirmado) para calibrar o limiar.
4. CEMIG autenticada, quando houver credencial e mapeamento de login.
