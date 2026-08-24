# Motor de Equivalências RAG — Módulo Nativo do S2

Recuperação aumentada por contexto (RAG) para busca semântica de equivalências no catálogo de produtos do S2, integrada ao gateway de IA existente (`_core/llm.ts`) e ao Normalization Engine oficial (`shared/normalize.ts`).

## Arquitetura

| Camada | Arquivo | Função |
|---|---|---|
| Embedding | `embedding.ts` | Converte texto em vetores (768 dim). Provedores: `local` (Ollama na VPS), `remote` (Ollama externo), `groq` (Groq hospedado), com fallback automático |
| Digest | `digest.ts` | Texto canônico do produto (nome, princípio ativo, concentração, forma, via, espécie, classe, fabricante, descrição) + similaridade de cosseno |
| Config | `ragConfig.ts` | Fonte única de configuração (`rag_config`), cache 60s, defaults seguros (motor desligado até ativação explícita) |
| Indexação | `indexer.ts` | Reindexação em lote (`reindexAll`), incremental (`reindexProduct`), limpeza de órfãos (`cleanOrphans`) |
| Busca | `search.ts` | 3 estágios: recuperação vetorial (topK), pré-filtro por score mínimo, justificativa técnica opcional via LLM |
| API | `routers/rag.ts` | Endpoints tRPC sob `rag.*` (status, buscar, reindexAll, reindexOne, cleanOrphans, config) |

## Banco (migration `0024_rag_motor_equivalencias.sql`)

- `product_embeddings` — vetor JSON (768 dim), digest canônico auditável, versão do pipeline.
- `rag_config` — pares chave/valor lidos por `ragConfig.get()`.

O S2 roda MySQL 8.0, sem extensão vetorial nativa: a similaridade é calculada em memória sobre os `topK` candidatos pré-carregados (padrão 25). Suficiente para catálogos de até ~100 mil produtos com `topK` pequeno; o filtro por `tipoCatalogo` reduz o escopo antes do cálculo.

## Ativação (sequência operacional)

1. Aplicar a migration `0024_rag_motor_equivalencias.sql` no banco de produção.
2. Instalar o Ollama na VPS do S2 e baixar o modelo: `ollama pull nomic-embed-text` (Opção A — recomendada) **ou** apontar `RAG_OLLAMA_URL` para um Ollama remoto (Opção B) **ou** definir `RAG_GROQ_API_KEY` (Opção C — paga por uso).
3. Ativar o motor pelo painel (admin) ou via env: `RAG_EMBEDDING_PROVIDER=local`.
4. Rodar `reindexAll` pela primeira vez (editor+). Reindexar após atualizações de produto ocorre automaticamente quando `rag.reindexOnUpdate=true`.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `RAG_EMBEDDING_PROVIDER` | `local` | `local`, `remote` ou `groq` |
| `RAG_OLLAMA_URL` | `http://localhost:11434` | URL base do Ollama |
| `RAG_GROQ_API_KEY` | — | Chave Groq (fallback do embedding e/ou provedor principal) |
| `RAG_GROQ_EMBED_MODEL` | `nomic-embed-text` | Modelo de embedding no Groq |
| `RAG_EMBEDDING_TIMEOUT_MS` | `15000` | Timeout por chamada de embedding |

## Endpoints tRPC (`rag.*`)

- `rag.status` — configuração vigente + estatísticas do índice (qualquer usuário logado).
- `rag.buscar` — `{ q, tipoCatalogo?, topK?, comJustificativa? }` — busca semântica de equivalências.
- `rag.reindexAll` / `rag.reindexOne` / `rag.cleanOrphans` — editor.
- `rag.config.set` / `rag.config.toggle` — admin.

## Frases de segurança

- TR/descrição sem candidatos acima do limiar (`minScore` 0.72): retorna **"TR tecnicamente insuficiente para correspondência segura."**
- Motor desligado: retorna **"Motor de Equivalências RAG desativado na configuração."**

Nenhum equivalente é sugerido abaixo do limiar — alinhado à política de não invenção de correspondências.

## Justificativa por IA

Quando `comJustificativa=true`, até 5 candidatos recebem justificativa técnica (princípio ativo, concentração, via, fabricante, score) via o gateway `_core/llm.ts` (respeita `AI_PROVIDER` e registra custo em `ai_usage_daily`; `maxTokens=150` por justificativa).

## Testes

- `server/rag/digest.test.ts` — digest canônico e similaridade de cosseno (11 testes).
- Typecheck: `pnpm exec tsc --noEmit` — aprovado.
