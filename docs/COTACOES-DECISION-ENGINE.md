# Cotações — Decision Engine

Implementação do fluxo operacional por exceção no S2Licit.

## Fluxo

`cotação → memória de match → equivalentes → fornecedores → custo real → risco → decisão → proposta`

## Recursos

- Memória de matches aprovados por similaridade de descrição, órgão e recorrência.
- Peso adicional para produtos usados em cotações marcadas como `ganhou`.
- Ranking de fornecedores ponderando custo final, disponibilidade/estoque, frescor do preço e histórico de vitórias.
- Semáforo por item (`green`, `yellow`, `red`) com motivos explícitos.
- Margem mínima de proteção usando a configuração corporativa existente.
- Cálculo do preço máximo de aquisição compatível com a margem mínima.
- Validade do preço: atual (até 7 dias), atenção (8–30), desatualizado (>30) ou desconhecido.
- Pesquisa e análise em lote de toda a cotação.
- Ação **Resolver cotação com IA**: confirma automaticamente apenas memórias/candidatos acima dos limiares seguros e deixa exceções para revisão humana.
- Comparação visual do produto atual, memória histórica e equivalentes técnicos.
- Tela final com custo, frete, tributos, venda, lucro, margem e contagem de itens seguros/em revisão/bloqueados.

## Regras de auto-resolução

- Memória operacional: confiança >= 0,94.
- Similaridade assistida: score >= 0,92.
- A auto-resolução gera trilha em `audit_logs` como `AUTO_MATCH_CONFIRMED`.
- Itens de risco vermelho bloqueiam a indicação `canGenerate` da nova camada de decisão.
- A geração e o envio de proposta continuam usando os serviços existentes do S2Licit; não há envio automático novo nesta implementação.

## Fontes de preço

O ranking utiliza exclusivamente ofertas e histórico já sincronizados no S2Licit (`product_supplier_offers` e `price_history`). Nenhum preço externo é inventado nem inferido sem fonte cadastrada.
