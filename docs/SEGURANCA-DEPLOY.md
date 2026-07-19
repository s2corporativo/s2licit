# Segurança do deploy da VPS

## Configurações obrigatórias

### Chave do host SSH

Cadastre `VPS_HOST_KEY` com a saída obtida de uma rede confiável:

```bash
ssh-keyscan -p 22 -H <IP_DA_VPS>
```

Não copie a chave exibida durante uma conexão suspeita ou depois de um alerta de mudança de host sem confirmar a alteração diretamente no provedor da VPS.

### Autenticação por chave

A migração recomendada é:

1. gerar uma chave exclusiva para o GitHub Actions;
2. cadastrar somente a chave pública em `~/.ssh/authorized_keys` de um usuário de deploy;
3. armazenar a chave privada em `VPS_SSH_KEY`;
4. retirar o login SSH por senha depois de validar o novo acesso;
5. impedir login SSH direto de `root`;
6. conceder ao usuário de deploy somente os comandos necessários.

### Cookies seguros

Com o certificado HTTPS válido e o domínio respondendo corretamente, defina:

```env
FORCE_SECURE_COOKIES=true
```

### Conta do administrador

A senha inicial gerada pelo bootstrap deve ser substituída imediatamente. Não use a conta administrativa no smoke test nem na operação cotidiana.

## Controles automáticos existentes

- deploy somente após CI verde;
- imagem de produção vinculada ao SHA validado;
- rollback por imagem anterior;
- healthcheck e readiness;
- monitor externo via GitHub Actions;
- incidente automático;
- logs estruturados;
- backups persistentes e verificados.
