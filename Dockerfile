# ── Estágio 1: build (frontend Vite + backend esbuild) ───────────────────────
FROM node:22-bookworm-slim AS build

RUN npm install -g pnpm@10.4.1

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm run build

# ── Estágio 2: dependências de produção (sem devDependencies) ────────────────
FROM node:22-bookworm-slim AS proddeps

RUN npm install -g pnpm@10.4.1

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts --prod

# ── Estágio 3: runtime enxuto e sem privilégio ───────────────────────────────
FROM node:22-bookworm-slim

# Chromium do sistema para o Puppeteer (automação de portais) — evita o
# download do Chrome próprio do Puppeteer no install.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV NODE_ENV=production
ENV HOME=/home/node

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
    util-linux \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=proddeps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json ./package.json

RUN mkdir -p /app/uploads /app/backups /home/node/.cache \
  && chown -R node:node /app /home/node/.cache \
  && chmod 755 /app/scripts/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl --fail --silent "http://127.0.0.1:${PORT:-3000}/readyz" > /dev/null || exit 1

# O processo, o entrypoint e o Chromium executam sem privilégios de root.
USER node
CMD ["/app/scripts/docker-entrypoint.sh"]
