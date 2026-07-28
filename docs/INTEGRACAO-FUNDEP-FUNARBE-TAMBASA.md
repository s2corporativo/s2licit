# Integração Fundep, Funarbe e Tambasa

## Objetivo

Automatizar a identificação de oportunidades públicas da Fundep e da Funarbe, cruzar os itens solicitados exclusivamente com o catálogo da Tambasa e encaminhar o resultado para o fluxo já existente de cotações, precificação, proposta e funil do S2 Licit.

## Fluxo operacional

1. O agendador consulta os portais públicos da Fundep e da Funarbe às 7h, 12h e 17h, no horário de Brasília.
2. Cada processo/lote recebe um identificador sintético e idempotente (`portal:<fonte>:<id externo>`), impedindo duplicações.
3. Os itens extraídos são comparados somente com produtos ativos vinculados ao fornecedor Tambasa.
4. A oportunidade é gravada nas tabelas existentes `email_quotations` e `email_quotation_items`.
5. O resultado aparece em **Cotações Recebidas**, com indicação de itens encontrados e não encontrados.
6. O operador confirma cada correspondência, revisa o custo e aplica a precificação do S2.
7. A proposta pode ser gerada em PDF, enviada ao funil e pré-preenchida no portal pelo Agente de Propostas.
8. O envio final permanece sujeito à aprovação humana.

## Governança e segurança

- A integração não resolve nem contorna CAPTCHA.
- Nenhuma proposta é enviada apenas pelo job de captura.
- Matches automáticos entram com `matchConfirmado = false`.
- A geração ou o envio de orçamento permanece bloqueado enquanto houver item sem confirmação ou sem custo positivo.
- As credenciais Fundep/Funarbe continuam no cofre criptografado já existente em **Portais de Licitação**.
- O serviço usa apenas URLs públicas fixas e aplica a proteção SSRF do sistema.
- As páginas são consultadas com concorrência limitada e timeout.

## Configuração por ambiente

```env
# Liga/desliga a captura pública Fundep/Funarbe
PORTAL_OPPORTUNITY_SYNC_ENABLED=true

# Padrão: 7h, 12h e 17h, horário de Brasília
PORTAL_OPPORTUNITY_SYNC_CRON="0 7,12,17 * * *"
```

## Primeira ativação

1. Cadastrar ou confirmar o fornecedor **Tambasa**.
2. Configurar o conector Tambasa e confirmar que os termos de uso foram revisados.
3. Executar a sincronização completa do catálogo Tambasa.
4. Abrir **Cotações Recebidas** e usar **Buscar Fundep/Funarbe** para o primeiro teste.
5. Conferir a qualidade dos matches antes de gerar qualquer proposta.
6. Cadastrar as credenciais dos portais na tela **Portais de Licitação** somente quando for utilizar o pré-preenchimento autenticado.

## Limitações operacionais

A estrutura HTML dos portais pode ser alterada sem aviso. Quando isso ocorrer, a captura registra aviso/falha sem enviar proposta incorreta. O parser da Funarbe possui fallback com navegador renderizado, mas oportunidades cuja descrição detalhada esteja exclusivamente após autenticação podem exigir abertura pelo Agente de Propostas.
