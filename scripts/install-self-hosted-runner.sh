#!/usr/bin/env bash
# Instala um runner GitHub Actions auto-hospedado e exclusivo do S2licit.
# Uso: sudo RUNNER_TOKEN='token-temporario' bash scripts/install-self-hosted-runner.sh
set -euo pipefail

REPO_URL="https://github.com/s2corporativo/s2licit"
RUNNER_USER="github-runner"
RUNNER_DIR="/opt/actions-runner-s2licit"
RUNNER_LABEL="s2licit-vps"
RUNNER_NAME="s2licit-vps-$(hostname -s)"
RUNNER_TOKEN="${RUNNER_TOKEN:-${1:-}}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Execute como root: sudo RUNNER_TOKEN='TOKEN' bash $0" >&2
  exit 1
fi

if [ -z "$RUNNER_TOKEN" ] && [ ! -f "$RUNNER_DIR/.runner" ]; then
  echo "RUNNER_TOKEN não informado." >&2
  echo "Gere-o em: repositório > Settings > Actions > Runners > New self-hosted runner." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl git gzip jq mysql-client python3 rsync sshpass tar chromium

if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if ! id "$RUNNER_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$RUNNER_USER"
fi

if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "$RUNNER_USER"
fi

install -d -o "$RUNNER_USER" -g "$RUNNER_USER" -m 0750 "$RUNNER_DIR"
cd "$RUNNER_DIR"

if [ ! -x ./run.sh ]; then
  echo "Baixando a versão atual do GitHub Actions Runner..."
  RUNNER_VERSION=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name | ltrimstr("v")')
  if [ -z "$RUNNER_VERSION" ] || [ "$RUNNER_VERSION" = "null" ]; then
    echo "Não foi possível identificar a versão atual do runner." >&2
    exit 1
  fi

  case "$(uname -m)" in
    x86_64|amd64) RUNNER_ARCH="x64" ;;
    aarch64|arm64) RUNNER_ARCH="arm64" ;;
    *) echo "Arquitetura não suportada: $(uname -m)" >&2; exit 1 ;;
  esac

  ARCHIVE="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
  curl -fL --retry 3 \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${ARCHIVE}" \
    -o "/tmp/${ARCHIVE}"
  tar xzf "/tmp/${ARCHIVE}" -C "$RUNNER_DIR"
  rm -f "/tmp/${ARCHIVE}"
  chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"
fi

if [ ! -f "$RUNNER_DIR/.runner" ]; then
  echo "Registrando runner no repositório privado..."
  runuser -u "$RUNNER_USER" -- ./config.sh \
    --unattended \
    --replace \
    --url "$REPO_URL" \
    --token "$RUNNER_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABEL" \
    --work "_work"
else
  echo "Runner já registrado; mantendo a configuração existente."
fi

if ! systemctl list-unit-files --type=service | grep -q 'actions.runner.s2corporativo-s2licit'; then
  ./svc.sh install "$RUNNER_USER"
fi

./svc.sh start
sleep 2
./svc.sh status

cat <<EOF

Runner gratuito configurado.

Repositório: $REPO_URL
Nome:        $RUNNER_NAME
Etiqueta:    $RUNNER_LABEL
Diretório:   $RUNNER_DIR
Usuário:     $RUNNER_USER

Confirme no GitHub em Settings > Actions > Runners que ele aparece como Idle.
EOF
