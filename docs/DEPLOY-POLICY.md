# Política de deploy

`main` só deve ser implantada após lint, typecheck, testes, build e auditoria de dependências. O workflow de deploy repete esses gates antes de gerar a imagem. A imagem é identificada pelo SHA do commit. O host remoto usa chave SSH, host key pinada e usuário não-root.
