## Mudança
Cache LRU em memória no `embedText` (server/rag/embedding.ts): 500 entradas, TTL de 30 min, chave por provedor+modelo+texto. Reduz chamadas repetidas ao Ollama (digesets de produto recorrentes e buscas RAG repetidas); cada chamada evitada economiza ~7 s de CPU.

O cache nunca substitui os vetores persistidos em `productEmbeddings`. `clearEmbedCache()` disponível para invalidação.

## Validado
- tsc --noEmit OK
- vitest: 728 testes aprovados (nenhum quebrado)

## Riscos
Baixo: cache é RAM (volátil), mesma família de modelo na chave, limite de memória controlado.
