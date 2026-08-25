# Matriz de correção

| Item | Correção |
|---|---|
| 3 | defaults de tributo/frete passam pelo divisor de preço |
| 4 | nome é candidato; produção exige score 1 e nome é limitado a 0,999 |
| 5 | RAG puro nunca marca autoMatch |
| 6 | RAG pagina por productId e sinaliza hard-cap |
| 7 | política de custo sem data criada e habilitada por padrão |
| 8 | política de DDL de boot definida; produção usa migrations |
| 9 | preflight de migration drift bloqueia boot |
| 10 | integridade compara colunas reais com Drizzle |
| 11 | deploy possui gate integral próprio |
| 12 | deploy por chave, host pinado, não-root |
| 13 | app exposto somente em loopback |
| 14 | mutações sistêmicas críticas exigem Admin |
| 15 | autenticação forte preservada |
| 19 | guarda de plausibilidade de preço de scraper criada |
| 20 | motor tributário estimativo preservado |
| 21 | fórmula unificada preservada e passa a receber defaults de custo |
| 22 | fluxo de cotação preservado |
| 23 | bloqueio por sanção preservado |
| 24 | telemetria cliente separada da auditoria confiável |
| 25 | backup admite cópia offsite e sinaliza falha |
| 26 | smoke diário reativado em runner externo |
| 27 | novos testes críticos e política de cobertura adicionados |
| 28 | CodeQL + dependency audit versionados |
| 29 | política de readiness genérico adicionada |
| 30 | documentação de cookie corrigida no exemplo de produção |
| 31 | relatório diário desligado na produção e SMTP rejeita aviso automático sem falso positivo |
