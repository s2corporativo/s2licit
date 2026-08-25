#!/bin/bash
set -e # Interrompe a execução em caso de erro

# docker compose lê .env sozinho para montar os containers, mas este script
# roda fora do compose — sem isso, MYSQL_ROOT_PASSWORD e APP_LOCAL_PORT (que
# vps-bootstrap.sh grava lá ao escolher 3001/3002/3010) ficam sempre vazios
# aqui, mesmo definidos no arquivo. Sourcear o arquivo inteiro (. ./.env)
# executaria qualquer valor com sintaxe de shell como comando — .env.production.example
# documenta BACKUP_OFFSITE_COMMAND com aspas e argumentos, que sourcear
# tentaria rodar como comando e abortaria o script (set -e). Lemos só as
# chaves que este script realmente usa.
env_value() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"
}
APP_LOCAL_PORT="${APP_LOCAL_PORT:-$(env_value APP_LOCAL_PORT)}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-$(env_value MYSQL_ROOT_PASSWORD)}"
MYSQL_DATABASE="${MYSQL_DATABASE:-$(env_value MYSQL_DATABASE)}"

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
if ! curl -fsS --retry 5 --retry-delay 5 --retry-connrefused http://localhost:${APP_LOCAL_PORT:-3000}/readyz > /dev/null; then
  echo "ERRO: Backend não respondeu HTTP 200."
  docker compose logs app --tail 20
  exit 1
fi

echo "4. Verificando integridade da Migration (Banco)..."
if ! docker compose exec -T db mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "${MYSQL_DATABASE:-sistema_s2}" -e "DESCRIBE agenticseek_buscas;" > /dev/null 2>&1; then
  echo "ERRO: Tabela agenticseek_buscas não encontrada."
  exit 1
fi

echo "SUCESSO: Smoke tests aprovados!"
