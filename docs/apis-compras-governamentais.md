# APIs de Compras Governamentais - Catálogo ODA

Fonte: https://catalogodedadosabertos.com.br/Comprasgovernamentais

## Categorias identificadas

### Licitações (Compras.gov.br / SIASG)
- Compras sem licitação - Consulta básica
- Itens sem licitação - Consulta básica
- Compras sem licitação - Consulta detalhada
- Itens sem licitação - Consulta detalhada
- Licitações - Consultas básicas
- Itens de licitação - Consultas básicas

### Pregões (Compras.gov.br)
- Pregões - Consultas básicas
- Tipos Pregão - Consultas básicas
- Situações Pregão - Consultas básicas
- Órgãos Pregão - Consultas básicas
- Objetos Pregão - Consultas básicas
- Itens Pregão - Consultas básicas ← **CHAVE: lista itens de um pregão**
- Pregão - Consultas detalhadas
- Item Pregão - Consultas detalhadas ← **CHAVE: detalhes de um item específico**

### Contratos
- Contratos - Consulta básica
- Aditivos de contrato - Consulta básica
- Apostilamentos de contrato - Consulta básica
- Tipos de contrato - Consulta básica
- Cronogramas - Consulta básica
- Eventos de contrato - Consulta básica
- Contratos - Informações detalhadas
- Aditivos de contrato - Informações detalhadas
- Apostilamentos de contrato - Informações detalhadas
- Tipos de contrato - Informações detalhadas
- Cronogramas - Informações detalhadas
- Eventos de contrato - Informações detalhadas
- Contratos - Consultas básicas (outra versão)
- Cronogramas - Consultas básicas (outra versão)

### Financeiro
- Despesas acessórias - Consultas básicas
- Empenhos - Consultas básicas
- Faturas - Consultas básicas
- Garantias - Consultas básicas
- Históricos - Consultas básicas
- Itens - Consultas básicas (itens de contratos)
- Contrato - Informações detalhadas
- Cronograma - Informações detalhadas
- Despesa acessória - Informações detalhadas
- Empenho - Informações detalhadas
- Fatura - Informações detalhadas
- Garantia - Informações detalhadas
- Histórico - Informações detalhadas
- Item - Informações detalhadas (item de contrato)
- Preposto - Informações detalhadas
- Responsável - Informações detalhadas
- Terceirizado - Informações detalhadas

### Fornecedores/Consulta
- Âmbitos de ocorrência - Consultas básicas
- Prepostos - Consultas básicas
- Responsáveis - Consultas básicas
- Terceirizados - Consultas básicas

### Catálogo de Serviços (CATSER)
- Seções - Consultas básicas
- Divisões - Consultas básicas
- Grupos - Consultas básicas
- Classes - Consultas básicas
- Subclasses - Consultas básicas
- Serviços - Consultas básicas
- Seções - Informações detalhadas
- Divisões - Informações detalhadas
- Grupos - Informações detalhadas
- Classes - Informações detalhadas
- Subclasses - Informações detalhadas
- Serviços - Informações detalhadas
- Item do PGC - Consulta detalhada

## Endpoints mais relevantes para integração

### 1. Itens de Pregão (MAIS IMPORTANTE)
- **Itens Pregão - Consultas básicas**: lista itens de um pregão pelo número
- **Item Pregão - Consultas detalhadas**: detalhes completos de um item específico
- Uso: pré-preencher proposta com itens do edital (descrição, quantidade, unidade, valor estimado)

### 2. Pregão - Consultas detalhadas
- Detalhes completos de um pregão (objeto, órgão, datas, situação)
- Uso: enriquecer dados do Radar com informações detalhadas

### 3. Contratos - Informações detalhadas
- Contratos firmados com valores praticados
- Uso: referência de preços históricos para precificação

### 4. Itens de licitação - Consultas básicas
- Itens de licitações (não pregão)
- Uso: complementar o Radar para licitações não pregão

## Observações
- APIs marcadas com cadeado verde = acesso público (sem autenticação)
- APIs marcadas com cadeado amarelo = requer autenticação
- Base URL provável: https://compras.dados.gov.br/
- Alternativa PNCP: https://pncp.gov.br/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens
