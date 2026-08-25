# RAG e matching

- RAG e similaridade nominal servem para recuperar candidatos.
- `autoMatch` do RAG puro permanece `false`.
- Nome nunca recebe score persistido 1.000; identidade textual não equivale a identidade técnica.
- CATMAT/CATMAS exatos são métodos determinísticos.
- Medicamentos exigem validação dos atributos técnicos informados no TR.
- A recuperação RAG é paginada por `productId`; limite atingido deve ser sinalizado como truncamento, nunca como busca completa.
