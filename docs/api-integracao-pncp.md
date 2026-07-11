# Integração PNCP - Busca de Itens do Pregão

## Objetivo
Implementar busca automática de itens do pregão via PNCP ao clicar em "Criar Proposta" no Radar Nacional de Licitações, pré-preenchendo a proposta com descrição, quantidade, unidade e valor estimado dos itens do edital.

## Endpoints PNCP Disponíveis

### 1. Busca de Itens de um Pregão (PRINCIPAL)
**Endpoint:** `GET /api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens`

**Base URL:** `https://pncp.gov.br`

**Parâmetros:**
- `cnpj`: CNPJ do órgão (sem formatação)
- `ano`: Ano da licitação (ex: 2026)
- `sequencial`: Número sequencial da licitação (ex: 00000001)
- `pagina`: Número da página (padrão: 1)
- `tamanhoPagina`: Itens por página (máximo: 500)

**Resposta esperada:**
```json
{
  "data": [
    {
      "numeroItem": 1,
      "descricao": "Medicamento X - frasco-ampola 10mL",
      "quantidade": 100,
      "unidadeMedida": "frasco",
      "valorUnitarioEstimado": 25.50,
      "valorTotal": 2550.00,
      "catalogoItemId": "123456",
      "categoriaItem": "Medicamentos"
    }
  ]
}
```

### 2. Busca de Licitações (já implementado)
**Endpoint:** `GET /api/consulta/v1/contratacoes/publicacao`

**Parâmetros obrigatórios:**
- `dataInicial`: YYYYMMDD
- `dataFinal`: YYYYMMDD
- `codigoModalidadeContratacao`: 8 (Pregão Eletrônico)
- `tamanhoPagina`: máximo 50

## Fluxo de Integração

### 1. Radar → Criar Proposta
Ao clicar em "Criar Proposta" em uma oportunidade do Radar:
1. Extrair CNPJ, ano e sequencial da oportunidade
2. Chamar endpoint `radar.getPregoItems` com esses parâmetros
3. Buscar itens via PNCP
4. Pré-preencher proposta com itens encontrados

### 2. Estrutura de Dados
Adicionar à tabela `radarOpportunities`:
- `cnpjOrgao`: CNPJ do órgão (já existe)
- `anoCompra`: Ano da licitação (extrair de `pncpId`)
- `sequencialCompra`: Sequencial da licitação (extrair de `pncpId`)

### 3. Endpoint tRPC
```typescript
getPregoItems: publicProcedure
  .input(z.object({
    cnpj: z.string(),
    ano: z.number(),
    sequencial: z.number(),
  }))
  .query(async ({ input }) => {
    // Buscar itens via PNCP
    // Retornar array de itens formatados
  })
```

## Tratamento de Erros
- **404**: Pregão não encontrado → retornar array vazio
- **Timeout**: Implementar retry com backoff
- **JSON Parse Error**: Validar Content-Type antes de parsear

## Otimizações
- Cache de itens por 24h (evitar múltiplas requisições)
- Rate limit: 1 req/s para não sobrecarregar PNCP
- Paginação automática se houver > 500 itens

## Referências
- Documentação PNCP: https://pncp.gov.br/
- API Compras MG: https://api.prodemge.gov.br/ (alternativa para MG)
- Catálogo de APIs: https://catalogodedadosabertos.com.br/Comprasgovernamentais
