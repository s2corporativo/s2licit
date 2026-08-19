# Módulo AgenticSeek — Prospecção automatizada de licitações

## Visão geral

O AgenticSeek é um módulo interno do S2 Licít que transforma um objetivo de
prospecção em linguagem natural em uma lista priorizada de licitações públicas
do PNCP, com órgãos validados e pontuação de relevância por IA. Ele substitui a
minuta anterior "AgenticSeek Clone" (Node.js isolado, scraper Puppeteer e
credenciais versionadas) por uma implementação integrada à arquitetura real do
S2 Licít (tRPC + Drizzle + MySQL), consumindo a **API oficial do PNCP**
(pncp.gov.br/api) e a API pública da BrasilAPI para consulta de CNPJ.

## O que o módulo faz

| Etapa | Descrição |
|---|---|
| 1. Busca no PNCP | Consulta `/api/consulta/v1/contratacoes/publicacao` com intervalo de datas, UF, município (quando disponível) e modalidades. Usa o conector existente `pncpConnector` (rate limit, `api_logs`, tratamento de erros). |
| 2. Filtragem | Filtra por palavras-chave derivadas do objetivo (heurística local, sem custo de IA). |
| 3. Validação de CNPJ | Validação de dígitos verificadores (mod-11) em `cnpjUtils.ts` + consulta BrasilAPI para natureza jurídica/CNAE. Não penaliza falhas transitórias de API. |
| 4. Pontuação IA | `invokeLLM` com schema JSON: score 0–100, justificativa e compatibilidade do órgão. Falha de IA → score neutro (50), nunca aborta a busca. |
| 5. Consolidação | Resultados persistidos em `agenticseek_resultados`, ordenados por score. |
| 6. Ação | Envio individual ou em lote ao funil de oportunidades (`funilOportunidades`, `origemTipo = "manual"` com observação) e exportação CSV. |

## Arquivos

| Arquivo | Camada | Finalidade |
|---|---|---|
| `drizzle/schema.ts` (final) | Banco | Tabelas `agenticseek_buscas` e `agenticseek_resultados` |
| `drizzle/0023_agenticseek_module.sql` | Banco | Migration idempotente (`CREATE TABLE IF NOT EXISTS`) |
| `drizzle/meta/_journal.json` | Banco | Registro da migration 0023 |
| `server/utils/cnpjUtils.ts` | Serviço | Validação determinística de CNPJ (mod-11) e formatação |
| `server/services/agenticSeekService.ts` | Serviço | Núcleo: iniciarBusca, executarBusca, scoring, validação, CSV, funil |
| `server/routers/agenticSeekRouter.ts` | API | Rotas tRPC `agenticSeek.*` |
| `server/routers.ts` | API | Registro do router |
| `server/services/agenticSeek.test.ts` | Teste | 13 testes unitários (CNPJ, scoring com/mock de falha, validação, CSV) |
| `client/src/pages/AgenticSeek.tsx` | Frontend | Tela de busca com polling de status |
| `client/src/App.tsx` | Frontend | Rota `/agenticseek` (minRole `editor`) |
| `client/src/components/AppLayout.tsx` | Frontend | Entrada de menu "AgenticSeek" no grupo Oportunidades |

## Rotas tRPC

| Rota | Autorização | Descrição |
|---|---|---|
| `agenticSeek.iniciar` | protected (editor+) | Dispara busca; retorna `{ buscaId }` |
| `agenticSeek.historico` | protected | Últimas 25 buscas do usuário |
| `agenticSeek.status` | protected | Status da busca (para polling) |
| `agenticSeek.resultados` | protected | Resultados com score, validação e custo |
| `agenticSeek.exportarCsv` | protected | CSV completo (até 500 linhas) |
| `agenticSeek.enviarParaFunil` | admin | Um resultado por chamada, evita duplicação |
| `agenticSeek.cancelar` | protected (dono) | Cancela busca pendente/em execução |

A autorização é duplicada no backend (nenhuma dependência do frontend).

## Custo de IA

O custo de cada busca é estimado com `estimateCostUsd`/`usdBrlRate` usando o
modelo ativo (`activeProvider`) e persistido em `agenticseek_buscas`. Uma busca
típica consome centavos de real por avaliação de órgãos; os resultados mostram
o custo estimado em US$ e R$ na própria tela.

## Deploy

Executar a migration em produção:

```bash
./scripts/backup.sh
docker compose exec backend mysql ... < drizzle/0023_agenticseek_module.sql
# ou alembic/drizzle-kit conforme o fluxo atual de migrations do S2 Licít
docker compose restart backend
```

A migration é idempotente (pode ser executada mais de uma vez sem efeito colateral).

## Rollback

1. Desfazer o merge do PR (o código não altera módulos existentes).
2. Remover as tabelas `agenticseek_buscas` e `agenticseek_resultados` (dados do módulo; funil de oportunidades permanece intacto, pois os registros enviados criam linhas independentes em `funilOportunidades`).

## Limitações conhecidas

1. A API pública do PNCP expõe apenas **1 página por modalidade por chamada**
   no endpoint de publicações; a busca cobre a primeira página de cada
   modalidade selecionada (até 6 modalidades), conforme documentado no serviço.
   Paginação profunda exigiria `N × modalidades` chamadas e foi deliberadamente
   não implementada para conter custo e tempo de execução.
2. A filtragem municipal depende do campo `unidadeOrgao` do PNCP, que nem
   sempre é preenchido; nesse caso o resultado aparece sem município.
3. O envio ao funil usa `origemTipo = "manual"` com observação do módulo; não
   houve alteração do enum `origemTipo` para evitar mudança destrutiva em dados.
4. A pontuação por IA usa o provedor LLM já configurado no S2 Licít
   (`ANTHROPIC_API_KEY`/`GROQ_API_KEY` etc., conforme `.env` de produção); a
   execução falha com gracefully (score 50) quando o provedor está indisponível.
