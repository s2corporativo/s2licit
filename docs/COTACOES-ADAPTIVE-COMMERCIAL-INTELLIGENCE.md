# Cotações — aprendizado e inteligência comercial

Esta evolução complementa o motor de decisão das Cotações Recebidas sem criar bases paralelas.

## Aprendizado operacional
- O match aprovado continua sendo a memória principal do produto.
- Trocas, rejeições, escolha de fornecedor e ajuste de venda geram eventos `QUOTATION_FEEDBACK` na trilha de auditoria.
- O score de fornecedor usa custo, disponibilidade, frescor, taxa de vitória, confiabilidade operacional e preferência registrada pelo operador.

## Atualização de preços
- Ao abrir uma cotação com preço vencido/desconhecido, a interface solicita atualização uma vez por sessão da cotação.
- Somente scrapers habilitados e com `tosAprovado = true` podem ser acionados.
- Uma fonte executada nos últimos 30 minutos não é disparada novamente.
- O operador também dispõe de atualização manual e em lote.

## Proteção comercial
O painel bloqueia/alerta para:
- margem abaixo do mínimo;
- preço vencido ou sem data confiável;
- fornecedor sem disponibilidade;
- fonte alternativa materialmente mais barata;
- valor total acima da mediana histórica vencedora do mesmo órgão, quando houver amostra.

## Modo rápido
Para cotações extensas, o operador pode usar tabela compacta, seleção múltipla e ações:
- aprovar matches seguros;
- aplicar melhor custo de fornecedor;
- aplicar margem em lote;
- atualizar custos.

## Inteligência comercial
O painel consolida:
- taxa de vitória;
- margem média observada;
- gap médio das perdas;
- produtos e fornecedores mais vencedores;
- desempenho por categoria;
- produtos prioritários para manter preço atualizado.

## Governança
- Nenhum envio de proposta é feito automaticamente por esta camada.
- A geração da proposta continua dependente das regras de geração existentes.
- Atualizações externas respeitam os conectores/scrapers já autorizados no S2Licit.
- Toda ação adaptativa relevante gera auditoria.
