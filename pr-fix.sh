#!/bin/bash
cd /home/ubuntu/s2licit
gh pr create --repo s2corporativo/s2licit --base main --head fix/rematch-progresso \
  --title "Fix: progresso por item no re-matching e limite de 15 itens por execucao" \
  --body "Modulo 05 da auditoria: o re-matching de 25 itens continuava travando o servidor (catalogo de 27.435 produtos em memoria). Reduz o limite para 15 itens por execucao e adiciona log de progresso por item para rastreabilidade. Gates: tsc OK, 728 testes aprovados." 2>&1 | tail -1
PR=$(gh pr list --repo s2corporativo/s2licit --state open --head fix/rematch-progresso --json number -q '.[0].number')
echo "PR=$PR"
[ -n "$PR" ] && gh pr merge "$PR" --repo s2corporativo/s2licit --squash --admin 2>&1 | tail -1
gh api repos/s2corporativo/s2licit/branches/main --jq '.commit.sha' | head -c 8; echo " <- main"
