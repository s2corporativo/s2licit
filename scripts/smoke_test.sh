#!/bin/bash
set -e # Interrompe a execução em caso de erro

echo "1. Aguardando inicialização dos serviços (10s)..."
sleep 10

echo "2. Verificando status dos containers..."
if docker compose ps | grep -q "Exit"; then
  echo "ERRO: Um ou mais containers falharam ao iniciar."
  docker compose logs --tail 20
  exit 1
fi

echo "3. Verificando Health Check do Backend (com retry)..."
# Tenta 5 vezes, com intervalo de 5s entre tentativas
if ! curl -fsS --retry 5 --retry-delay 5 --retry-connrefused http://localhost:8000/api/health/ready > /dev/null; then
  echo "ERRO: Backend não respondeu HTTP 200."
  docker compose logs backend --tail 20
  exit 1
fi

echo "4. Verificando integridade da Migration (Banco)..."
if ! docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" s2licit -e "DESCRIBE agenticseek_buscas;" > /dev/null 2>&1; then
  echo "ERRO: Tabela agenticseek_buscas não encontrada."
  exit 1
fi

echo "SUCESSO: Smoke tests aprovados!"
