# Análise do Guia DrogaVet — Princípios Ativos e Formulações (13ª edição)

## Metadados do Documento
- **Título:** Guia de Princípios Ativos e Formulações — Pequenos Animais
- **Edição:** 13ª (2021)
- **Autor:** Sandra Mara Schuster, Thereza Julyana Simião Denes
- **Editora:** DrogaVET Farmácia de Manipulação Veterinária Ltda.
- **Páginas:** 370
- **Escopo:** Medicamentos veterinários para cães, gatos e espécies não convencionais

## Estrutura do Documento

### Seção 1: Prescrição de Receitas Magistrais (p. 26-32)
- Partes da receita
- Prescrição de substâncias sujeitas a controle especial
- Informações importantes sobre manipulação

### Seção 2: Sais Disponíveis para Manipulação (p. 44-100)
- **Cães e Gatos (p. 44-99):** Princípios ativos com funções e dosagens
- **Espécies Não Convencionais (p. 100-127):** Princípios ativos específicos

### Seção 3: Fórmulas por Classe Terapêutica (p. 128-370)

#### Categorias Identificadas:
1. **Fórmulas para Pele, Mucosa e Ouvidos (p. 128-132)**
   - Antifúngicas (Xampu com Melaleuca, Cetoconazol, Itraconazol, etc.)
   - Ectoparasiticidas e repelentes (Neem, Permetrina, Citronela)

2. **Fórmulas Ectoparasiticidas (p. 133+)**
   - Antipulgas (Nanoneem, Permetrina, Óleos essenciais)
   - Anticarrapatos
   - Repelentes

3. **Outras Classes Terapêuticas** (estrutura similar com múltiplas fórmulas por categoria)

## Princípios Ativos Identificados

### Antifúngicos
- Óleo de Melaleuca
- Nanoclimbazol
- Clorexidine
- Cetoconazol
- Ciclopirox
- Itraconazol
- Equinácea
- Terbinafina

### Ectoparasiticidas
- Óleo de Neem (Nanoneem)
- Permetrina
- Citronela
- Iodo

### Fitoterápicos
- Equinácea
- Óleo de Neem
- Óleo de Melaleuca
- Citronela

## Estrutura de Dados para Integração

### Tabela: `reference_drogavet_actives`
```
- id (PK)
- nome_principio_ativo (string, unique)
- classe_terapeutica (enum: antifungico, ectoparasiticida, fitoterápico, etc.)
- funcao (text)
- dosagem_caes_gatos (string)
- dosagem_especies_nao_convencionais (string)
- apresentacoes_comuns (array)
- notas_prescricao (text)
- fonte_drogavet (boolean = true)
```

### Tabela: `reference_drogavet_formulas`
```
- id (PK)
- nome_formula (string)
- classe_terapeutica (string)
- principios_ativos (array de IDs)
- indicacoes (text)
- modo_preparo (text)
- posologia (text)
- contraindicacoes (text)
- pagina_guia (integer)
- fonte_drogavet (boolean = true)
```

## Mapeamento para Sistema de Equivalência

### Estratégia de Integração
1. **Princípios Ativos como Âncora:** Cada medicamento importado será comparado contra os princípios ativos do Guia DrogaVet
2. **Classe Terapêutica:** Produtos com mesma classe terapêutica são candidatos a equivalência
3. **Dosagem:** Comparação de dosagens para cães/gatos/espécies não convencionais
4. **Formulação:** Identificar equivalências entre formulações (xampu, spray, pomada, etc.)

### Exemplo de Equivalência
- **Produto A:** "Xampu Antifúngico com Cetoconazol 2%"
- **Referência DrogaVet:** "Xampu antifúngico com Tintura de Equinácea + Clorexidine"
- **Classificação:** Possível (mesma classe terapêutica, diferentes princípios ativos)
- **Score:** 70% (classe igual, formulação igual, princípios ativos diferentes)

## Próximas Etapas

1. **Extração Completa:** OCR/parsing do PDF para extrair tabelas de sais e fórmulas
2. **Normalização:** Padronizar nomes de princípios ativos (variações ortográficas, abreviações)
3. **Seed de Dados:** Carregar dados no banco via SQL ou script de importação
4. **Integração Frontend:** Exibir referência DrogaVet no Motor de Equivalência e Proposta Automática
5. **Validação:** Testar equivalências com produtos reais do catálogo

## Observações Importantes

- O Guia DrogaVet é uma **referência técnica oficial** para manipulação veterinária no Brasil
- Todos os princípios ativos listados são **aprovados para uso veterinário**
- As dosagens variam por espécie (cães, gatos, não convencionais) — **crítico para equivalência**
- O documento é **protegido por direitos autorais** — usar apenas como referência, não reproduzir integralmente
