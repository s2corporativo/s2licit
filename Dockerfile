FROM node:22-slim

# Instalar pnpm
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copiar arquivos de dependências
COPY package.json pnpm-lock.yaml* ./
COPY patches/ ./patches/ 2>/dev/null || true

# Instalar dependências (sem puppeteer para produção)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copiar código fonte
COPY . .

# Build do frontend e backend
RUN pnpm run build

# Expor porta
EXPOSE 5000

# Aguardar DB e rodar migrações antes de iniciar
CMD ["sh", "-c", "node -e \"require('child_process').execSync('pnpm db:push', {stdio:'inherit'})\" 2>/dev/null || true && node dist/index.js"]
