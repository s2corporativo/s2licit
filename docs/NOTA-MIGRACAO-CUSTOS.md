# Nota de migração — fonte canônica de custos

A partir desta rodada, a fonte operacional de custo é `product_supplier_offers`.

`product_supplier_prices` permanece temporariamente para compatibilidade. As escritas realizadas pela fachada `server/db/supplierPrices.ts` atualizam as duas estruturas na mesma transação. As leituras da fachada usam apenas a fonte canônica.

A remoção física da tabela antiga somente poderá ocorrer depois que:

1. o painel de integridade indicar `legacyOnly = 0` e `divergent = 0`;
2. buscas em código confirmarem ausência de consumidores diretos;
3. backup verificado estiver disponível;
4. a migração for testada em cópia da produção;
5. houver plano de rollback.
