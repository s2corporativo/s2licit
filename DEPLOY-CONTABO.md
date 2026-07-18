# Deploy do Sistema S2 em VPS Contabo

Guia passo a passo para subir o sistema num VPS Contabo (Ubuntu) usando Docker.
O `docker-compose.yml` sobe **dois containers**: o app e o banco MySQL.

> **Jeito automático (recomendado):** GitHub → **Actions** → **Deploy VPS** →
> *Run workflow*. Informe o IP e a senha SSH (ou cadastre o secret
> `VPS_PASSWORD` uma vez e deixe o campo em branco). O workflow envia o
> código, instala o Docker se preciso, gera o `.env` com segredos na primeira
> vez (credenciais ficam em `/root/s2licit-acesso.txt` na VPS) e sobe tudo.
> Os passos manuais abaixo continuam valendo como referência.

---

## 0. Pré-requisitos

- Um VPS Contabo com **Ubuntu 22.04+** e acesso SSH (usuário `root`).
- Um domínio apontando para o IP do VPS (opcional, mas recomendado para HTTPS).

---

## 1. Acessar o servidor

No seu computador, abra o terminal e conecte (troque pelo IP do seu VPS):

```bash
ssh root@SEU_IP_DO_VPS
```

## 2. Instalar Docker

```bash
apt update && apt install -y docker.io docker-compose-plugin git
systemctl enable --now docker
```

## 3. Baixar o sistema

```bash
cd /opt
git clone https://github.com/s2corporativo/s2licit.git
cd s2licit
```

## 4. Configurar os segredos

Copie o modelo e edite:

```bash
cp .env.production.example .env
nano .env
```

Preencha (o que **não pode** ficar vazio):

| Variável | O que colocar |
|---|---|
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | senhas fortes do banco (invente) |
| `JWT_SECRET`, `ENCRYPTION_KEY` | gere no próprio servidor: `openssl rand -base64 48` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | seu login inicial (ex.: `adm@vetmg.com.br` + senha forte) |
| `GROQ_API_KEY` | chave gratuita de https://console.groq.com (para a IA) |
| `IMAP_*` | dados da caixa de e-mail que recebe as cotações |
| `SMTP_*` | dados para enviar as respostas por e-mail |

Salve no `nano` com **Ctrl+O**, Enter, **Ctrl+X**.

> Dica: para gerar os dois segredos, rode `openssl rand -base64 48` duas vezes
> e cole cada resultado em `JWT_SECRET` e `ENCRYPTION_KEY`.

## 5. Subir o sistema

```bash
docker compose up -d --build
```

A primeira vez demora alguns minutos (compila o sistema). Acompanhe com:

```bash
docker compose logs -f app
```

Quando aparecer `Server running on http://localhost:3000/`, está no ar.
O administrador (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) é criado automaticamente.

## 6. Acessar

Abra no navegador: `http://SEU_IP_DO_VPS` (porta padrão 80; ajuste se definiu `APP_HTTP_PORT` no `.env`) e entre em **/login** com o
e-mail e senha do administrador.

## 7. Importar seu catálogo (opcional, uma vez)

Envie o `CONSOLIDADO_FINAL.xlsx` para o servidor (do seu PC):

```bash
scp CONSOLIDADO_FINAL.xlsx root@SEU_IP_DO_VPS:/opt/s2licit/
```

E rode o importador dentro do container:

```bash
docker compose exec app node scripts/import-catalog-xlsx.mjs CONSOLIDADO_FINAL.xlsx --supplier "Catálogo de Referência"
```

---

## HTTPS e domínio (recomendado)

**Jeito automático:** aponte o DNS do seu domínio (registro **A**) para o IP
do VPS — **sem** proxy/CDN na frente (Cloudflare, se usado, precisa ficar em
modo "somente DNS"/nuvem cinza, porque quem emite o certificado é o próprio
servidor via HTTP-01). Depois, GitHub → **Actions** → **Deploy VPS** →
*Run workflow* → preencha o campo **domain** (ex.: `s2.s2corporativo.com.br`)
e rode. Fica salvo no `.env` — não precisa repetir o campo nos próximos
deploys. O `vps-bootstrap.sh` detecta o cenário certo:

- **VPS "limpa"** (nada nas portas 80/443): instala o **Caddy**, que assume
  as portas (a porta pública do app muda para uma alternativa, ex. 8080) e
  emite o certificado automaticamente.
- **VPS que já tem um Nginx hospedando outro site**: em vez de brigar pela
  porta com o Caddy, adiciona um **vhost novo no próprio Nginx** só para o
  domínio do S2 (`/etc/nginx/sites-available/s2licit.conf`) e emite o
  certificado com **certbot** — sem tocar nos demais sites já configurados.

<details>
<summary>Jeito manual (referência, sem o workflow)</summary>

```bash
apt install -y caddy
```

Edite `/etc/caddy/Caddyfile`:

```
seudominio.com.br {
    reverse_proxy 127.0.0.1:3000
}
```

E reinicie: `systemctl restart caddy`. O Caddy emite o certificado HTTPS
sozinho. (Depois disso, feche a porta pública do app no firewall e acesse só
pelo domínio.)

</details>

---

## Manutenção

| Tarefa | Comando (dentro de `/opt/s2licit`) |
|---|---|
| Ver logs | `docker compose logs -f app` |
| Reiniciar | `docker compose restart app` |
| Parar tudo | `docker compose down` |
| Atualizar o sistema | `git pull && docker compose up -d --build` (ou o workflow **Deploy VPS**) |
| Backup do banco | `docker compose exec db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot sistema_s2' \| gzip > backup-$(date +%F).sql.gz` |

O comando acima gera o arquivo no diretório atual do **host** (ex.:
`/opt/s2licit/backup-2026-07-11.sql.gz`). Agende diário com cron:

```
0 3 * * * cd /opt/s2licit && docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot sistema_s2' | gzip > /root/backups/s2-$(date +\%F).sql.gz
```

(crie a pasta antes: `mkdir -p /root/backups`)

---

## Configurar o e-mail (para as cotações chegarem sozinhas)

No `.env`, os campos `IMAP_*` apontam para a caixa que recebe os pedidos de
cotação. Para Gmail/Google Workspace, use uma **senha de app** (não a senha
normal): Conta Google → Segurança → Senhas de app. O mesmo vale para o
`SMTP_*` (envio). Depois de preencher, rode `docker compose up -d` de novo
para aplicar.

A sincronização roda sozinha a cada 15 minutos; na tela **Cotações Recebidas**
você também pode clicar em "Sincronizar" a qualquer momento.

> Para re-disparar o deploy sem mudar código: Actions → Deploy VPS → Run workflow, ou faça qualquer merge no main.
# Última ativação de configurações: IA (Groq) + e-mail (IMAP/SMTP)
