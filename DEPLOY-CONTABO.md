# Deploy do Sistema S2 em VPS Contabo

Guia operacional para publicar o **S2 Licit** em uma VPS Ubuntu usando Docker, MySQL e proxy reverso com HTTPS.

## Arquitetura

O `docker-compose.yml` mantém:

- aplicação S2;
- banco MySQL;
- volumes persistentes para banco, uploads e backups.

O proxy público é configurado pelo `scripts/vps-bootstrap.sh`:

- **Nginx já existente:** cria um vhost exclusivo para o subdomínio do S2, sem remover os demais sites;
- **servidor sem Nginx:** instala ou atualiza um bloco gerenciado no Caddy, preservando os demais blocos existentes.

## Deploy automático recomendado

No GitHub:

1. Abra **Actions**.
2. Selecione **Deploy VPS**.
3. Clique em **Run workflow**.
4. Confira host, usuário e domínio.
5. Execute.

O workflow:

1. usa o commit aprovado pelo CI;
2. gera e publica uma imagem Docker identificada pelo SHA;
3. sincroniza o código sem sobrescrever o `.env` da VPS;
4. aplica migrações;
5. configura o proxy do domínio;
6. valida aplicação e MySQL pela rede local;
7. valida externamente DNS, proxy, `/healthz`, `/readyz` e o HTML do Sistema S2.

O deploy só termina com sucesso quando o endereço público realmente entrega o S2. Um HTTP 200 do site institucional não é aceito como sucesso.

## Secrets e variables do GitHub

### Obrigatórios

| Nome | Tipo recomendado | Finalidade |
|---|---|---|
| `VPS_PASSWORD` | Secret | acesso SSH à VPS |
| `VPS_HOST_KEY` | Secret | pinagem da chave SSH do servidor |
| `VPS_HOST` | Variable | IP ou hostname da VPS |
| `VPS_SSH_USER` | Variable | usuário SSH, normalmente `root` |
| `VPS_DOMAIN` | Variable | subdomínio exclusivo do S2 |

### Recomendados

| Nome | Tipo recomendado | Finalidade |
|---|---|---|
| `ADMIN_EMAIL` | Variable | login administrativo em instalação nova |
| `ADMIN_PASSWORD` | Secret | senha administrativa definida pela operação |
| `CERTBOT_EMAIL` | Variable | contato para emissão/renovação do certificado |
| `SMOKE_USER_EMAIL` | Secret | conta dedicada ao smoke autenticado |
| `SMOKE_USER_PASSWORD` | Secret | senha da conta de smoke |
| `SMOKE_ROLE` | Variable | papel real da conta: `user`, `viewer`, `editor` ou `admin` |

As integrações de IA, e-mail e WhatsApp são opcionais e devem ser cadastradas somente quando efetivamente utilizadas.

## DNS

Crie um registro **A** para o subdomínio do S2 apontando para o IP público da VPS.

Exemplo conceitual:

```text
sistema.seudominio.com.br  A  IP_DA_VPS
```

Se houver Cloudflare ou outro CDN, use inicialmente o modo **somente DNS** durante a emissão do certificado. Depois da validação, qualquer proxy adicional deve preservar o host original e não redirecionar o subdomínio para o site institucional.

## Diagnóstico quando aparece outro site

O problema normalmente está em um destes pontos:

1. DNS do subdomínio aponta para servidor incorreto;
2. vhost genérico do Nginx captura o domínio antes do vhost do S2;
3. outro arquivo declara o mesmo `server_name`;
4. proxy/CDN redireciona para o domínio institucional;
5. certificado ou bloco HTTPS antigo permanece associado ao domínio.

Na VPS, verifique:

```bash
cd /opt/s2licit

grep '^DOMAIN=' .env
docker compose ps
docker compose logs --tail=200 app db

nginx -T 2>/dev/null | grep -n -B3 -A12 'server_name'
ss -ltnp | grep -E ':80|:443|:3000|:3001|:8080'

curl -i -H 'Host: SEU_SUBDOMINIO' http://127.0.0.1/healthz
curl -i https://SEU_SUBDOMINIO/healthz
curl -i https://SEU_SUBDOMINIO/readyz
```

Resultados esperados:

```json
{"status":"ok"}
```

```json
{"status":"ready"}
```

A página `/login` deve conter o título:

```text
Sistema S2 — Licitações e Cotações
```

## Instalação manual

### 1. Preparar a VPS

```bash
apt update
apt install -y docker.io docker-compose-plugin git
systemctl enable --now docker
```

### 2. Obter o código

```bash
cd /opt
git clone https://github.com/s2corporativo/s2licit.git
cd s2licit
```

### 3. Criar o `.env`

```bash
cp .env.production.example .env
nano .env
```

Preencha obrigatoriamente:

- `MYSQL_ROOT_PASSWORD`;
- `MYSQL_PASSWORD`;
- `JWT_SECRET`;
- `ENCRYPTION_KEY`;
- `ADMIN_EMAIL`;
- `ADMIN_PASSWORD`.

Gere segredos com:

```bash
openssl rand -base64 48
```

### 4. Subir

```bash
bash scripts/vps-bootstrap.sh
```

Para definir domínio na execução:

```bash
DOMAIN=sistema.seudominio.com.br \
CERTBOT_EMAIL=contato@seudominio.com.br \
bash scripts/vps-bootstrap.sh
```

## Operação

| Ação | Comando |
|---|---|
| Estado | `docker compose ps` |
| Logs | `docker compose logs -f app db` |
| Reiniciar app | `docker compose restart app` |
| Parar | `docker compose down` |
| Readiness local | `curl -fsS http://127.0.0.1:PORTA/readyz` |
| Rollback | `bash scripts/vps-rollback.sh` |

A porta local está registrada em `APP_LOCAL_PORT` no `.env`.

## Backup

Use o mecanismo de backup do projeto e teste periodicamente a restauração. Um arquivo existente sem teste de restauração não constitui garantia de recuperação.

Exemplo manual:

```bash
mkdir -p /root/backups
cd /opt/s2licit
docker compose exec -T db sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot sistema_s2' \
  | gzip > /root/backups/s2-$(date +%F-%H%M).sql.gz
```

## Segurança mínima

- use `VPS_HOST_KEY` para impedir conexão SSH com servidor não reconhecido;
- não versione o `.env`;
- não reutilize senha de e-mail, banco ou administrador;
- use conta dedicada para smoke test;
- apague `/root/s2licit-acesso.txt` após o primeiro acesso;
- mantenha portas do banco e da aplicação interna fora da internet pública;
- revise logs e restaure backups em ambiente controlado periodicamente.
