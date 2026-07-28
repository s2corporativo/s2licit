# GitHub Actions sem cobrança — S2licit

## Arquitetura adotada

O S2licit usa um runner auto-hospedado e exclusivo, instalado na própria VPS, com a etiqueta:

```text
s2licit-vps
```

Todos os workflows usam:

```yaml
runs-on: [self-hosted, linux, x64, s2licit-vps]
```

Assim, o GitHub não fornece a máquina de execução e não cobra minutos de runner hospedado. A VPS já contratada executa CI, migrations, build, deploy, smoke e monitoramento.

O fluxo também não usa:

- GitHub Container Registry (GHCR);
- upload de artefatos do Actions;
- cache hospedado pelo GitHub;
- runners `ubuntu-latest`, `windows-latest` ou `macos-latest`.

## Registro inicial do runner

1. Abra o repositório `s2corporativo/s2licit`.
2. Entre em **Settings > Actions > Runners**.
3. Clique em **New self-hosted runner**.
4. Selecione **Linux** e **x64**.
5. O GitHub exibirá um token temporário, válido por aproximadamente uma hora.
6. Conecte-se à VPS como root.
7. Instale o runner usando os comandos exibidos pelo GitHub e, no comando `config.sh`, acrescente:

```bash
--labels s2licit-vps
```

O comando de configuração deve ficar equivalente a:

```bash
./config.sh \
  --url https://github.com/s2corporativo/s2licit \
  --token TOKEN_TEMPORARIO \
  --labels s2licit-vps
```

8. Instale como serviço:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

9. Volte a **Settings > Actions > Runners** e confirme que o runner aparece como **Idle**.

## Instalação automatizada após a PR ser integrada

O repositório contém:

```text
scripts/install-self-hosted-runner.sh
```

Uso:

```bash
sudo RUNNER_TOKEN='TOKEN_TEMPORARIO' \
  bash scripts/install-self-hosted-runner.sh
```

O script:

- cria o usuário `github-runner`;
- instala Docker, Chromium, MySQL Client, rsync e sshpass quando necessário;
- baixa a versão atual do runner;
- registra a etiqueta `s2licit-vps`;
- instala e inicia o runner como serviço;
- não concede acesso sudo ao usuário do runner.

O usuário entra no grupo `docker`, necessário para testes de banco e build de imagens. Por esse motivo, o runner deve permanecer exclusivo deste repositório privado e somente pessoas confiáveis devem ter permissão de escrita.

## Proteção contra qualquer cobrança

Na conta proprietária do GitHub:

1. Abra **Settings > Billing and licensing > Budgets and alerts**.
2. Crie um orçamento para o produto **Actions**.
3. Defina o valor pago permitido como zero ou o menor valor aceito pela interface.
4. Ative **Stop usage when budget limit is reached**.
5. Mantenha alertas de uso incluído habilitados.

Isso bloqueia runners hospedados pelo GitHub quando não houver saldo gratuito, sem afetar o runner auto-hospedado.

Também é recomendável:

- não cadastrar um orçamento pago para GitHub Actions;
- excluir imagens antigas do pacote `s2licit` no GitHub Packages/GHCR;
- apagar artefatos antigos em **Actions > Management > Caches** e nos runs antigos;
- manter o repositório privado;
- desativar revisões automáticas que consumam minutos hospedados, quando não forem necessárias.

## Deploy

O deploy gratuito:

1. executa no runner `s2licit-vps`;
2. sincroniza o código preservando `.env`, uploads e backups;
3. grava a imagem anterior em `S2_IMAGE_PREVIOUS`;
4. cria a tag local `sistema-s2-app:<commit>`;
5. constrói a imagem diretamente na VPS;
6. aplica migrations;
7. valida aplicação, MySQL, domínio, `/healthz`, `/readyz` e identidade HTML.

Nenhuma imagem é enviada ao GHCR.

## Diagnóstico

```bash
sudo systemctl list-units 'actions.runner*'
sudo journalctl -u 'actions.runner*' -n 100 --no-pager
docker ps
```

Para reiniciar o runner:

```bash
cd /opt/actions-runner-s2licit
sudo ./svc.sh stop
sudo ./svc.sh start
sudo ./svc.sh status
```
