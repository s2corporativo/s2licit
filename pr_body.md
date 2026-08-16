## Mudanças

- **Fix do bloqueio de match**: itens com produto já vinculado (produtoMatchId != null) não bloqueiam mais a geração/envio do orçamento — a vinculação já é a confirmação do match. Bloqueio persiste só para itens sem nenhum produto associado.
- **Monitor versionado**: scripts/s2-uptime-monitor.sh (cópia da VPS já corrigida — removido o check `/health` que não existe no app e gerava falso positivo permanente no systemd timer).

## Validado

- tsc --noEmit OK
- vitest: 728 testes aprovados
- VPS: monitor corrigido nos dois caminhos (/usr/local/bin + /opt/s2licit-monitor), backups .bak-20260816, bash -n OK

## Riscos

Baixo: sem mudança de schema, sem mudança de API. Pipeline automático e UX de confirmação manual intactos.
