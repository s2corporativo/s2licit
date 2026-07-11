FROM node:22-bookworm-slim

# Chromium do sistema para o Puppeteer (automação de portais) — evita o
# download do Chrome próprio do Puppeteer no install.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libgbm1 \
    libnss3 \
    libxss1 \
    curl \
    default-mysql-client \
  && rm -rf /var/lib/apt/lists/*

# Instalar pnpm
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Dependências primeiro (camada cacheável)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --ignore-scripts

# Código e build (frontend + backend)
COPY . .
RUN pnpm run build

# A porta efetiva vem da variável PORT (padrão 3000)
EXPOSE 3000

# Aplica migrações (schema.ts é a fonte de verdade) e inicia o servidor.
# Se a migração falhar, loga o aviso mas ainda tenta subir com o schema atual.
CMD ["sh", "-c", "pnpm db:push || echo '[boot] aviso: db:push falhou — seguindo com o schema existente'; exec node dist/index.js"]
