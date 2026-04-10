#!/bin/bash
# ============================================================
# SISTEMA S2 — SCRIPT DE INSTALAÇÃO AUTOMÁTICA
# Execute: chmod +x setup.sh && ./setup.sh
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}   SISTEMA S2 — INSTALAÇÃO AUTOMÁTICA      ${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERRO] Node.js não encontrado. Instale o Node.js 18+ em https://nodejs.org${NC}"
    exit 1
fi
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}[ERRO] Node.js 18+ é necessário. Versão atual: $(node --version)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version) detectado${NC}"

# Instalar pnpm se necessário
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}→ Instalando pnpm...${NC}"
    npm install -g pnpm
fi
echo -e "${GREEN}✓ pnpm $(pnpm --version) disponível${NC}"

# Verificar MySQL
if ! command -v mysql &> /dev/null; then
    echo -e "${YELLOW}[AVISO] MySQL client não encontrado no PATH.${NC}"
    echo -e "${YELLOW}        Se tiver Docker, use: docker-compose up -d${NC}"
else
    echo -e "${GREEN}✓ MySQL client detectado${NC}"
fi

echo ""
echo -e "${BLUE}→ Instalando dependências...${NC}"
pnpm install --ignore-scripts

echo ""
echo -e "${BLUE}→ Verificando arquivo .env...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || echo -e "${YELLOW}[AVISO] Arquivo .env não encontrado. Crie manualmente baseado no .env.example${NC}"
fi

echo ""
echo -e "${BLUE}→ Aplicando migrações do banco de dados...${NC}"
if [ -z "$DATABASE_URL" ]; then
    source .env 2>/dev/null || true
fi

if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}[AVISO] DATABASE_URL não definido. Configure o .env antes de continuar.${NC}"
    echo -e "${YELLOW}        Exemplo: DATABASE_URL=mysql://usuario:senha@localhost:3306/sistema_s2${NC}"
else
    pnpm db:push && echo -e "${GREEN}✓ Banco de dados configurado${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   INSTALAÇÃO CONCLUÍDA!                   ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "Para iniciar em desenvolvimento:"
echo -e "  ${BLUE}pnpm dev${NC}"
echo ""
echo -e "Para iniciar em produção (após build):"
echo -e "  ${BLUE}pnpm build && pnpm start${NC}"
echo ""
echo -e "Com Docker (recomendado):"
echo -e "  ${BLUE}docker-compose up -d${NC}"
echo ""
echo -e "Acesso: ${BLUE}http://localhost:5000${NC}"
