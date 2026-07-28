# GitHub gratuito no S2 Licit

## Decisão adotada

O GitHub será utilizado somente para:

- armazenar o código privado;
- registrar commits e histórico;
- trabalhar com branches e pull requests;
- permitir recuperação e auditoria das alterações.

O projeto não depende mais de runners hospedados do GitHub Actions. Typecheck, lint, testes, migrações, build e deploy são executados gratuitamente na própria VPS com Docker.

## Única configuração manual no GitHub

Para impedir definitivamente novas tentativas de cobrança ou execução:

1. abra o repositório `s2corporativo/s2licit` no GitHub;
2. clique em **Settings**;
3. no menu esquerdo, abra **Actions** e depois **General**;
4. em **Actions permissions**, selecione **Disable actions**;
5. clique em **Save**.

O arquivo `.github/workflows/ci.yml` também foi removido. Assim, mesmo antes dessa configuração manual, novos commits não possuem workflow automático para consumir minutos.

## Comando gratuito de validação

Na VPS, dentro da pasta do S2 Licit:

```bash
bash scripts/validate-free.sh
```

A validação executa:

1. TypeScript (`pnpm check`);
2. lint;
3. testes Vitest;
4. build de produção;
5. build completo da imagem Docker;
6. criação de MySQL temporário e isolado;
7. migrações de produção em duas passagens;
8. testes de integração com MySQL.

O banco temporário e a rede de validação são removidos automaticamente ao final, inclusive quando ocorre erro.

## Comando gratuito de atualização completa

Na VPS, dentro da pasta do S2 Licit:

```bash
bash scripts/deploy-free.sh
```

Esse comando:

1. confirma que não existem alterações locais não salvas;
2. atualiza a branch `main`;
3. valida o Docker Compose;
4. cria um backup do banco, quando a aplicação já está ativa;
5. executa toda a validação gratuita;
6. reconstrói e inicia os contêineres;
7. aguarda o healthcheck;
8. exibe os serviços em execução;
9. mostra os logs e interrompe o deploy se a aplicação ficar indisponível.

## Primeiro uso na VPS

Confirme que Docker e Docker Compose estão instalados:

```bash
docker --version
docker compose version
```

Depois acesse a pasta do projeto e execute:

```bash
git checkout main
git pull --ff-only origin main
bash scripts/deploy-free.sh
```

Não é necessário cadastrar cartão, contratar GitHub Pro ou pagar GitHub Actions.

## Observação

O plano GitHub Free mantém uma franquia mensal para runners hospedados em repositórios privados, mas ela pode ser esgotada. A solução adotada não depende dessa franquia e não gera cobrança de Actions. O custo computacional ocorre somente na VPS já utilizada pelo S2.
