# Conector automatizado por fornecedor — análise e plano

Avaliação da proposta de "conector automatizado por fornecedor" (entrar no site,
pesquisar produtos, coletar preços e atualizar a base) frente ao que o s2licit já
implementa, com as decisões técnicas e o plano do próximo passo (padrão híbrido).

## Veredito

A proposta é sólida e alinhada a boas práticas — e o s2licit **já implementa a
maior parte dela**. O valor está nos deltas. Abaixo, o mapa e as decisões.

## Mapa: proposta × o que já existe

| Item | Estado | Onde |
|---|---|---|
| Conector separado por fornecedor | ✅ | `server/connectors/` (`ConnectorRegistry`, `connectorFactory`) + presets em `FORNECEDOR_CONFIGS` |
| Prioridade API → catálogo → scraper | 🟡 | cascata existe; conectores de API hoje são de fontes públicas (PNCP, compras.gov, CNPJ), não de catálogo de fornecedor |
| Login automático + verificação de sucesso | ✅ | `scraperEngine.login` (form + modal + `loginSuccessSelector/Url`) |
| Sessão autenticada reutilizável | ✅ | `supplierSessionService` — cookies **e** localStorage, criptografados |
| Cofre de credenciais criptografado | ✅ | `credentialEncryptionService` (AES-256-GCM) |
| Busca por demanda + sync periódica | ✅ | `buscarProdutosFornecedor` + `scheduledJobs` (cron) |
| Produto interno × oferta do fornecedor | ✅ | `product_supplier_offers` (preço/promo/estoque) |
| Correspondência EAN→SKU→nome→IA c/ validação humana | ✅ | `matchClassification` (75%/90%) + `materialEquivalence` |
| Histórico de preços | ✅ | `recordPriceHistory` |
| Não burlar CAPTCHA/2FA → intervenção humana | ✅ | `detectarDesafioCaptcha` / `CaptchaRequerIntervencaoError` (§17) |
| Auditoria por execução | ✅ | `scraper_logs` (métricas, erro, **evidência/print no erro**) |
| Híbrido: login no browser → chamar a API JSON interna | ❌ | **próximo passo** (ver plano abaixo) |
| Governança jurídica/ToS por fornecedor | ❌ | pendente (checklist antes de ativar) |

## Decisões (onde divergimos da proposta)

- **Puppeteer, não Playwright.** O engine roda em Puppeteer 24, que já faz login,
  reuso de sessão, interceptação de rede e screenshots. O único ganho concreto do
  Playwright para nós — `storageState` (cookies+localStorage+IndexedDB) — foi
  replicado no Puppeteer (persistimos cookies **e** localStorage). Migrar não se
  paga; reavaliar só se surgir dor concreta.
- **Cofre interno AES-256-GCM, não HashiCorp Vault.** Vault é overkill para um
  sistema single-tenant. O ponto de atenção real é *onde mora a chave-mestra*:
  recomenda-se movê-la para Docker Secret / KMS e rotacioná-la — sem trocar o
  cofre inteiro.

## Implementado nesta rodada (itens de baixo risco)

- **Persistência de `localStorage` na sessão** (`supplier_sessions.localStorage`,
  criptografado). Ao logar, o engine salva cookies **e** localStorage; ao
  reutilizar, restaura ambos e recarrega a página. Pré-requisito do híbrido e já
  melhora o reuso de sessão de SPAs.
- **Evidência de falha** (`scraper_logs.evidenceUrl`): quando a raspagem falha, o
  engine captura um print da tela e guarda no storage, sem expor a senha (§9).

Ambas as colunas são garantidas no boot (`ensureScraperColumns`), idempotente.

## Plano do padrão híbrido (próximo passo, item de maior impacto)

Resolve exatamente **Bartofil** (SPA React/Vite) e **Basso Pancotte** (React
Native Web), que carregam o catálogo por uma API JSON interna e guardam o token
no localStorage — hoje a raspagem do DOM é frágil.

Fluxo proposto:

1. **Autenticar no browser** (Puppeteer) como já é feito hoje; salvar cookies +
   localStorage no cofre (já implementado).
2. **Descobrir o endpoint interno**: com a aba de rede aberta durante uma busca,
   identificar a chamada XHR/fetch que devolve os produtos (URL, método,
   cabeçalhos, formato do token — cookie ou `Authorization: Bearer`).
3. **Chamar a API diretamente** reaproveitando a sessão: a partir do contexto
   autenticado, repetir a requisição JSON (via `page.evaluate(fetch)` ou um
   cliente HTTP com os cookies/headers da sessão) e paginar sobre o JSON.
4. **Normalizar** o JSON no mesmo `ScrapedProduct` (nome, código, EAN, preço,
   promo, estoque, unidade, url), sem abrir cada página.
5. **Fallback**: se o endpoint mudar ou bloquear, cair no scraper de DOM atual.

Modelagem: um novo tipo de conector "híbrido" por fornecedor (ex.: `bartofilApi`)
que reusa o login do `scraperEngine` e a sessão do `supplierSessionService`,
mantendo o scraper de DOM como fallback. Só ativar onde o ToS do fornecedor
permitir automação (ver governança).

## Governança (pré-requisito de produção)

Antes de ativar cada conector em produção, registrar: autorização expressa do
fornecedor, termos de uso do portal, limite de consultas, permissão para
armazenar imagens/descrições. Não usar troca de IP nem ocultação do robô.

## Roteiro objetivo

1. **Tambasa** (pronto, sem anti-bot) → validar 10 produtos, conferir campos,
   histórico e integrar numa proposta real. Piloto de estabilidade.
2. **Bartofil / Basso Pancotte** → implementar o híbrido acima.
3. **Utilidades Clínicas / Magazine Médica** (2FA/reCAPTCHA) → login manual +
   reuso de sessão; priorizar catálogo público.
4. Ampliar para novos fornecedores.
