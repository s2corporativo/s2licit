# Secrets obrigatórios

- `VPS_DEPLOY_USER` — usuário não-root com acesso controlado ao Docker/deploy.
- `VPS_SSH_PRIVATE_KEY` — chave exclusiva de deploy.
- `VPS_HOST_KEY` — linha conhecida de `known_hosts`, obrigatória.
- `JWT_SECRET` — mínimo 32 caracteres.
- `ENCRYPTION_KEY` — segredo independente para credenciais.
- `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`.

Senha SSH e `sshpass` não fazem parte do fluxo de produção.
