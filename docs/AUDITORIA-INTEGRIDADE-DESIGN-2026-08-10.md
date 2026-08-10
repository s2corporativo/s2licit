# Auditoria de integridade, funcionalidade e modernização — 10/08/2026

## Escopo

Revisão do estado atual do repositório `s2corporativo/s2licit`, com foco em:

- integridade da base e estratégia de validação;
- observabilidade de produção;
- risco de falso positivo nos testes de smoke;
- estrutura de navegação e consistência de UX;
- modernização do shell visual e do dashboard sem alterar regras de negócio.

## Estado da base auditada

- Branch de origem: `main`.
- Commit-base da auditoria: `ec2c93d149fc5777fa4ef283bf2f68f2c6f2888e`.
- Stack principal: React 19, TypeScript, Vite, Express, tRPC, Drizzle ORM e MySQL.
- O `package.json` possui comandos formais para `check`, `lint`, `test`, `build` e migrações.
- O `Dockerfile.validate` executa TypeScript, lint, Vitest e build.
- O `scripts/validate-free.sh` amplia a validação com imagem Docker, MySQL temporário, reaplicação de migrações e testes de integração em banco real.

## Achados de integridade e funcionalidade

### P0 — smoke de produção gerava falso positivo

O workflow `production-smoke.yml` exigia `SMOKE_USER_EMAIL` e `SMOKE_USER_PASSWORD`. Quando as credenciais não existiam, a etapa de configuração falhava antes do navegador; o smoke autenticado era pulado, mas a etapa de gestão de incidente interpretava a ausência de resultado como falha da produção.

Efeito observado:

- a issue `#70 — Smoke de produção do S2 Licit falhou` recebeu registros recorrentes;
- no run de 09/08/2026, a etapa de credenciais falhou e a execução real do smoke ficou como `skipped`;
- portanto esses registros não demonstravam, por si só, indisponibilidade ou defeito funcional da aplicação.

Correção aplicada nesta branch:

- separar `configured=false` de `smoke failure`;
- criar diagnóstico específico para credenciais ausentes;
- somente classificar como incidente de produção quando o smoke tiver sido efetivamente executado;
- preservar status vermelho para configuração incompleta, mas com causa correta.

### P0 — não há validação executável via GitHub hospedado

As issues `#76`, `#77` e `#94` registram falha de startup dos runners antes da primeira etapa. Isso não é evidência de falha do código do S2.

O próprio projeto documenta a decisão de não depender de GitHub Actions hospedado e de executar a validação completa gratuitamente na VPS com:

```bash
bash scripts/validate-free.sh
```

Consequência operacional: nenhuma alteração deve ser considerada pronta para produção sem os exit codes reais desse comando na VPS ou em ambiente Docker equivalente.

### P1 — disponibilidade básica e teste funcional estavam misturados

O projeto possui monitor de `/healthz` e `/readyz`, além do smoke autenticado. Esses sinais medem coisas diferentes:

- health/readiness: processo, dependências essenciais e prontidão do backend;
- smoke autenticado: login, permissões, navegação e rotas críticas.

A correção do workflow impede que falta de credencial do smoke contamine o diagnóstico de disponibilidade da aplicação.

## Auditoria de design e UX

### Problemas encontrados

1. O tema global já declarava sidebar escura, mas o `AppLayout` ainda renderizava uma sidebar branca, gerando inconsistência entre tokens e interface real.
2. O comentário de identidade visual no CSS ainda referenciava outro projeto, sinal de reaproveitamento de tokens sem saneamento final.
3. A navegação tinha boa organização funcional, mas pouca diferenciação visual entre contexto, grupo e item ativo.
4. O topo oferecia apenas busca; faltava acesso contextual ao assistente IA e indicação clara de localização no sistema.
5. O dashboard funcionava, mas apresentava hierarquia visual quase uniforme entre decisão, métricas e atalhos.

## Modernização aplicada

### Shell global

- sidebar marinho escuro com identidade S2 consistente;
- item ativo com contraste e marcador lateral;
- grupos de navegação mantidos, evitando ruptura de jornada;
- cartão de usuário mais compacto e legível;
- cabeçalho com contexto `S2 Licit / grupo / página`;
- acesso direto ao Assistente IA;
- busca global destacada;
- comportamento mobile preservado.

### Design system global

- tokens de cor saneados e alinhados ao azul institucional;
- fundo operacional com profundidade discreta;
- superfícies e bordas padronizadas;
- foco visível e melhorias de acessibilidade;
- tabela, busca, badges e preços legados preservados e atualizados;
- classes compartilhadas `s2-main`, `s2-panel` e `s2-kicker` para evolução gradual das telas.

### Dashboard

- hero executivo transformado em central de decisão;
- indicação imediata de prazos e propostas ativas;
- acesso rápido ao radar e à IA;
- cartões de métricas com hierarquia mais clara;
- prioridades operacionais reorganizadas;
- pipeline visual mais legível;
- atalhos complementares mantidos, inclusive `Importar XML` em `/importar-nfe`.

## O que não foi alterado

- regras de negócio;
- contratos tRPC;
- schema Drizzle;
- migrations;
- autenticação e RBAC;
- rotas existentes;
- integrações e scrapers;
- formato de dados.

A modernização foi deliberadamente concentrada na camada visual compartilhada e no dashboard para reduzir risco regressivo.

## Validação obrigatória antes do merge/deploy

Na VPS ou ambiente Docker equivalente:

```bash
bash scripts/validate-free.sh
```

Critério de aceite:

1. `pnpm check` com exit code 0;
2. lint com exit code 0;
3. Vitest com exit code 0;
4. build de produção concluído;
5. imagem Docker construída;
6. MySQL temporário inicializado;
7. migrações aplicadas duas vezes sem erro;
8. testes de integração MySQL aprovados.

Após deploy em homologação, executar também o smoke autenticado com conta dedicada de papel `editor`.

## Risco residual

A presente auditoria conseguiu verificar código, histórico, configuração dos validadores, issues e evidências do workflow. O ambiente desta sessão não conseguiu resolver o DNS público de `s2.s2corporativo.com.br`, e os runners hospedados do GitHub não estão disponíveis para executar a suíte. Portanto, não há base técnica para declarar o runtime integralmente homologado até a execução do `validate-free.sh` na VPS.
