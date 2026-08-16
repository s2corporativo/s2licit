#!/bin/bash
# Identifica quem consome o Ollama (porta 11434)
echo "=== conexoes atuais na 11434 ==="
ss -tnp sport = :11434

echo "=== redes com subnet 172.24 ==="
for net in $(docker network ls -q); do
  subnet=$(docker network inspect "$net" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')
  case "$subnet" in 172.24*) echo "REDE: $net SUBNET: $subnet"; docker network inspect "$net" --format '{{range $k,$c := .Containers}}  {{$c.Name}} {{(index $c.IPv4Address 0)}}{{end}}' ;; esac
done

echo "=== processos conectados ao ollama (todas portas) ==="
ss -tnp 2>/dev/null | grep 11434 | grep -v ollama | head -10

echo "=== journalctl ollama recente (requests) ==="
journalctl -u ollama -n 30 --no-pager | grep -iE "request|embed" | tail -8
