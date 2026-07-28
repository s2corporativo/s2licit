# Domínio oficial do S2 Licit

O endereço oficial de produção é:

`https://s2.s2corporativo.com.br`

## 1. Apontamento DNS obrigatório

No provedor que administra o DNS de `s2corporativo.com.br`, crie ou ajuste:

| Campo | Valor |
|---|---|
| Tipo | `A` |
| Nome/Host | `s2` |
| Destino/Valor | `13.140.167.153` |
| TTL | Automático ou 300 |
| Proxy/CDN | Somente DNS, sem proxy durante a emissão inicial |

Não é necessário criar registro `CNAME` para esse subdomínio.

## 2. Atualizar a VPS

Dentro de `/opt/s2licit`:

```bash
git restore --source=origin/main -- scripts/deploy-free.sh scripts/validate-free.sh 2>/dev/null || true
git pull --ff-only origin main
```

## 3. Configurar produção e HTTPS

Depois que o DNS resolver para `13.140.167.153`:

```bash
bash scripts/configure-domain.sh
```

O comando:

1. confirma o registro DNS antes de alterar o servidor;
2. cria backup do `.env`;
3. define `DOMAIN=s2.s2corporativo.com.br`;
4. ativa `FORCE_SECURE_COOKIES=true`;
5. desloca a porta pública do Docker para `8080`;
6. mantém a aplicação local em `127.0.0.1:3000`;
7. executa o deploy gratuito completo;
8. instala e configura Nginx;
9. preserva outros virtual hosts existentes;
10. emite certificado gratuito pelo Let's Encrypt/Certbot;
11. habilita redirecionamento HTTP para HTTPS;
12. habilita a renovação automática do certificado;
13. testa o endereço HTTPS ao final.

## 4. Verificações

```bash
curl -I https://s2.s2corporativo.com.br
systemctl status nginx --no-pager
systemctl status certbot.timer --no-pager
docker compose ps
```

## Segurança

- O `.env` real não é enviado ao GitHub.
- O script não remove volumes Docker.
- Nunca execute `docker compose down -v` em produção.
- Se 80 ou 443 estiverem ocupadas por serviço diferente do Nginx, o script interrompe sem alterar esse serviço.
