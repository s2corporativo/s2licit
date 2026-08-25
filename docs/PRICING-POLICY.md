# Política de custo e preço

1. Similaridade/matching não define preço.
2. Custo precisa de fonte e data para automação; custo histórico sem data exige confirmação humana.
3. Preço automático usa divisor: `(custo + frete + custo fixo) / (1 - tributos% - margem%)`.
4. `PRICING_DEFAULT_TAX_PERCENT` e `PRICING_DEFAULT_FREIGHT_UNIT` são contingência, não substituem regra específica da operação.
5. O Motor Tributário permanece estimativo e deve indicar as regras usadas.
6. Envio automático de proposta permanece desligado.
