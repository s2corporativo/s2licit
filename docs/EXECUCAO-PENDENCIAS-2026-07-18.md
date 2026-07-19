# Execução das pendências do S2 Licit — 18/07/2026

Este documento substitui listas históricas de pendências que ficaram desatualizadas após os PRs de consolidação.

## Executado nesta rodada

### Estabilidade e operação

- monitor de disponibilidade a cada 10 minutos para `/healthz` e `/readyz`;
- abertura, atualização e encerramento automático de incidente no GitHub;
- smoke autenticado diário e manual, com login real, rotas críticas, erros de navegador, capturas de tela e `summary.json`;
- encerramento do PR antigo #41, superado pelos PRs #42–#67;
- Central Operacional com diagnóstico de prontidão e bloqueios.

### Custos e precificação

- `product_supplier_offers` definida como fonte operacional canônica de custo;
- leitura de custos migrada para a fonte canônica;
- dual-write transacional temporário para `product_supplier_prices`, preservando compatibilidade;
- migração de reconciliação de dados existentes;
- view `canonical_product_costs` com menor custo válido por produto;
- painel de integridade para identificar dados somente no legado ou divergentes.

### Fornecedores e portais

- ranking explicável por preço efetivo, estoque, disponibilidade, atualização e confiabilidade da captura;
- certificação operacional por fornecedor e portal;
- checklist próprio para login, catálogo, paginação, preço, estoque, EAN, unidade, anexos, confirmação humana e protocolo;
- validade, evidência e histórico da certificação.

### Decisão executiva

- motor determinístico e auditável de GO, CAUTELA e NO-GO;
- pesos explícitos para margem, fornecedores, documentos, entrega, capital, concorrência, prazo e riscos;
- bloqueios absolutos e ações recomendadas;
- histórico por oportunidade;
- interface na Central Operacional.

### Contratos

- ciclo contratual com órgão, número, objeto, valor, saldo, vigência, reajuste, garantia e status;
- saldos por item previstos na estrutura de dados;
- alertas de contratos próximos do vencimento;
- interface inicial de cadastro e acompanhamento.

### Experiência do usuário

- busca global e busca de menor preço reunidas numa única tela com duas abas;
- rota antiga `/busca` preservada por redirecionamento;
- rotas antigas de decisão e contratos redirecionadas para o módulo funcional;
- Central Operacional adicionada ao menu;
- logo externo removido do shell; marca passa a ser renderizada localmente.

## Configurações administrativas necessárias

As tarefas abaixo dependem de credenciais e decisões do administrador; não podem ser inventadas nem inseridas automaticamente pelo código:

1. criar uma conta dedicada de smoke test, com papel `editor` e sem dados pessoais;
2. cadastrar os secrets `SMOKE_USER_EMAIL` e `SMOKE_USER_PASSWORD`;
3. cadastrar `SMOKE_MFA_TOKEN` somente se a conta de smoke usar MFA;
4. cadastrar `VPS_HOST_KEY` com a chave real do host SSH;
5. migrar o acesso de deploy de senha para chave SSH;
6. ativar `FORCE_SECURE_COOKIES=true` depois de confirmar HTTPS válido;
7. cadastrar e testar credenciais reais dos fornecedores e portais;
8. preencher e aprovar as certificações operacionais na Central Operacional.

## Critério de conclusão operacional

O sistema somente deve exibir prontidão integral quando:

- IA, e-mail e cookies seguros estiverem configurados;
- não houver termos de captura pendentes;
- não houver captura com última execução falha;
- fornecedores e portais em uso estiverem certificados;
- não houver contratos vencendo sem providência;
- a integridade das fontes de custo não indicar registros divergentes;
- o monitor e o smoke de produção estiverem verdes.
