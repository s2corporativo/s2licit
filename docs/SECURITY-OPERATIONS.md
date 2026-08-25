# Segurança operacional do S2 Licit

## Produção

- branch `main` deve receber mudanças por PR com CI verde;
- deploy remoto usa usuário não-root, chave SSH e host key pinada;
- aplicação escuta apenas em loopback e é publicada pelo proxy HTTPS;
- `JWT_SECRET` e `ENCRYPTION_KEY` são segredos independentes e obrigatórios;
- migrations aplicadas são imutáveis; correções geram novas migrations;
- relatórios/avisos automáticos por e-mail permanecem desativados;
- envio SMTP é reservado a propostas/respostas comerciais;
- backup local deve ser acompanhado por cópia externa quando `BACKUP_OFFSITE_COMMAND` estiver configurado;
- smoke autenticado roda diariamente e abre incidente quando falha.

## Precificação

A formação automática usa fórmula por divisor e não pode ignorar tributos/frete por omissão. `PRICING_DEFAULT_TAX_PERCENT` e `PRICING_DEFAULT_FREIGHT_UNIT` funcionam como contingência; operações com regras específicas devem informar seus próprios valores.

## Matching

Similaridade de nome ou vetor gera candidato, não prova técnica. Códigos oficiais/exatos são determinísticos; medicamentos e itens técnicos exigem validação de princípio ativo, concentração, apresentação, forma, via e demais requisitos existentes no TR.
