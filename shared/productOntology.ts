/**
 * productOntology.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ontologia oficial do núcleo de produtos do S2Licit.
 *
 * O sistema opera três entidades conceituais distintas:
 *
 *   1. ITEM SOLICITADO — a descrição como o mundo externo a pediu
 *      (item de edital, linha de cotação por e-mail, linha de planilha,
 *      produto de NF-e, item capturado de site/documento). É imutável e
 *      preserva a descrição original.
 *
 *   2. PRODUTO MESTRE — a identidade canônica no catálogo (`products`).
 *      Uma identidade responde por N ofertas; nunca se confunde com o
 *      fornecedor ou com o preço.
 *
 *   3. OFERTA — a combinação (Produto Mestre × Fornecedor × preço × data).
 *      Dois fornecedores do mesmo produto geram duas ofertas, não dois
 *      produtos.
 *
 * Este módulo contém APENAS contratos TypeScript e helpers puros — nada de
 * banco. Os routers mapeiam essas entidades para as tabelas Drizzle
 * correspondentes.
 */

// ─── Tipos de marca — como o edital trata marca ──────────────────────────────
//
// A distinção é obrigatória em licitação: aceitar oferta de marca "obrigatória"
// de outro fornecedor pode gerar impugnação/desclassificação; marca de
// "referência" admite equivalentes técnicos; marca "citada" é mera ilustração;
// "nenhuma" permite qualquer produto que atenda às especificações.
export type TipoMarca =
  | "obrigatoria"     // edital exige exatamente essa marca/modelo
  | "referencia"      // marca indicada como referência; equivalentes aceitos
  | "citada"          // marca apenas mencionada no texto, sem exigência
  | "nenhuma";        // edital não menciona marca

// ─── Item Solicitado ─────────────────────────────────────────────────────────

/**
 * Item solicitado extraído de uma fonte externa (edital, cotação, planilha,
 * NF-e, e-mail, captura). Preserva sempre a descrição original.
 *
 * Campos de origem podem ser null quando o documento não os informa —
 * null significa "não informado no documento", NUNCA uma inferência.
 */
export interface ItemSolicitado {
  /** Número do item dentro da fonte (ordem do edital, linha da planilha...). */
  numero: number;
  /** Descrição original EXATA como consta na fonte. Nunca é normalizada. */
  descricaoOriginal: string;
  /** Lote ao qual o item pertence (null quando a fonte não usa lotes). */
  lote?: string | null;
  /** Descrição normalizada/tratada (nome + concentração + apresentação). */
  descricao?: string | null;
  unidade?: string | null;
  quantidade?: number | null;
  precoUnitarioReferencia?: number | null;
  precoTotalReferencia?: number | null;
  /** Código de catálogo federal (Compras.gov.br) quando informado. */
  catmatCode?: string | null;
  /** Código de catálogo de MG quando informado. */
  catmasCode?: string | null;
  /** Tratamento de marca declarado ou inferido da leitura do edital. */
  tipoMarca?: TipoMarca | null;
  /** Marca/modelo mencionado no edital, quando houver. */
  marcaReferencia?: string | null;
  /** Página/origem do item no documento (ex.: "p. 14 do PDF"). */
  paginaOrigem?: string | null;
  /** Confiança da extração por IA (0–1). */
  confidence?: number | null;
  /** Fonte: edital | cotacao_email | planilha | nfe | captura. */
  fonte: "edital" | "cotacao_email" | "planilha" | "nfe" | "captura";
}

// ─── Produto Mestre ──────────────────────────────────────────────────────────

/**
 * Produto Mestre: identidade canônica do catálogo. No S2Licit ela vive na
 * tabela `products`. Este contrato é usado pelos engines (matching,
 * duplicidade, equivalência) para operar com os campos relevantes de forma
 * padronizada, independente da tabela.
 */
export interface ProdutoMestre {
  id: number;
  name: string;
  isActive: "yes" | "no";
  tipoCatalogo:
    | "medicamento_veterinario"
    | "medicamento_humano"
    | "produto_nao_medicamentoso"
    | "material_insumo_equipamento";
  /** Identificadores fortes — peso máximo na decisão de duplicidade. */
  ean?: string | null;        // GTIN padronizado (também em gtin/barcode)
  codigoFornecedor?: string | null;
  mapa?: string | null;       // registro MAPA/ANVISA
  catmatCode?: string | null;
  catmasCode?: string | null;
  /** Identidade técnica. */
  activeIngredient?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  pharmaceuticalForm?: string | null;
  unit?: string | null;
  manufacturer?: string | null;   // fabricante/laboratório
  laboratorio?: string | null;
  brand?: string | null;          // marca comercial (nomeProduto/subcategoria)
  subcategoria?: string | null;
  ncm?: string | null;
  categoria?: string | null;
  categoryId?: number | null;
  /** Rótulo já normalizado pela pipeline (se computado). */
  nomeNormalizado?: string | null;
  /** Sinônimos aprovados (tabela synonyms) já carregados, se disponíveis. */
  sinonimos?: string[];
  /** Confiabilidade atual do registro. */
  statusConfiabilidade?: string | null;
}

// ─── Oferta ──────────────────────────────────────────────────────────────────

/**
 * Oferta: Produto Mestre × Fornecedor × condição comercial. Um produto com
 * três fornecedores tem três ofertas — e o catálogo continua com UM produto.
 */
export interface Oferta {
  productId: number;
  supplierId: number;
  supplierName?: string | null;
  price?: string | number | null;
  unit?: string | null;
  /** Quando a oferta foi validada/confirmada (null = não confirmado). */
  confirmedAt?: Date | null;
}

// ─── Relações entre produtos ─────────────────────────────────────────────────

/**
 * Tipo de relação entre dois registros do catálogo.
 *
 * Regras de ouro (invioláveis):
 *   - Somente GTIN idêntico, referência de fabricante exata ou
 *     marca+modelo exatos provam identidade sem margem.
 *   - Descrição textual parecida NUNCA prova identidade.
 *   - Atributos críticos divergentes (tamanho, diâmetro, concentração,
 *     volume) → NOT_EQUIVALENT automático, mesmo com nomes próximos.
 */
export type RelationType =
  | "EXACT_DUPLICATE"            // mesmo produto em duplicidade (fundir)
  | "SAME_PRODUCT_DIFFERENT_SOURCE" // mesmo produto, fontes distintas (validar dados)
  | "EQUIVALENT"                 // intercambiável para fins de cotação
  | "COMPATIBLE"                 // atende a mesma função com ressalvas
  | "SUBSTITUTE"                 // substituto aceito sob condição
  | "SIMILAR"                    // similar, não intercambiável sem análise
  | "NOT_EQUIVALENT";            // nomes parecidos, mas atributos divergem

export type RelationStatus = "pending" | "confirmed" | "rejected";

/** Evidência mínima que sustenta uma relação ou uma sugestão de match. */
export interface RelationEvidence {
  reason: string;            // justificativa textual curta
  score?: number | null;     // score numérico 0–1 quando houver motor
  matchingFields: string[];  // campos que casaram (ex.: ["ean","principio_ativo"])
  conflictingFields: string[]; // campos que divergem (ex.: ["concentracao"])
}

// ─── Resultado de match padronizado ──────────────────────────────────────────

/**
 * Resultado canônico de qualquer engine de match (edital→catálogo,
 * importação→catálogo, e-mail→catálogo). Usa a taxonomia da §6
 * (matchClassification): >=90 auto, 75–89 revisão humana, <75 não usar,
 * 60–74 visível como candidato parcial.
 */
export type MatchDecision = "auto_match" | "needs_review" | "no_match";

export interface MatchSuggestion {
  productId: number | null;
  productName?: string | null;
  score: number;               // 0–1 (fração)
  percentual: number;          // 0–100
  decision: MatchDecision;
  relationType: RelationType;
  matchedBy: string;           // critério vencedor (ex.: "exact_ean")
  evidence: RelationEvidence;
}

// ─── Helpers puros ───────────────────────────────────────────────────────────

/** Normaliza GTIN: remove não-dígitos e zera à esquerda. */
export function normalizeGtin(gtin: string | null | undefined): string | null {
  if (!gtin) return null;
  const digits = gtin.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.replace(/^0+/, "") || "0";
}

/** GTINs iguais (tolerância a zeros à esquerda e caracteres não-dígitos). */
export function sameGtin(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeGtin(a);
  const nb = normalizeGtin(b);
  if (!na || !nb) return false;
  return na === nb;
}

/** Referência de fabricante (marca+modelo/código) — comparação exata após normalizar espaço. */
export function sameManufacturerRef(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const na = a ? norm(a) : "";
  const nb = b ? norm(b) : "";
  return na.length > 0 && nb.length > 0 && na === nb;
}
