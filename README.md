# Sistema S2 — Licitações e Cotações

Plataforma para gestão de catálogo de produtos, importação e comparação de
preços de fornecedores, geração de propostas e orçamentos, e cruzamento de
cotações de órgãos públicos (Compras MG, PNCP e afins).

Stack: **React + Vite + TypeScript** (frontend), **Express + tRPC + Drizzle
ORM** (backend), **MySQL** (banco).

---

## Pré-requisitos

- Node.js 22+
- pnpm 10+ (`npm install -g pnpm`)
- MySQL 8+ (local ou gerenciado)

## Configuração

1. Copie o arquivo de exemplo e preencha as variáveis:

   ```bash
   cp .env.example .env
   ```

   Variáveis essenciais:

   | Variável | Descrição |
   |----------|-----------|
   | `DATABASE_URL` | Conexão MySQL (`mysql://user:senha@host:3306/banco`) |
   | `JWT_SECRET` | Segredo para assinar sessões — **obrigatório em produção** (≥32 chars). Gere com `openssl rand -base64 48` |
   | `ENCRYPTION_KEY` | Chave para criptografar credenciais de fornecedores. Gere com `openssl rand -base64 48` |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Administrador inicial (login local), criado no primeiro boot |
   | `ANTHROPIC_API_KEY` | Chave da API da Anthropic para os recursos de IA (opcional) |
   | `PRODEMGE_API_KEY` | Chave da API de Compras MG (opcional; solicite em api@prodemge.gov.br) |

2. Instale as dependências:

   ```bash
   pnpm install
   ```

3. Aplique o schema do banco:

   ```bash
   pnpm db:push
   ```

## Rodando

```bash
# Desenvolvimento (hot reload)
pnpm dev

# Produção
pnpm build
pnpm start
```

O servidor sobe em `http://localhost:3000`. Acesse `/login` e entre com o
e-mail/senha do administrador configurado em `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## Scripts

| Comando | O que faz |
|---------|-----------|
| `pnpm dev` | Servidor de desenvolvimento com hot reload |
| `pnpm build` | Build de produção (frontend Vite + backend esbuild) |
| `pnpm start` | Roda o build de produção |
| `pnpm check` | Verificação de tipos (`tsc --noEmit`) |
| `pnpm test` | Suíte de testes (Vitest) |
| `pnpm db:push` | Gera e aplica migrações Drizzle |

## Autenticação

O modo padrão é **login local por e-mail e senha** (`/login`). As senhas são
armazenadas com hash scrypt e salt aleatório. O primeiro administrador é
criado automaticamente no boot a partir de `ADMIN_EMAIL`/`ADMIN_PASSWORD`;
os demais usuários são cadastrados pela tela de gestão de usuários.

Papéis disponíveis: `admin`, `editor`, `viewer`, `user`.

Um provedor OAuth externo continua suportado (defina `OAUTH_SERVER_URL` e
`VITE_OAUTH_PORTAL_URL`), mas não é necessário.

## Integrações de compras públicas

- **Cotações por e-mail** (tela "Cotações Recebidas"): um conector IMAP busca
  os pedidos de cotação recebidos (Compras MG/COTEP, FUNARB, COPASA, Cemig,
  etc.), extrai os itens dos anexos (planilha de forma estruturada; PDF/DOCX
  com auxílio de IA) e cruza cada item com o catálogo — por código CATMAS/
  CATMAT (exato) ou por similaridade de nome. O operador revisa e confirma os
  matches. Configure `IMAP_HOST`/`IMAP_USER`/`IMAP_PASSWORD` para habilitar a
  sincronização.
- **PNCP** (Portal Nacional de Contratações Públicas): tela "Radar de
  Oportunidades" — consulta pública de licitações por palavra-chave e UF. Não
  exige chave.
- **Compras MG / CATMAS**: produtos têm os campos `catmasCode` (catálogo
  estadual) e `catmatCode` (catálogo federal), base para o cruzamento
  determinístico de cotações por código. A API de dados de Compras MG
  (Prodemge) exige chave (`PRODEMGE_API_KEY`).

## Deploy

Há um `render.yaml` e um `render.Dockerfile` prontos para o [Render](https://render.com).
Configure os segredos (`DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ANTHROPIC_API_KEY`) no painel do serviço.
O health check responde em `/healthz`.

## Integração contínua

O workflow em `.github/workflows/ci.yml` roda verificação de tipos, testes e
build de produção a cada push e pull request.
