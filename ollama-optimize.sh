#!/bin/bash
# Otimizacao do Ollama — sem perda de funcionalidade, apenas eficiência e segurança
set -e
DIR=/etc/systemd/system/ollama.service.d
mkdir -p "$DIR"
cat > "$DIR/override.conf" <<'EOF'
[Service]
# Reduz CPU: Ollama roda em CPU pura (sem GPU) nesta VPS.
Environment="OLLAMA_NUM_THREADS=4"
Environment="OLLAMA_NUM_PARALLEL=1"
# Seguranca: a API continua em 0.0.0.0:11434 (unico valor aceito pelo Ollama),
# mas o iptables abaixo bloqueia tudo exceto localhost e a rede docker do S2.
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF
systemctl daemon-reload
systemctl restart ollama
sleep 8
systemctl is-active ollama
ss -tlnp sport = :11434

# Restricao de rede: so localhost e a rede docker do S2 (172.24.0.0/16)
if ! iptables -C INPUT -p tcp --dport 11434 -j ACCEPT 2>/dev/null; then
  iptables -I INPUT -p tcp --dport 11434 -s 172.24.0.0/16 -j ACCEPT
  iptables -I INPUT -p tcp --dport 11434 -s 127.0.0.1 -j ACCEPT
  iptables -I INPUT -p tcp --dport 11434 -j DROP
  echo "IPTABLES_OK"
fi
iptables -L INPUT -n | grep 11434
