# Validação na VPS sem GitHub Actions

## Objetivo

Validar uma revisão do S2 Licit diretamente na VPS, sem usar runners hospedados, minutos, artifacts, cache ou qualquer execução do GitHub Actions.

O GitHub continua apenas como repositório de código e revisão de PR. O processamento de validação ocorre integralmente na infraestrutura própria.

## Comando principal

No checkout da revisão que será homologada:

```bash
bash scripts/validate-vps.sh
```

O script:

1. impede duas validações concorrentes na mesma VPS;
2. exige checkout reproduzível, sem alterações rastreadas não commitadas;
3. verifica o contrato de `drizzle/schema.ts`;
4. executa `scripts/validate-free.sh` em Docker;
5. constrói a aplicação e a imagem de produção;
6. sobe um MySQL 8 temporário e isolado;
7. aplica as migrations duas vezes para exercitar idempotência;
8. executa testes de integração contra o MySQL temporário quando existirem;
9. confirma que a validação não alterou arquivos rastreados;
10. grava o log somente na VPS.

Nenhuma etapa chama `gh`, GitHub Actions ou API de artifacts.

## Onde ficam os logs

Por padrão:

```text
/tmp/s2licit-validation-logs/
```

Para usar outro diretório local:

```bash
S2_VALIDATION_LOG_DIR=/var/log/s2licit-validation bash scripts/validate-vps.sh
```

O diretório de logs não faz parte do repositório e não é enviado automaticamente para nenhum serviço externo.

## Preparação da VPS

Requisitos:

- Linux;
- Git;
- Node.js compatível com o projeto;
- Docker Engine funcionando;
- espaço suficiente para imagens Docker temporárias.

O `Dockerfile.validate` instala as dependências da aplicação dentro das imagens de validação, então não é necessário manter dependências npm globais além do Node usado na verificação inicial de schema.

## Fluxo de homologação

```bash
git fetch origin
git switch codex/produtos-equivalencias-compendio
git pull --ff-only

# Enquanto o contrato do schema ainda estiver divergente, aplicar uma vez:
node scripts/check-product-schema-contract.mjs --fix
git diff -- drizzle/schema.ts
# revisar e versionar esse diff antes da validação final

bash scripts/validate-vps.sh
```

A revisão só deve ser considerada apta quando `validate-vps.sh` terminar com exit code `0`.

## O que não utilizar

Para este fluxo de homologação não é necessário:

- `ubuntu-latest`;
- runners hospedados pelo GitHub;
- GitHub-hosted Actions;
- upload/download de artifacts;
- GitHub cache;
- GHCR para a imagem temporária de validação;
- workflow de CI para executar testes.

## Automação opcional fora do GitHub

Se for desejada execução automática na VPS, o mesmo script pode ser chamado por `systemd`, cron ou por um processo de deploy próprio. O gate continua sendo o exit code do script e os logs permanecem sob controle da VPS.

Não é necessário transformar esse mecanismo em GitHub Actions self-hosted; a intenção deste fluxo é manter a validação independente do serviço de CI do GitHub.
