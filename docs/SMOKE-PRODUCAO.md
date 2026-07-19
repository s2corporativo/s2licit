# Smoke autenticado de produção

## Conta dedicada

Crie no S2 uma conta exclusiva para teste automático:

- papel: `editor`;
- sem acesso administrativo;
- sem dados pessoais;
- senha forte exclusiva;
- MFA desativado, salvo se houver mecanismo de geração automática de TOTP no secret.

Cadastre no GitHub:

- `SMOKE_USER_EMAIL`;
- `SMOKE_USER_PASSWORD`;
- opcionalmente `SMOKE_MFA_TOKEN`;
- variável opcional `S2_BASE_URL`;
- variável opcional `SMOKE_ROUTES`.

## O que é validado

1. `/healthz`;
2. `/readyz`;
3. login real;
4. manutenção da sessão;
5. rotas críticas;
6. respostas HTTP;
7. tela vazia ou mensagens fatais;
8. erros JavaScript no navegador;
9. capturas de tela;
10. resumo em JSON.

## Execução

O workflow `Smoke de produção` roda diariamente e também pode ser executado manualmente em **Actions**.

Em falha, abre ou atualiza automaticamente a issue `🚨 Smoke de produção do S2 Licit falhou`. Quando volta a passar, registra a recuperação e encerra o incidente.
