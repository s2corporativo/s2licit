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

RUN npm install -g pnpm@10.4.1

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm run build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl --fail --silent "http://127.0.0.1:${PORT:-3000}/readyz" > /dev/null || exit 1

# Reconcilia bancos legados sem apagar dados e inicia somente após o schema estar íntegro.
CMD ["sh", "-c", "node scripts/migrate-production.mjs && exec node dist/index.js"]
