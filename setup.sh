#!/usr/bin/env bash
# ============================================================
# SISTEMA S2 — INSTALAÇÃO LOCAL EM LINUX
# Execute: chmod +x setup.sh && ./setup.sh
# ============================================================

set -euo pipefail

readonly PNPM_VERSION="10.4.1"
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   SISTEMA S2 — INSTALAÇÃO LOCAL           ${NC}"
echo -e "${BLUE}============================================${NC}"
echo

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[ERRO] Node.js não encontrado. Instale o Node.js 22 LTS em https://nodejs.org${NC}"
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo -e "${RED}[ERRO] Node.js 22 ou superior é obrigatório. Versão atual: $(node --version)${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version) detectado${NC}"

if ! command -v pnpm >/dev/null 2>&1 || [ "$(pnpm --version)" != "$PNPM_VERSION" ]; then
  echo -e "${YELLOW}→ Instalando pnpm ${PNPM_VERSION}...${NC}"
  npm install -g "pnpm@${PNPM_VERSION}"
fi
echo -e "${GREEN}✓ pnpm $(pnpm --version) disponível${NC}"

if ! command -v mysql >/dev/null 2>&1; then
  echo -e "${YELLOW}[AVISO] Cliente MySQL não encontrado no PATH.${NC}"
  echo -e "${YELLOW}        Para ambiente local com containers, use: docker compose up -d${NC}"
else
  echo -e "${GREEN}✓ Cliente MySQL detectado${NC}"
fi

echo
echo -e "${BLUE}→ Instalando dependências pelo lockfile oficial...${NC}"
pnpm install --frozen-lockfile --ignore-scripts

if [ ! -f .env ]; then
  cp .env.example .env
  echo
echo -e "${YELLOW}[ATENÇÃO] O arquivo .env foi criado a partir do modelo.${NC}"
  echo -e "${YELLOW}Preencha DATABASE_URL, JWT_SECRET e ENCRYPTION_KEY e execute o setup novamente.${NC}"
  exit 1
fi

echo
echo -e "${BLUE}→ Aplicando migrações oficiais do banco...${NC}"
if ! pnpm db:push; then
  echo -e "${RED}[ERRO] Não foi possível aplicar as migrações.${NC}"
  echo -e "${RED}Verifique o MySQL, a DATABASE_URL e as permissões do usuário do banco.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Migrações aplicadas${NC}"

echo
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   INSTALAÇÃO CONCLUÍDA                    ${NC}"
echo -e "${GREEN}============================================${NC}"
echo
echo -e "Desenvolvimento: ${BLUE}pnpm dev${NC}"
echo -e "Produção local:  ${BLUE}pnpm build && pnpm start${NC}"
echo -e "Containers:      ${BLUE}docker compose up -d --build${NC}"
echo -e "Acesso padrão:   ${BLUE}http://localhost:3000${NC}"
