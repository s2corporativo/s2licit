import { trpc } from "@/lib/trpc";
import { AlertCircle, AlertTriangle, CheckCircle2, FileSpreadsheet, GitMerge, Image as ImageIcon, Loader2, RefreshCw, Sparkles, Upload, X, XCircle } from "lucide-react";
import Papa from "papaparse";
import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { readTextObjects } from "@/lib/spreadsheet";
import { formatBRL } from "@/lib/format";
import { ImportDuplicatesReviewModal } from "@/components/ImportDuplicatesReviewModal";

// ParsedRow V2: campos exatos conforme especificação
type ParsedRow = {
  ean?: string;            // Código EAN / GTIN
  codigoMapa?: string;     // Código MAPA/ANVISA/FORN
  codigoFornecedor?: string; // Código do fornecedor
  nome: string;            // Nome do produto
  categoria?: string;      // Categoria
  subcategoria?: string;   // Subcategoria
  fichaTecnica?: string;   // Ficha técnica / bula
  apresentacao?: string;   // Apresentação
  fabricante?: string;     // Fabricante
  preco?: string;          // Preço de referência
  linkProduto?: string;    // Link do produto
  urlImagem?: string;      // URL da imagem
  precosFornecedor?: Record<string, string>; // Preços por fornecedor
};

// ColumnMapping V2: campos exatos
type ColumnMapping = {
  ean: string;             // EAN / GTIN / Código de Barras
  codigoMapa: string;      // MAPA / ANVISA / Código Fornecedor
  codigoFornecedor: string; // Código do fornecedor
  nome: string;            // Produto *
  categoria: string;       // Categoria
  subcategoria: string;    // Subcategoria
  fichaTecnica: string;    // Ficha Técnica
  apresentacao: string;    // Apresentação
  fabricante: string;      // Fabricante
  preco: string;           // Preço
  linkProduto: string;     // Link do Produto
  urlImagem: string;       // URL da Imagem
  // Campos legados (mantidos para compatibilidade)
  name: string;
  code: string;
  description: string;
  activeIngredient: string;
  manufacturer: string;
  unit: string;
  concentration: string;
  presentation: string;
  price: string;
  priceUnit: string;
  stock: string;
  imageUrl: string;
  productUrl: string;
  barcode: string;
  gtin: string;
  informacaoTecnica: string;
  mapa: string;
  categoryName: string;
};

type DuplicateCheckRow = {
  rowIndex: number;
  name: string;
  fichaTecnica: string | null;
  presentation: string | null;
  status: "duplicate" | "new";
  existingId: number | null;
  existingName: string | null;
  existingFichaTecnica: string | null;
  existingPresentation: string | null;
  existingPrice: string | null;
  existingSupplierName: string | null;
};

type RowAction = "update" | "skip" | "replace" | "insert";

type CategoryReviewRow = {
  rowIndex: number;
  nome: string;
  categoria: string;
  subcategoria: string;
  confidence: "alta" | "media" | "baixa";
  justificativa: string;
  manualOverride: boolean;
  // Categoria editada manualmente pelo usuário
  categoriaEditada?: string;
  subcategoriaEditada?: string;
};

type FuzzyPreviewRow = {
  rowIndex: number;
  inputName: string;
  status: "match" | "new";
  matchedBy: string | null;
  similarity: number;
  masterProduct: {
    name: string;
    activeIngredient?: string | null;
    manufacturer?: string | null;
    concentration?: string | null;
    presentation?: string | null;
    categoryName?: string | null;
    ean?: string | null;
    codigoMapa?: string | null;
  } | null;
  enriched: Record<string, string | null>;
};

// Campos exibidos na UI de mapeamento V2 (ordem exata conforme especificação)
const VISIBLE_FIELDS: (keyof ColumnMapping)[] = [
  "ean",
  "codigoMapa",
  "codigoFornecedor",
  "nome",
  "categoria",
  "subcategoria",
  "fichaTecnica",
  "apresentacao",
  "fabricante",
  "preco",
  "linkProduto",
  "urlImagem",
];
const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  // Campos V2
  ean: "EAN / GTIN / Código de Barras",
  codigoMapa: "Código MAPA / ANVISA / FORN",
  codigoFornecedor: "Código do Fornecedor",
  nome: "Produto *",
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  fichaTecnica: "Ficha Técnica *",
  apresentacao: "Apresentação",
  fabricante: "Fabricante",
  preco: "Preço de Referência",
  linkProduto: "Link do Produto",
  urlImagem: "URL da Imagem",
  // Campos legados (compatibilidade)
  name: "Produto (nome alternativo)",
  code: "Código Interno",
  description: "Descrição",
  activeIngredient: "Princípio Ativo",
  manufacturer: "Fabricante (alternativo)",
  unit: "Unidade",
  concentration: "Concentração",
  presentation: "Apresentação (alternativa)",
  price: "Preço (alternativo)",
  priceUnit: "Unidade de Preço",
  stock: "Estoque",
  imageUrl: "URL da Imagem (alternativa)",
  productUrl: "Link do Produto (alternativo)",
  barcode: "Código de barras (alternativo)",
  gtin: "GTIN (alternativo)",
  informacaoTecnica: "Informação Técnica",
  mapa: "Registro MAPA/ANVISA (alternativo)",
  categoryName: "Categoria (nome alternativo)",
};

const MATCH_LABELS: Record<string, string> = {
  exact_ean: "EAN",
  exact_mapa: "MAPA",
  fuzzy_name_ean: "Nome~+EAN",
  fuzzy_name_mapa: "Nome~+MAPA",
  exact_name: "Nome exato",
  fuzzy_name_concentration: "Nome~+Conc.",
  fuzzy_name_presentation: "Nome~+Apres.",
};

function autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const mapping: Partial<ColumnMapping> = {};
  // Priority order matters: more specific patterns first to avoid false matches
  // Fields are matched in order; once a header is matched to a field, it won't match another
  const patterns: Record<keyof ColumnMapping, string[]> = {
    // Campos V2 (prioridade)
    nome: ["nome do produto", "nome_produto", "denominacao_produto", "denominacao comercial", "nome comercial", "descricao do produto", "desc_produto", "nome", "produto", "descricao", "name", "description", "item", "denominacao"],
    ean: ["codigo gtin ean", "gtin ean", "codigo gtin", "codigo ean", "gtin_ean", "ean_gtin", "gtin", "ean13", "ean", "codigo de barras", "codigo_barras", "cod barras", "barcode", "cod ean"],
    codigoMapa: ["registro mapa anvisa", "registro mapa", "registro_mapa", "registro anvisa", "registro_anvisa", "reg mapa", "reg anvisa", "numero registro", "nr registro", "num_registro", "nr_registro", "cod registro", "codigo registro", "registro ministerio agricultura", "registro ministerio", "mapa", "anvisa", "cod mapa", "codigo mapa"],
    codigoFornecedor: ["codigo fornecedor", "cod fornecedor", "codigo_fornecedor", "cod_fornecedor", "codigo do fornecedor", "ref fornecedor", "referencia fornecedor"],
    categoria: ["categoria do produto", "categoria_produto", "categoria", "grupo", "tipo produto", "tipo_produto", "class", "classificacao", "category"],
    subcategoria: ["subcategoria do produto", "subcategoria_produto", "subcategoria", "subgrupo", "sub categoria", "sub_categoria", "subcategory"],
    fichaTecnica: ["ficha tecnica", "ficha_tecnica", "informacao tecnica", "informacao_tecnica", "info tecnica", "bula", "bula resumida", "dados tecnicos", "especificacao tecnica", "informacoes tecnicas"],
    apresentacao: ["forma farmaceutica", "forma_farmaceutica", "apresentacao comercial", "apresentacao_comercial", "tipo apresentacao", "apresentacao", "forma", "presentation"],
    fabricante: ["fabricante laboratorio", "fabricante/laboratorio", "laboratorio fabricante", "fabricante_laboratorio", "laboratorio", "fabricante", "lab", "manufacturer", "marca", "industria", "empresa"],
    preco: ["preco de custo", "preco_custo", "valor custo", "valor_custo", "custo unitario", "custo_unitario", "preco unitario", "preco_unitario", "valor unitario", "valor_unitario", "preco unit", "preco", "valor", "price", "custo", "vr", "vlr", "r$"],
    linkProduto: ["link do produto", "link_produto", "url do produto", "url_produto", "pagina produto", "site produto", "product url", "producturl", "link produto", "url produto"],
    urlImagem: ["link da imagem", "url da imagem", "url_imagem", "imagem url", "image url", "imageurl", "url imagem", "link imagem", "foto url", "url foto", "imagem_url", "img url", "thumbnail", "foto", "imagem"],
    // Campos legados (compatibilidade)
    name: [],
    unit: ["unidade de medida", "unidade_medida", "unid medida", "unidade", "und", "unit", "un", "unid"],
    presentation: [],
    concentration: ["concentracao farmaceutica", "concentracao_farmaceutica", "concentracao", "dosagem", "dose", "concentration", "teor", "titulacao", "potencia"],
    activeIngredient: ["principio ativo", "principio_ativo", "composicao farmaceutica", "composicao_farmaceutica", "substancia ativa", "ingrediente ativo", "composicao", "principio", "ativo", "farmaco", "substancia", "dci", "pa"],
    manufacturer: [],
    barcode: [],
    gtin: [],
    informacaoTecnica: [],
    mapa: [],
    price: [],
    productUrl: [],
    imageUrl: [],
    code: ["codigo produto", "cod_produto", "codigo_produto", "cod_item", "codigo", "cod", "code", "ref", "referencia", "sku", "id"],
    description: ["descricao longa", "descricao_longa", "obs", "observacao", "detalhe", "especificacao", "complemento", "informacoes"],
    priceUnit: ["unidade preco", "unidade_preco", "preco por", "price unit", "por"],
    stock: ["saldo estoque", "saldo_estoque", "qtd disponivel", "qtd_disponivel", "estoque", "saldo", "qtd", "quantidade", "stock", "disponivel"],
    categoryName: [],
  };

  headers.forEach((header) => {
    const norm = normalize(header);
    (Object.keys(patterns) as (keyof ColumnMapping)[]).forEach((field) => {
      if (mapping[field]) return;
      if (patterns[field].some((p) => norm.includes(p))) {
        mapping[field] = header;
      }
    });
  });

  return mapping;
}

function DuplicatesPanel({ duplicatesDetected, duplicatesList }: {
  duplicatesDetected: number;
  duplicatesList: { row: number; name: string; existingName: string; existingId: number }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-blue-200 bg-blue-50 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw size={14} className="text-blue-600" />
          <span className="text-sm font-bold text-blue-900">
            {duplicatesDetected} produto{duplicatesDetected !== 1 ? "s" : ""} duplicado{duplicatesDetected !== 1 ? "s" : ""} detectado{duplicatesDetected !== 1 ? "s" : ""} e mesclado{duplicatesDetected !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-blue-700 font-semibold hover:underline"
        >
          {open ? "Ocultar" : "Ver lista"}
        </button>
      </div>
      <p className="text-xs text-blue-700 mt-1">
        Estes produtos já existiam no catálogo (detectados por EAN, nome exato ou similaridade). Os dados foram mesclados automaticamente.
      </p>
      {open && duplicatesList.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto border border-blue-200 bg-white">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-100">
                <th className="text-left p-1.5 font-bold text-blue-800 w-16">Linha</th>
                <th className="text-left p-1.5 font-bold text-blue-800">Nome na planilha</th>
                <th className="text-left p-1.5 font-bold text-blue-800">Produto existente (mesclado)</th>
              </tr>
            </thead>
            <tbody>
              {duplicatesList.map((d, i) => (
                <tr key={i} className="border-t border-blue-100">
                  <td className="p-1.5 font-mono text-blue-700">L{d.row}</td>
                  <td className="p-1.5 text-gray-800">{d.name}</td>
                  <td className="p-1.5 text-blue-900 font-medium">{d.existingName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ImportarPlanilha() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"upload" | "mapping" | "categories" | "preview" | "done">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});
  const [fileName, setFileName] = useState("");
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; updated?: number; batchId: number; duplicatesDetected?: number; duplicatesList?: { row: number; name: string; existingName: string; existingId: number }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fuzzyPreview, setFuzzyPreview] = useState<FuzzyPreviewRow[] | null>(null);
  const [loadingFuzzy, setLoadingFuzzy] = useState(false);
  // URLs de imagem detectadas na planilha importada
   const [detectedImageUrls, setDetectedImageUrls] = useState<string[]>([]);
  const [autoDetectingCat, setAutoDetectingCat] = useState(false);
  const [suggestedCategoryName, setSuggestedCategoryName] = useState<string | null>(null);
  // Detecção de duplicatas
  const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckRow[] | null>(null);
  const [rowActions, setRowActions] = useState<Record<string, RowAction>>({});
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  // Modal de duplicados detectados na importação
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [detectedDuplicates, setDetectedDuplicates] = useState<any[]>([]);
  const [processingDuplicates, setProcessingDuplicates] = useState(false);

  const { data: suppliers } = trpc.suppliers.list.useQuery({ activeOnly: false });
  const { data: categoriesHierarchy } = trpc.categories.listHierarchy.useQuery();
  const createSupplier = trpc.suppliers.create.useMutation();
  const processUploadV2 = trpc.imports.processUploadV2.useMutation();
  const suggestCategoryMutation = trpc.categories.suggest.useMutation();
  const previewFuzzyMutation = trpc.masterProducts.previewImportFuzzy.useMutation();
  const previewEquivMutation = trpc.equivalences.preview.useMutation();
  const applyAutoMutation = trpc.equivalences.applyAuto.useMutation();
  const previewDuplicatesMutation = trpc.masterProducts.previewWithDuplicates.useMutation();
  const utils = trpc.useUtils();
  const [autoEquivStatus, setAutoEquivStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [autoEquivCount, setAutoEquivCount] = useState<number>(0);
  // Progresso da importação
  const [importProgress, setImportProgress] = useState<{ pct: number; status: string } | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [importErrors, setImportErrors] = useState<{ row: number; reason: string }[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  // Progresso em lotes (chunking automático para planilhas > 3000 linhas)
  const [batchProgress, setBatchProgress] = useState<{
    currentChunk: number;
    totalChunks: number;
    processedItems: number;
    totalItems: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    cancelled: boolean;
  } | null>(null);
  const cancelBatchRef = useRef(false);
  // Step de revisão de categorias por IA
  const [categoryReview, setCategoryReview] = useState<CategoryReviewRow[] | null>(null);
  const [loadingCategoryReview, setLoadingCategoryReview] = useState(false);
  const previewCategoryMutation = trpc.imports.previewCategoryClassification.useMutation();
  // Atualização do catálogo com categorias revisadas
  const [applyingCatalogUpdate, setApplyingCatalogUpdate] = useState(false);
  const [catalogUpdateResult, setCatalogUpdateResult] = useState<{ success: boolean; updated: number; notFound: number; errors?: string[] } | null>(null);
  const applyCategoryReviewMutation = trpc.imports.applyCategoryReviewToCatalog.useMutation();
  const startBatchImportMutation = trpc.imports.startBatchImport.useMutation();
  const [showImportProgress, setShowImportProgress] = useState(false);
  const [currentQueueId, setCurrentQueueId] = useState<number | null>(null);
  // Deduplicação inteligente pós-importação
  const importWithDedup = trpc.importSmart.importWithDeduplication.useMutation();
  const [dedupResult, setDedupResult] = useState<{ total: number; created: number; updated: number; newSupplier: number; priceUpdated: number; reviewNeeded: number; errors: number } | null>(null);
  const [dedupStatus, setDedupStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [enrichWithAI, setEnrichWithAI] = useState(false);
  const mergeDuplicatesMutation = trpc.duplicates.mergeDuplicates.useMutation();
  const replaceDuplicatesMutation = trpc.duplicates.replaceProduct.useMutation();
  const handleFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    try {
      let rows: Record<string, string>[] = [];
      if (file.name.endsWith(".csv") || file.type === "text/csv") {
        const text = await file.text();
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim(),
        });
        rows = result.data;
      } else {
        const buffer = await file.arrayBuffer();
        rows = await readTextObjects(buffer);
      }

      if (rows.length === 0) {
        setError("O arquivo está vazio ou não pôde ser lido.");
        return;
      }

      const hdrs = Object.keys(rows[0]);
      setHeaders(hdrs);
      setRawRows(rows);
      const detected = autoDetectMapping(hdrs);
      setMapping(detected);
      setStep("mapping");
    } catch (e: any) {
      setError("Erro ao ler o arquivo: " + (e?.message ?? "formato inválido"));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const applyMapping = (rows: Record<string, string>[]): ParsedRow[] => {
    return rows
      .map((row): ParsedRow => ({
        // Campos V2 (prioridade)
        nome: (mapping.nome ? row[mapping.nome] : undefined) ?? (mapping.name ? row[mapping.name] : "") ?? "",
        ean: mapping.ean ? row[mapping.ean] : (mapping.barcode ? row[mapping.barcode] : undefined),
        codigoMapa: mapping.codigoMapa ? row[mapping.codigoMapa] : (mapping.mapa ? row[mapping.mapa] : undefined),
        codigoFornecedor: mapping.codigoFornecedor ? row[mapping.codigoFornecedor] : undefined,
        categoria: mapping.categoria ? row[mapping.categoria] : (mapping.categoryName ? row[mapping.categoryName] : undefined),
        subcategoria: mapping.subcategoria ? row[mapping.subcategoria] : undefined,
        fichaTecnica: mapping.fichaTecnica ? row[mapping.fichaTecnica] : (mapping.informacaoTecnica ? row[mapping.informacaoTecnica] : undefined),
        apresentacao: mapping.apresentacao ? row[mapping.apresentacao] : (mapping.presentation ? row[mapping.presentation] : undefined),
        fabricante: mapping.fabricante ? row[mapping.fabricante] : (mapping.manufacturer ? row[mapping.manufacturer] : undefined),
        preco: mapping.preco ? row[mapping.preco] : (mapping.price ? row[mapping.price] : undefined),
        linkProduto: mapping.linkProduto ? row[mapping.linkProduto] : (mapping.productUrl ? row[mapping.productUrl] : undefined),
        urlImagem: mapping.urlImagem ? row[mapping.urlImagem] : (mapping.imageUrl ? row[mapping.imageUrl] : undefined),
      }))
      .filter((r) => r.nome?.trim());
  };

  // Gera as linhas mapeadas com os nomes das colunas como chaves padrão (para fuzzy preview)
  const buildMappedRawRows = (): Record<string, string>[] => {
    return rawRows.map((row) => {
      const mapped: Record<string, string> = {};
      // Campos V2
      if (mapping.nome) mapped["name"] = row[mapping.nome] ?? "";
      else if (mapping.name) mapped["name"] = row[mapping.name] ?? "";
      if (mapping.ean) mapped["ean"] = row[mapping.ean] ?? "";
      else if (mapping.barcode) mapped["ean"] = row[mapping.barcode] ?? "";
      if (mapping.codigoMapa) mapped["codigoMapa"] = row[mapping.codigoMapa] ?? "";
      else if (mapping.mapa) mapped["codigoMapa"] = row[mapping.mapa] ?? "";
      if (mapping.apresentacao) mapped["presentation"] = row[mapping.apresentacao] ?? "";
      else if (mapping.presentation) mapped["presentation"] = row[mapping.presentation] ?? "";
      if (mapping.fabricante) mapped["manufacturer"] = row[mapping.fabricante] ?? "";
      else if (mapping.manufacturer) mapped["manufacturer"] = row[mapping.manufacturer] ?? "";
      if (mapping.code) mapped["code"] = row[mapping.code] ?? "";
      return mapped;
    }).filter((r) => r["name"]?.trim());
  };

  const handleAutoDetectCategory = async () => {
    if (rawRows.length === 0) return;
    setAutoDetectingCat(true);
    setSuggestedCategoryName(null);
    try {
      const mappedRows = applyMapping(rawRows);
      const sampleNames = mappedRows.slice(0, 20).map((r) => r.nome).filter(Boolean);
      const res = await suggestCategoryMutation.mutateAsync({ productNames: sampleNames });
      if (res.results.length > 0) {
        const freq = new Map<number, { name: string; count: number }>();
        for (const r of res.results) {
          const cur = freq.get(r.categoryId);
          freq.set(r.categoryId, { name: r.categoryName, count: (cur?.count ?? 0) + 1 });
        }
        const best = Array.from(freq.entries()).sort((a, b) => b[1].count - a[1].count)[0];
        if (best) {
          setCategoryId(best[0]);
          setSuggestedCategoryName(best[1].name);
        }
      }
    } catch {
      // silently fail
    } finally {
      setAutoDetectingCat(false);
    }
  };

  const handleRunFuzzyPreview = async () => {
    setLoadingFuzzy(true);
    setFuzzyPreview(null);
    try {
      const mappedRows = buildMappedRawRows().slice(0, 30); // Limita a 30 para performance
      // Passa supplierId para busca no catálogo do fornecedor além da base mestre
      const result = await previewFuzzyMutation.mutateAsync({
        rows: mappedRows,
        supplierId: supplierId ? Number(supplierId) : undefined,
      });
      setFuzzyPreview(result as FuzzyPreviewRow[]);
    } catch (e: any) {
      setError("Não foi possível comparar com o catálogo. Detalhe técnico: " + e?.message);
    } finally {
      setLoadingFuzzy(false);
    }
  };

  // Avança para o passo de revisão de categorias por IA
  const handleGoToCategories = async () => {
    setError(null);
    const parsed = applyMapping(rawRows);
    if (parsed.length === 0) { setError("Nenhuma linha válida encontrada após o mapeamento."); return; }
    setLoadingCategoryReview(true);
    setStep("categories");
    try {
      const rows = parsed.map((r, idx) => ({
        rowIndex: idx,
        nome: r.nome,
        principioAtivo: (r as any).activeIngredient ?? undefined,
        fabricante: r.fabricante,
        apresentacao: r.apresentacao,
        categoria: r.categoria,
        subcategoria: r.subcategoria,
      }));
      const result = await previewCategoryMutation.mutateAsync({ rows });
      const reviewRows: CategoryReviewRow[] = result.map((item, idx) => ({
        ...item,
        nome: parsed[item.rowIndex]?.nome ?? `Produto ${item.rowIndex + 1}`,
        categoriaEditada: undefined,
        subcategoriaEditada: undefined,
      }));
      setCategoryReview(reviewRows);
    } catch (e: any) {
      setError("Erro ao classificar categorias: " + e?.message);
      setStep("mapping");
    } finally {
      setLoadingCategoryReview(false);
    }
  };

  const CHUNK_SIZE = 2500;

  const handleImport = async () => {
    setError(null);
    cancelBatchRef.current = false;

    let finalSupplierId = supplierId as number;
    if (!finalSupplierId) {
      if (!newSupplierName.trim()) { setError("Informe o nome do fornecedor."); return; }
      try {
        const result = await createSupplier.mutateAsync({ name: newSupplierName.trim() });
        finalSupplierId = (result as any).insertId;
        await utils.suppliers.list.invalidate();
      } catch (e: any) {
        setError("Erro ao criar fornecedor: " + e?.message);
        return;
      }
    }

    let parsed = applyMapping(rawRows);
    if (parsed.length === 0) { setError("Nenhuma linha válida encontrada após o mapeamento."); return; }

    // Aplica as categorias revisadas (editadas manualmente ou sugeridas pela IA)
    if (categoryReview && categoryReview.length > 0) {
      parsed = parsed.map((row, idx) => {
        const review = categoryReview.find(r => r.rowIndex === idx);
        if (!review) return row;
        return {
          ...row,
          categoria: review.categoriaEditada ?? review.categoria ?? row.categoria,
          subcategoria: review.subcategoriaEditada ?? review.subcategoria ?? row.subcategoria,
        };
      });
    }

    // Divide em chunks se houver mais de CHUNK_SIZE linhas
    const totalItems = parsed.length;
    const chunks: typeof parsed[] = [];
    for (let i = 0; i < totalItems; i += CHUNK_SIZE) {
      chunks.push(parsed.slice(i, i + CHUNK_SIZE));
    }
    const totalChunks = chunks.length;

    // Acumuladores do resultado consolidado
    let accInserted = 0;
    let accUpdated = 0;
    let accSkipped = 0;
    let accErrors = 0;
    let lastBatchId = 0;
    const allRowErrors: { row: number; reason: string }[] = [];

    // Inicializa progresso
    setImportProgress({ pct: 0, status: "processing" });
    setBatchProgress({
      currentChunk: 0,
      totalChunks,
      processedItems: 0,
      totalItems,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      cancelled: false,
    });

    try {
      for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
        // Verifica cancelamento antes de cada lote
        if (cancelBatchRef.current) {
          setBatchProgress(prev => prev ? { ...prev, cancelled: true } : null);
          setImportProgress({ pct: Math.round((chunkIdx / totalChunks) * 100), status: "cancelled" });
          setError(`Importação cancelada após ${accInserted + accUpdated} produtos processados.`);
          return;
        }

        const chunk = chunks[chunkIdx];
        const chunkStart = chunkIdx * CHUNK_SIZE;

        // Ajusta rowActions para o offset do chunk atual
        let chunkRowActions: Record<string, "update" | "skip" | "replace" | "insert"> | undefined;
        if (Object.keys(rowActions).length > 0) {
          chunkRowActions = {};
          for (let i = 0; i < chunk.length; i++) {
            const globalIdx = chunkStart + i;
            const action = rowActions[String(globalIdx)];
            if (action) chunkRowActions[String(i)] = action;
          }
        }

        // Atualiza progresso antes de enviar
        setBatchProgress(prev => prev ? {
          ...prev,
          currentChunk: chunkIdx + 1,
        } : null);
        setImportProgress({
          pct: Math.round((chunkIdx / totalChunks) * 100),
          status: "processing",
        });

        const result = await processUploadV2.mutateAsync({
          fileName: totalChunks > 1 ? `${fileName} (lote ${chunkIdx + 1}/${totalChunks})` : fileName,
          supplierId: finalSupplierId || null,
          rows: chunk,
          replaceExisting,
          rowActions: chunkRowActions,
        });

        // Acumula resultados
        accInserted += result.imported ?? 0;
        accUpdated += result.updated ?? 0;
        accSkipped += (result as any).skipped ?? 0;
        accErrors += (result as any).errors ?? (result.rowErrors?.length ?? 0);
        lastBatchId = result.batchId ?? lastBatchId;

        if (result.rowErrors && result.rowErrors.length > 0) {
          allRowErrors.push(...result.rowErrors.map((e: any) => ({
            row: (e.row ?? 0) + chunkStart,
            reason: e.reason ?? String(e),
          })));
        }

        // Atualiza progresso após o lote
        const processedItems = Math.min((chunkIdx + 1) * CHUNK_SIZE, totalItems);
        setBatchProgress(prev => prev ? {
          ...prev,
          processedItems,
          inserted: accInserted,
          updated: accUpdated,
          skipped: accSkipped,
          errors: accErrors,
        } : null);
        setImportProgress({
          pct: Math.round(((chunkIdx + 1) / totalChunks) * 100),
          status: "processing",
        });
      }

      // Todos os lotes concluídos
      setActiveBatchId(lastBatchId);
      setImportProgress({ pct: 100, status: "done" });
      setBatchProgress(prev => prev ? { ...prev, processedItems: totalItems } : null);

      // Resultado consolidado
      setImportResult({
        imported: accInserted,
        updated: accUpdated,
        batchId: lastBatchId,
      });
      if (allRowErrors.length > 0) {
        setImportErrors(allRowErrors);
      }

      // Detecta URLs de imagem na planilha importada
      if (mapping.urlImagem || mapping.imageUrl) {
        const colImagem = mapping.urlImagem || mapping.imageUrl;
        const urls = rawRows
          .map((r) => (colImagem ? r[colImagem] : ""))
          .filter((u) => u && (u.startsWith("http://") || u.startsWith("https://")));
        const uniqueUrls = Array.from(new Set(urls));
        setDetectedImageUrls(uniqueUrls);
      }

      setStep("done");
      await utils.dashboard.stats.invalidate();
      await utils.dashboard.productsPerCategory.invalidate();
      await utils.imports.list.invalidate();

      // Gerar equivalências automaticamente em background
      setAutoEquivStatus("running");
      try {
        const groups = await previewEquivMutation.mutateAsync({ batchId: lastBatchId });
        const groupsArr = Array.isArray(groups) ? groups : [];
        if (groupsArr.length > 0) {
          await applyAutoMutation.mutateAsync({ groups: groupsArr.map((g: any) => ({
            activeIngredient: g.activeIngredient,
            productIds: g.productIds,
            existingGroupId: g.existingGroupId ?? null,
          })) });
          setAutoEquivCount(groupsArr.length);
        } else {
          setAutoEquivCount(0);
        }
        setAutoEquivStatus("done");
      } catch {
        setAutoEquivStatus("error");
      }
    } catch (e: any) {
      const rawMsg: string = e?.message ?? String(e);
      const isHtmlError = rawMsg.includes('<!DOCTYPE') || rawMsg.includes('<html') || rawMsg.includes('not valid JSON');
      const isUnauthorized = e?.data?.code === 'UNAUTHORIZED' || rawMsg.includes('UNAUTHORIZED') || rawMsg.includes('Unauthorized');
      let friendlyMsg = rawMsg;
      if (isUnauthorized) {
        friendlyMsg = 'Sua sessão expirou. Por favor, faça login novamente e tente importar os produtos novamente.';
      } else if (isHtmlError) {
        friendlyMsg = 'O servidor retornou uma resposta inesperada. Verifique se o servidor está rodando e tente novamente. Se o problema persistir, reduza o número de linhas da planilha.';
      }
      setError("Erro na importação: " + friendlyMsg);
      setImportProgress(null);
      setBatchProgress(null);
    }
  };

  const reset = () => {
    setStep("upload");
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setFileName("");
    setSupplierId("");
    setCategoryId("");
    setImportResult(null);
    setError(null);
    setCategoryReview(null);
    setLoadingCategoryReview(false);
    setNewSupplierName("");
    setFuzzyPreview(null);
    setDetectedImageUrls([]);
    setDuplicateCheck(null);
    setRowActions({});
    setAutoEquivStatus("idle");
    setAutoEquivCount(0);
    setBatchProgress(null);
    setImportProgress(null);
    cancelBatchRef.current = false;
    if (fileRef.current) fileRef.current.value = "";
  };

  const previewRows = applyMapping(rawRows.slice(0, 5));
  const matchCount = fuzzyPreview?.filter((r) => r.status === "match").length ?? 0;
  const newCount = fuzzyPreview?.filter((r) => r.status === "new").length ?? 0;
  const dupCount = duplicateCheck?.filter((r) => r.status === "duplicate").length ?? 0;

  const handleCheckDuplicates = async () => {
    if (!supplierId) { setError("Selecione um fornecedor para verificar duplicatas."); return; }
    setLoadingDuplicates(true);
    setDuplicateCheck(null);
    try {
      // Tripé de duplicidade: Nome + FichaTécnica + Apresentação
      // REGRA: produtos com FichaTécnica OU Apresentação diferentes são DISTINTOS
      const mappedRows = applyMapping(rawRows);
      const rows = mappedRows.map((r) => ({
        name: r.nome,
        fichaTecnica: r.fichaTecnica || undefined,
        presentation: r.apresentacao || undefined,
        ean: r.ean || undefined,
      }));
      const result = await previewDuplicatesMutation.mutateAsync({
        rows,
        supplierId: supplierId as number,
      });
      setDuplicateCheck(result as DuplicateCheckRow[]);
      // Define ação padrão: duplicatas → "update", novos → "insert"
      const defaultActions: Record<string, RowAction> = {};
      (result as DuplicateCheckRow[]).forEach((r) => {
        defaultActions[String(r.rowIndex)] = r.status === "duplicate" ? "update" : "insert";
      });
      setRowActions(defaultActions);
    } catch (e: any) {
      setError("Erro ao verificar duplicatas: " + e?.message);
    } finally {
      setLoadingDuplicates(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <span className="its-bar" />
        <h1 className="text-3xl font-black tracking-tight text-gray-900">
          Importar Planilha
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Importe planilhas Excel (.xlsx) ou CSV. O sistema usa reconhecimento inteligente (fuzzy) para identificar produtos existentes e preencher campos faltantes automaticamente.
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-0 mb-8">
        {(["upload", "mapping", "categories", "done"] as const).map((s, i) => {
          const labels = ["Arquivo", "Mapeamento", "Categorias IA", "Concluído"];
          const active = step === s;
          const done = ["upload", "mapping", "categories", "done"].indexOf(step) > i;
          return (
            <div key={s} className="flex items-center">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase ${active ? "bg-gray-900 text-white" : done ? "bg-blue-800 text-white" : "bg-gray-100 text-gray-400"}`}>
                <span>{i + 1}</span>
                <span>{labels[i]}</span>
              </div>
              {i < 3 && <div className="w-4 h-px bg-gray-300" />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="border border-blue-200 bg-blue-50 p-3 mb-6 flex items-center gap-2 text-sm text-blue-900">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div>
          <div
            className="border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-900 transition-colors cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <FileSpreadsheet size={32} className="text-gray-300 mx-auto mb-4" />
            <div className="text-sm font-semibold text-gray-700 mb-1">
              Arraste o arquivo aqui ou clique para selecionar
            </div>
            <div className="text-xs text-gray-400">Formatos aceitos: .xlsx, .xls, .csv</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }}
          />
        </div>
      )}

      {/* Step 2: Column mapping */}
      {step === "mapping" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-bold tracking-widest uppercase text-gray-400">Arquivo carregado</div>
              <div className="text-sm font-semibold text-gray-900">{fileName}</div>
              <div className="text-xs text-gray-400">{rawRows.length} linhas detectadas</div>
            </div>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-900 flex items-center gap-1">
              <X size={12} /> Trocar arquivo
            </button>
          </div>

          {/* Supplier only (categoria é gerada por IA por produto) */}
          <div className="mb-6 p-4 border border-gray-200">
            <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1.5">Fornecedor *</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            >
              <option value="">— Novo fornecedor —</option>
              {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {!supplierId && (
              <input
                type="text"
                placeholder="Nome do novo fornecedor"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                className="w-full border border-gray-300 border-t-0 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              />
            )}
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1.5">
              <Sparkles size={9} />
              <span>A categoria de cada produto será gerada automaticamente por IA durante a importação. Produtos com categoria na planilha mantêm a categoria original.</span>
            </div>
          </div>

          {/* Replace option */}
          <div className="flex items-center gap-2 mb-6 p-3 bg-gray-50 border border-gray-200">
            <input type="checkbox" id="replace" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} className="w-3.5 h-3.5" />
            <label htmlFor="replace" className="text-xs text-gray-700 cursor-pointer">
              <span className="font-semibold">Substituir produtos existentes</span> deste fornecedor (recomendado para atualizações periódicas — preserva equivalências)
            </label>
          </div>

          {/* Column mapping */}
          <div className="its-rule mb-4" />
          <h3 className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">Mapeamento de Colunas</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {VISIBLE_FIELDS.map((field) => (
              <div key={field}>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-500 block mb-1">
                  {FIELD_LABELS[field]}
                  {field === "barcode" && (
                    <span className="ml-1 normal-case font-normal text-gray-400">(EAN, GTIN, cód. barras)</span>
                  )}
                </label>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) => {
                    const val = e.target.value || undefined;
                    // Campo barcode unifica EAN e GTIN: ao mapear barcode, limpa gtin e vice-versa
                    if (field === "barcode") {
                      setMapping((m) => ({ ...m, barcode: val, gtin: undefined }));
                    } else {
                      setMapping((m) => ({ ...m, [field]: val }));
                    }
                  }}
                  className="w-full border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:border-gray-900"
                >
                  <option value="">— não mapear —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Aviso: Ficha Técnica não mapeada */}
          {!mapping.fichaTecnica && (
            <div className="mb-4 p-3 border border-orange-300 bg-orange-50 flex items-start gap-2">
              <AlertTriangle size={14} className="text-orange-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-orange-800">Ficha Técnica não mapeada</p>
                <p className="text-xs text-orange-700 mt-0.5">
                  O campo <strong>Ficha Técnica</strong> é usado como critério de duplicidade (tripé <strong>Nome + Ficha Técnica + Apresentação</strong>). Sem ele, produtos com fichas técnicas diferentes podem ser incorretamente mesclados. Mapeie a coluna correspondente na planilha ou prossiga ciente desta limitação.
                </p>
              </div>
            </div>
          )}

          {/* Duplicate Detection */}
          <div className="mb-6 p-4 border border-amber-200 bg-amber-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-600" />
                <span className="text-xs font-bold tracking-widest uppercase text-amber-700">Verificar Duplicatas</span>
                {dupCount > 0 && (
                  <span className="bg-amber-200 text-amber-800 text-[10px] font-bold px-2 py-0.5">
                    {dupCount} duplicata{dupCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <button
                onClick={handleCheckDuplicates}
                disabled={loadingDuplicates || !supplierId || !mapping.name}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {loadingDuplicates ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {loadingDuplicates ? "Verificando..." : "Verificar Duplicatas"}
              </button>
            </div>
            <p className="text-xs text-amber-700 mb-3">
              Compara os produtos da planilha com a base do fornecedor selecionado pelo tripé <strong>Nome + Ficha Técnica + Apresentação</strong>. Produtos com ficha técnica ou apresentação diferente são mantidos como distintos.
            </p>
            {duplicateCheck && (
              <div>
                <div className="flex gap-3 mb-3">
                  <div className="flex items-center gap-1.5 bg-amber-100 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-700">
                    <AlertTriangle size={12} />
                    {dupCount} duplicata{dupCount !== 1 ? "s" : ""} encontrada{dupCount !== 1 ? "s" : ""}
                  </div>
                  <div className="flex items-center gap-1.5 bg-green-100 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700">
                    <CheckCircle2 size={12} />
                    {(duplicateCheck.length - dupCount)} novo{(duplicateCheck.length - dupCount) !== 1 ? "s" : ""}
                  </div>
                </div>
                {dupCount > 0 && (
                  <div>
                    {/* Botões de ação padrão para todas as duplicatas */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Aplicar a todas:</span>
                      <button
                        onClick={() => {
                          const updates: Record<string, RowAction> = {};
                          duplicateCheck?.filter((r) => r.status === "duplicate").forEach((r) => {
                            updates[String(r.rowIndex)] = "update";
                          });
                          setRowActions((prev) => ({ ...prev, ...updates }));
                        }}
                        className="text-[10px] font-bold px-2 py-1 bg-blue-800 text-white hover:bg-blue-900 transition-colors"
                      >
                        Atualizar Todas
                      </button>
                      <button
                        onClick={() => {
                          const updates: Record<string, RowAction> = {};
                          duplicateCheck?.filter((r) => r.status === "duplicate").forEach((r) => {
                            updates[String(r.rowIndex)] = "skip";
                          });
                          setRowActions((prev) => ({ ...prev, ...updates }));
                        }}
                        className="text-[10px] font-bold px-2 py-1 border border-gray-400 text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Pular Todas
                      </button>
                      <button
                        onClick={() => {
                          const updates: Record<string, RowAction> = {};
                          duplicateCheck?.filter((r) => r.status === "duplicate").forEach((r) => {
                            updates[String(r.rowIndex)] = "replace";
                          });
                          setRowActions((prev) => ({ ...prev, ...updates }));
                        }}
                        className="text-[10px] font-bold px-2 py-1 border border-amber-400 text-amber-700 hover:bg-amber-50 transition-colors"
                      >
                        Substituir Todas
                      </button>
                    </div>
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-[10px] border border-gray-200">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">#</th>
                          <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Produto na Planilha</th>
                          <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Ficha Técnica</th>
                          <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Apresentação</th>
                          <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Produto Existente (Base)</th>
                          <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Preço Atual</th>
                          <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duplicateCheck.filter((r) => r.status === "duplicate").map((row) => (
                          <tr key={row.rowIndex} className="border-t border-gray-100 bg-amber-50">
                            <td className="px-2 py-1.5 text-gray-400 font-mono">{row.rowIndex + 1}</td>
                            <td className="px-2 py-1.5">
                              <div className="font-medium">{row.name}</div>
                            </td>
                            <td className="px-2 py-1.5">
                              {row.fichaTecnica
                                ? <span className="font-mono text-blue-700 bg-blue-50 px-1 rounded text-[10px] max-w-[120px] truncate block" title={row.fichaTecnica}>{row.fichaTecnica}</span>
                                : <span className="text-gray-300">—</span>}
                              {row.existingFichaTecnica && row.fichaTecnica && row.existingFichaTecnica !== row.fichaTecnica && (
                                <div className="text-[9px] text-amber-600 mt-0.5">Base: {row.existingFichaTecnica}</div>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              {row.presentation
                                ? <span className="font-mono text-purple-700 bg-purple-50 px-1 rounded">{row.presentation}</span>
                                : <span className="text-gray-300">—</span>}
                              {row.existingPresentation && row.presentation && row.existingPresentation !== row.presentation && (
                                <div className="text-[9px] text-amber-600 mt-0.5">Base: {row.existingPresentation}</div>
                              )}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="font-medium text-amber-800">{row.existingName}</div>
                              {row.existingFichaTecnica && <div className="text-gray-400 text-[9px] truncate max-w-[160px]" title={row.existingFichaTecnica}>{row.existingFichaTecnica} · {row.existingPresentation}</div>}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-gray-600">
                              {formatBRL(row.existingPrice)}
                            </td>
                            <td className="px-2 py-1.5">
                              <select
                                value={rowActions[String(row.rowIndex)] ?? "update"}
                                onChange={(e) => setRowActions((prev) => ({ ...prev, [String(row.rowIndex)]: e.target.value as RowAction }))}
                                className="border border-gray-300 px-1.5 py-1 text-[10px] focus:outline-none focus:border-amber-500 bg-white"
                              >
                                <option value="update">Atualizar (mesclar dados)</option>
                                <option value="skip">Pular (manter existente)</option>
                                <option value="replace">Substituir (apagar e reinserir)</option>
                                <option value="insert">Manter ambos (inserir como novo)</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </div>
                )}
                {dupCount === 0 && (
                  <div className="flex items-center gap-2 text-xs text-green-700 font-semibold">
                    <CheckCircle2 size={12} />
                    Nenhuma duplicata encontrada — todos os produtos são novos para este fornecedor.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fuzzy Preview Button */}
          <div className="mb-6 p-4 border border-blue-200 bg-blue-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-blue-600" />
                <span className="text-xs font-bold tracking-widest uppercase text-blue-700">Reconhecimento Inteligente (Base Mestre)</span>
              </div>
              <button
                onClick={handleRunFuzzyPreview}
                disabled={loadingFuzzy || !mapping.name}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loadingFuzzy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {loadingFuzzy ? "Verificando..." : "Verificar Base Mestre"}
              </button>
            </div>
            <p className="text-xs text-blue-600">
              Compara os primeiros 30 produtos da planilha com o seu catálogo por semelhança de nome e código. Campos vazios como Composição, Categoria e Marca serão preenchidos automaticamente a partir do que já existe.
            </p>

            {/* Fuzzy Results Summary */}
            {fuzzyPreview && (
              <div className="mt-3">
                <div className="flex gap-3 mb-3">
                  <div className="flex items-center gap-1.5 bg-green-100 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700">
                    <CheckCircle2 size={12} />
                    {matchCount} reconhecidos
                  </div>
                  <div className="flex items-center gap-1.5 bg-orange-100 border border-orange-200 px-3 py-1.5 text-xs font-bold text-orange-700">
                    <AlertCircle size={12} />
                    {newCount} novos cadastros
                  </div>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-[10px] border border-gray-200">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Nome na Planilha</th>
                        <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Status</th>
                        <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Match por</th>
                        <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Similaridade</th>
                        <th className="px-2 py-1.5 text-left font-bold uppercase tracking-wider">Enriquecimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fuzzyPreview.map((row, i) => (
                        <tr key={`${row.inputName}-${i}`} className={`border-t border-gray-100 ${row.status === "match" ? "bg-green-50" : "bg-orange-50"}`}>
                          <td className="px-2 py-1.5 font-medium">{row.inputName}</td>
                          <td className="px-2 py-1.5">
                            <span className={`px-1.5 py-0.5 font-bold text-[9px] uppercase ${row.status === "match" ? "bg-green-200 text-green-800" : "bg-orange-200 text-orange-800"}`}>
                              {row.status === "match" ? "✓ Match" : "+ Novo"}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-gray-500">
                            {row.matchedBy ? MATCH_LABELS[row.matchedBy] ?? row.matchedBy : "—"}
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {row.similarity > 0 ? `${Math.round(row.similarity * 100)}%` : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-gray-500">
                            {row.status === "match" && row.masterProduct ? (
                              <span className="text-green-700">
                                {[
                                  !row.enriched["activeIngredient"] ? null : "Composição",
                                  !row.enriched["categoryName"] ? null : "Categoria",
                                  !row.enriched["manufacturer"] ? null : "Marca",
                                ].filter(Boolean).join(", ") || "Dados confirmados"}
                              </span>
                            ) : (
                              <span className="text-orange-600">Novo cadastro</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Standard Preview */}
          {previewRows.length > 0 && (
            <div className="mb-6">
              <div className="its-rule mb-3" />
              <h3 className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">Prévia (5 primeiras linhas)</h3>
              <div className="overflow-x-auto">
                <table className="its-table text-[11px]">
                  <thead>
                    <tr>
                      <th>Imagem</th>
                      <th>Nome</th>
                      <th>Princípio Ativo</th>
                      <th>Fabricante</th>
                      <th>Preço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={`preview-${r.nome ?? ''}-${i}`}>
                        <td className="w-12">
                          {r.urlImagem ? (
                            <img src={r.urlImagem} alt={r.nome} className="w-10 h-10 object-contain border border-gray-100" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="font-medium">
                          {r.nome || "—"}
                          {r.linkProduto && <a href={r.linkProduto} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-800 text-[10px] hover:underline">[link]</a>}
                        </td>
                        <td>{r.fabricante || "—"}</td>
                        <td>{r.apresentacao || "—"}</td>
                        <td className="font-mono">{r.preco || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Barra de progresso durante a importação (com suporte a lotes) */}
          {importProgress && batchProgress && (
            <div className="mb-4 border border-blue-200 bg-blue-50 p-4">
              {/* Cabeçalho */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {importProgress.status === "processing" && <Loader2 size={16} className="animate-spin text-blue-600" />}
                  {importProgress.status === "done" && <CheckCircle2 size={16} className="text-green-600" />}
                  {importProgress.status === "cancelled" && <XCircle size={16} className="text-red-500" />}
                  <div className="text-sm font-semibold text-blue-900">
                    {batchProgress.totalChunks > 1
                      ? `Lote ${batchProgress.currentChunk} de ${batchProgress.totalChunks} — ${batchProgress.processedItems.toLocaleString("pt-BR")} / ${batchProgress.totalItems.toLocaleString("pt-BR")} itens`
                      : `Importando ${batchProgress.totalItems.toLocaleString("pt-BR")} produtos...`
                    }
                  </div>
                </div>
                {importProgress.status === "processing" && (
                  <button
                    onClick={() => { cancelBatchRef.current = true; }}
                    className="flex items-center gap-1 text-[11px] text-red-600 hover:text-red-800 border border-red-200 px-2 py-1 hover:bg-red-50 transition-colors"
                    title="Cancelar importação"
                  >
                    <XCircle size={12} /> Cancelar
                  </button>
                )}
              </div>

              {/* Barra de progresso */}
              <div className="w-full bg-blue-200 rounded-full h-3 mb-2">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    importProgress.status === "done" ? "bg-green-500" :
                    importProgress.status === "cancelled" ? "bg-red-400" :
                    "bg-blue-600"
                  }`}
                  style={{ width: `${importProgress.pct > 0 ? importProgress.pct : (importProgress.status === "processing" ? 5 : 0)}%` }}
                />
              </div>

              {/* Percentual e descrição */}
              <div className="flex items-center justify-between text-[11px] text-blue-700 mb-3">
                <span>
                  {importProgress.status === "processing" && `${importProgress.pct}% concluído — processando e salvando no banco de dados...`}
                  {importProgress.status === "done" && "Importação concluída com sucesso!"}
                  {importProgress.status === "cancelled" && "Importação cancelada pelo usuário."}
                </span>
                <span className="font-mono font-bold">{importProgress.pct}%</span>
              </div>

              {/* Contadores acumulados (só em modo multi-lote) */}
              {batchProgress.totalChunks > 1 && (
                <div className="grid grid-cols-4 gap-2 text-center border-t border-blue-200 pt-3">
                  <div className="bg-white border border-blue-100 p-2">
                    <div className="text-base font-black text-green-700">{batchProgress.inserted.toLocaleString("pt-BR")}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Inseridos</div>
                  </div>
                  <div className="bg-white border border-blue-100 p-2">
                    <div className="text-base font-black text-blue-700">{batchProgress.updated.toLocaleString("pt-BR")}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Atualizados</div>
                  </div>
                  <div className="bg-white border border-blue-100 p-2">
                    <div className="text-base font-black text-amber-700">{batchProgress.skipped.toLocaleString("pt-BR")}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Ignorados</div>
                  </div>
                  <div className="bg-white border border-blue-100 p-2">
                    <div className="text-base font-black text-red-600">{batchProgress.errors.toLocaleString("pt-BR")}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Erros</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aviso de planilha grande */}
          {rawRows.length > CHUNK_SIZE && !importProgress && (
            <div className="mb-4 border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800">
                <span className="font-bold">Planilha grande detectada:</span> {rawRows.length.toLocaleString("pt-BR")} produtos serão importados automaticamente em{" "}
                <span className="font-bold">{Math.ceil(rawRows.length / CHUNK_SIZE)} lotes de até {CHUNK_SIZE.toLocaleString("pt-BR")} itens</span>.
                O progresso será exibido em tempo real.
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={reset} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:border-gray-900 transition-colors"
              disabled={!!(importProgress && importProgress.status === "processing")}>
              Voltar
            </button>
            <button
              onClick={handleImport}
              disabled={processUploadV2.isPending || createSupplier.isPending || (!mapping.nome && !mapping.name) || !!(importProgress && importProgress.status === "processing")}
              className="flex items-center gap-2 bg-gray-900 text-white px-6 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50"
            >
              <Upload size={14} />
              {importProgress?.status === "processing"
                ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
                : `Importar ${rawRows.length.toLocaleString("pt-BR")} produto${rawRows.length !== 1 ? "s" : ""}`
              }
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Revisão de Categorias por IA */}
      {step === "categories" && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs font-bold tracking-widest uppercase text-gray-400">Revisão de Categorias</div>
              <div className="text-sm font-semibold text-gray-900">{rawRows.length} produtos para classificar</div>
            </div>
            <button onClick={() => setStep("mapping")} className="text-xs text-gray-400 hover:text-gray-900 flex items-center gap-1">
              <X size={12} /> Voltar ao Mapeamento
            </button>
          </div>

          {loadingCategoryReview ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 size={28} className="animate-spin text-indigo-600" />
              <div className="text-sm font-semibold text-gray-700">Classificando {rawRows.length} produtos por IA...</div>
              <div className="text-xs text-gray-400">Isso pode levar alguns segundos dependendo do volume</div>
            </div>
          ) : categoryReview ? (
            <div>
              {/* Resumo de confiança */}
              <div className="flex gap-3 mb-5">
                {["alta", "media", "baixa"].map((conf) => {
                  const count = categoryReview.filter(r => r.confidence === conf).length;
                  const colors = { alta: "bg-green-100 border-green-200 text-green-700", media: "bg-amber-100 border-amber-200 text-amber-700", baixa: "bg-red-100 border-red-200 text-red-700" };
                  const labels = { alta: "Alta confiança", media: "Média confiança", baixa: "Baixa confiança" };
                  return (
                    <div key={conf} className={`flex items-center gap-1.5 border px-3 py-1.5 text-xs font-bold ${colors[conf as keyof typeof colors]}`}>
                      {count} {labels[conf as keyof typeof labels]}
                    </div>
                  );
                })}
                <div className="ml-auto text-xs text-gray-400 flex items-center">
                  Clique em qualquer célula para editar manualmente
                </div>
              </div>

              {/* Tabela de revisão */}
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 text-left font-bold text-gray-500 uppercase tracking-wider w-8">#</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-500 uppercase tracking-wider">Produto</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-500 uppercase tracking-wider">Categoria</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-500 uppercase tracking-wider">Subcategoria</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-500 uppercase tracking-wider w-24">Confiança</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-500 uppercase tracking-wider">Justificativa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryReview.map((row, idx) => {
                      const confColors = { alta: "bg-green-100 text-green-700", media: "bg-amber-100 text-amber-700", baixa: "bg-red-100 text-red-700" };
                      const catValue = row.categoriaEditada ?? row.categoria;
                      const subValue = row.subcategoriaEditada ?? row.subcategoria;
                      return (
                        <tr key={row.rowIndex} className={`border-b border-gray-100 hover:bg-gray-50 ${row.manualOverride ? "bg-blue-50" : ""}`}>
                          <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate" title={row.nome}>{row.nome}</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={catValue}
                              onChange={(e) => {
                                setCategoryReview(prev => prev ? prev.map((r, i) => i === idx ? { ...r, categoriaEditada: e.target.value, manualOverride: true } : r) : prev);
                              }}
                              className="w-full border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent px-1 py-0.5 text-[11px]"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={subValue}
                              onChange={(e) => {
                                setCategoryReview(prev => prev ? prev.map((r, i) => i === idx ? { ...r, subcategoriaEditada: e.target.value, manualOverride: true } : r) : prev);
                              }}
                              className="w-full border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent px-1 py-0.5 text-[11px]"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 text-[10px] font-bold ${confColors[row.confidence]}`}>
                              {row.confidence === "alta" ? "Alta" : row.confidence === "media" ? "Média" : "Baixa"}
                              {row.manualOverride && " ✎"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-400 max-w-[200px] truncate" title={row.justificativa}>{row.justificativa}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Ações em lote */}
              <div className="flex items-center gap-2 mb-5 p-3 bg-gray-50 border border-gray-200">
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Reclassificar em lote:</span>
                <button
                  onClick={async () => {
                    setLoadingCategoryReview(true);
                    try {
                      const parsed = applyMapping(rawRows);
                      const lowConfRows = categoryReview
                        .filter(r => r.confidence === "baixa")
                        .map(r => ({ rowIndex: r.rowIndex, nome: parsed[r.rowIndex]?.nome ?? r.nome, fabricante: parsed[r.rowIndex]?.fabricante, apresentacao: parsed[r.rowIndex]?.apresentacao, categoria: undefined, subcategoria: undefined }));
                      if (lowConfRows.length === 0) return;
                      const result = await previewCategoryMutation.mutateAsync({ rows: lowConfRows });
                      setCategoryReview(prev => prev ? prev.map((r: CategoryReviewRow) => {
                        const updated = result.find((u: { rowIndex: number; categoria: string; subcategoria?: string; confidence?: string; justificativa?: string }) => u.rowIndex === r.rowIndex);
                        return updated ? { ...r, categoria: updated.categoria, subcategoria: updated.subcategoria, confidence: updated.confidence, justificativa: updated.justificativa, manualOverride: false, categoriaEditada: undefined, subcategoriaEditada: undefined } : r;
                      }) : prev);
                    } finally { setLoadingCategoryReview(false); }
                  }}
                  className="text-[10px] font-bold px-2 py-1 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Reclassificar Baixa Confiança
                </button>
                <button
                  onClick={() => setCategoryReview(prev => prev ? prev.map(r => ({ ...r, categoriaEditada: undefined, subcategoriaEditada: undefined, manualOverride: false })) : prev)}
                  className="text-[10px] font-bold px-2 py-1 border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Restaurar Sugestões da IA
                </button>
                <button
                  onClick={async () => {
                    if (!categoryReview || categoryReview.length === 0) return;
                    setApplyingCatalogUpdate(true);
                    setCatalogUpdateResult(null);
                    try {
                      const reviews = categoryReview.map(r => ({
                        nome: r.nome,
                        categoria: r.categoriaEditada ?? r.categoria,
                        subcategoria: r.subcategoriaEditada ?? r.subcategoria ?? undefined,
                      }));
                      const result = await applyCategoryReviewMutation.mutateAsync({ reviews, matchMode: "fuzzy" });
                      setCatalogUpdateResult(result);
                    } catch (e: any) {
                      setCatalogUpdateResult({ success: false, updated: 0, notFound: 0, errors: [e?.message ?? "Erro desconhecido"] });
                    } finally {
                      setApplyingCatalogUpdate(false);
                    }
                  }}
                  disabled={applyingCatalogUpdate}
                  className="text-[10px] font-bold px-2 py-1 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {applyingCatalogUpdate ? <Loader2 size={10} className="animate-spin" /> : null}
                  Atualizar Catálogo
                </button>
              </div>

              {/* Resultado da atualização do catálogo */}
              {catalogUpdateResult && (
                <div className={`flex items-center gap-2 mb-3 p-2 text-[11px] font-semibold border ${
                  catalogUpdateResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
                }`}>
                  {catalogUpdateResult.success
                    ? <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                    : <AlertCircle size={13} className="text-red-600 flex-shrink-0" />}
                  <span>
                    {catalogUpdateResult.success
                      ? `${catalogUpdateResult.updated} produto(s) atualizado(s) no catálogo${catalogUpdateResult.notFound > 0 ? ` · ${catalogUpdateResult.notFound} não encontrado(s)` : ""}`
                      : `Erro: ${catalogUpdateResult.errors?.[0] ?? "Falha ao atualizar catálogo"}`}
                  </span>
                  <button onClick={() => setCatalogUpdateResult(null)} className="ml-auto text-gray-400 hover:text-gray-600"><X size={11} /></button>
                </div>
              )}

              <div className="mb-4 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded">
                <input
                  type="checkbox"
                  id="enrichWithAI"
                  checked={enrichWithAI}
                  onChange={(e) => setEnrichWithAI(e.target.checked)}
                  className="w-4 h-4 cursor-pointer"
                />
                <label htmlFor="enrichWithAI" className="flex-1 cursor-pointer text-sm font-medium text-gray-700">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-blue-600" />
                    <span>Enriquecer com IA</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Classificar automaticamente princípios ativos, concentração e categoria dos produtos importados</p>
                </label>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep("mapping")} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:border-gray-900 transition-colors">
                  Voltar
                </button>
                <button
                  onClick={handleImport}
                  disabled={processUploadV2.isPending || createSupplier.isPending}
                  className="flex items-center gap-2 bg-gray-900 text-white px-6 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50"
                >
                  <Upload size={14} />
                  {processUploadV2.isPending ? "Importando..." : `Confirmar e Importar ${rawRows.length} produtos`}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhum resultado de classificação disponível.</div>
          )}
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && importResult && (
        <div>
          {/* Success Banner */}
          <div className="border border-green-200 bg-green-50 p-6 mb-6 flex items-center gap-4">
            <CheckCircle2 size={28} className="text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-base font-black text-gray-900">Importação concluída!</div>
              <div className="text-sm text-gray-600">
                <span className="font-bold text-gray-900">{importResult.imported}</span> produtos importados com sucesso do arquivo <span className="font-semibold">{fileName}</span>.
              </div>
              {/* Badge de equivalências automáticas */}
              <div className="mt-2 flex items-center gap-2">
                {autoEquivStatus === "running" && (
                  <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">
                    <Loader2 size={11} className="animate-spin" /> Gerando equivalências...
                  </span>
                )}
                {autoEquivStatus === "done" && autoEquivCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 font-semibold">
                    <GitMerge size={11} /> {autoEquivCount} grupo{autoEquivCount !== 1 ? "s" : ""} de equivalência gerado{autoEquivCount !== 1 ? "s" : ""} automaticamente
                  </span>
                )}
                {autoEquivStatus === "done" && autoEquivCount === 0 && (
                  <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5">
                    <GitMerge size={11} /> Nenhuma equivalência nova encontrada
                  </span>
                )}
                {autoEquivStatus === "error" && (
                  <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5">
                    <AlertCircle size={11} /> Equivalências não geradas automaticamente
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Erros linha a linha */}
          {importErrors.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-600" />
                  <span className="text-sm font-bold text-amber-900">{importErrors.length} linha{importErrors.length !== 1 ? "s" : ""} com erro</span>
                </div>
                <button
                  onClick={() => setShowErrors(!showErrors)}
                  className="text-xs text-amber-700 font-semibold hover:underline"
                >
                  {showErrors ? "Ocultar" : "Ver detalhes"}
                </button>
              </div>
              {showErrors && (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-amber-100">
                        <th className="text-left p-1.5 font-bold text-amber-800 w-16">Linha</th>
                        <th className="text-left p-1.5 font-bold text-amber-800">Motivo do erro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importErrors.map((e, i) => (
                        <tr key={i} className="border-t border-amber-100">
                          <td className="p-1.5 font-mono text-amber-700">{e.row > 0 ? `L${e.row}` : "—"}</td>
                          <td className="p-1.5 text-amber-900">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Duplicatas detectadas */}
          {(importResult.duplicatesDetected ?? 0) > 0 && (
            <DuplicatesPanel
              duplicatesDetected={importResult.duplicatesDetected!}
              duplicatesList={importResult.duplicatesList ?? []}
            />
          )}

          {/* Relatório de Deduplicação Inteligente */}
          <div className="border border-gray-200 bg-white p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-600" />
                <span className="text-sm font-bold text-gray-900">Análise de Deduplicação Inteligente</span>
              </div>
              {dedupStatus === "idle" && (
                <button
                  onClick={async () => {
                    try {
                      setDedupStatus("running");
                      const rows = rawRows.slice(0, 3000);
                      const products = rows.map((r) => ({
                        name: (mapping.nome ? r[mapping.nome] : undefined) || (mapping.name ? r[mapping.name] : undefined) || "",
                        principioAtivo: mapping.activeIngredient ? r[mapping.activeIngredient] || undefined : undefined,
                        concentracao: mapping.concentration ? r[mapping.concentration] || undefined : undefined,
                        formaFarmaceutica: (mapping.apresentacao ? r[mapping.apresentacao] : undefined) || (mapping.presentation ? r[mapping.presentation] : undefined) || undefined,
                        fabricante: (mapping.fabricante ? r[mapping.fabricante] : undefined) || (mapping.manufacturer ? r[mapping.manufacturer] : undefined) || undefined,
                        fichaTecnica: mapping.fichaTecnica ? r[mapping.fichaTecnica] || undefined : undefined,
                        ean: (mapping.ean ? r[mapping.ean] : undefined) || (mapping.gtin ? r[mapping.gtin] : undefined) || (mapping.barcode ? r[mapping.barcode] : undefined) || undefined,
                        price: (() => { const raw = (mapping.preco ? r[mapping.preco] : undefined) || (mapping.price ? r[mapping.price] : undefined); return raw ? parseFloat(raw.replace(/[^0-9.,]/g, "").replace(",", ".")) || undefined : undefined; })(),
                        supplierId: supplierId !== "" ? supplierId : undefined,
                        categoryId: categoryId !== "" ? categoryId : undefined,
                        presentation: (mapping.apresentacao ? r[mapping.apresentacao] : undefined) || (mapping.presentation ? r[mapping.presentation] : undefined) || undefined,
                        manufacturer: (mapping.fabricante ? r[mapping.fabricante] : undefined) || (mapping.manufacturer ? r[mapping.manufacturer] : undefined) || undefined,
                      })).filter((p) => p.name.trim().length > 0);
                      if (products.length === 0) { setDedupStatus("error"); return; }
                      const result = await importWithDedup.mutateAsync({ products: products as any });
                      setDedupResult(result);
                      setDedupStatus("done");
                    } catch (e: any) {
                      setDedupStatus("error");
                    }
                  }}
                  disabled={importWithDedup.isPending}
                  className="flex items-center gap-1.5 bg-indigo-700 text-white px-3 py-1.5 text-xs font-semibold hover:bg-indigo-800 transition-colors disabled:opacity-50"
                >
                  <Sparkles size={11} /> Analisar e Deduplicar
                </button>
              )}
            </div>
            {dedupStatus === "idle" && (
              <p className="text-xs text-gray-500">Analisa os produtos importados contra o catálogo existente e executa automaticamente: criar novo, atualizar existente, vincular fornecedor, atualizar preço ou marcar para revisão.</p>
            )}
            {dedupStatus === "running" && (
              <div className="flex items-center gap-2 text-xs text-indigo-700">
                <Loader2 size={12} className="animate-spin" /> Analisando {rawRows.length} produto(s)...
              </div>
            )}
            {dedupStatus === "error" && (
              <p className="text-xs text-red-600">Erro ao executar análise. Tente novamente.</p>
            )}
            {dedupStatus === "done" && dedupResult && (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  { label: "Criados", value: dedupResult.created, color: "text-green-700 bg-green-50" },
                  { label: "Atualizados", value: dedupResult.updated, color: "text-blue-700 bg-blue-50" },
                  { label: "Novo Fornecedor", value: dedupResult.newSupplier, color: "text-purple-700 bg-purple-50" },
                  { label: "Preço Atualizado", value: dedupResult.priceUpdated, color: "text-orange-700 bg-orange-50" },
                  { label: "Revisão Manual", value: dedupResult.reviewNeeded, color: "text-amber-700 bg-amber-50" },
                  { label: "Erros", value: dedupResult.errors, color: "text-red-700 bg-red-50" },
                ].map((item) => (
                  <div key={item.label} className={`p-2 text-center ${item.color}`}>
                    <div className="text-lg font-black">{item.value}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide">{item.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Post-import actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Equivalências automáticas */}
            <div className="border border-gray-200 p-5">
              <div className="flex items-start gap-3 mb-3">
                <GitMerge size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-gray-900">Gerar Equivalências Automaticamente</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    O sistema analisa o princípio ativo dos produtos importados e cria grupos de equivalência, cruzando com produtos de outros fornecedores (incluindo medicamentos humanos).
                  </div>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    await previewEquivMutation.mutateAsync({ batchId: importResult.batchId });
                    navigate("/equivalencias?autoPreview=1&batchId=" + importResult.batchId);
                  } catch (e: any) {
                    setError("Erro ao gerar equivalências: " + e?.message);
                  }
                }}
                disabled={previewEquivMutation.isPending}
                className="flex items-center gap-2 w-full justify-center bg-blue-700 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-50"
              >
                {previewEquivMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <GitMerge size={13} />}
                {previewEquivMutation.isPending ? "Analisando..." : "Gerar Equivalências"}
              </button>
            </div>

            {/* Vincular imagens */}
            <div className="border border-gray-200 p-5">
              <div className="flex items-start gap-3 mb-3">
                <ImageIcon size={20} className="text-purple-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-gray-900">
                    Vincular Imagens
                    {detectedImageUrls.length > 0 && (
                      <span className="ml-2 text-[10px] font-bold bg-purple-100 text-purple-700 px-2 py-0.5">
                        {detectedImageUrls.length} URL{detectedImageUrls.length !== 1 ? "s" : ""} detectada{detectedImageUrls.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {detectedImageUrls.length > 0
                      ? `A planilha contém ${detectedImageUrls.length} URL${detectedImageUrls.length !== 1 ? "s" : ""} de imagem. Clique para abrir o Auto-Link com as URLs já preenchidas.`
                      : "Abra a Gestão de Imagens para vincular imagens aos produtos por nome ou URL."}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (detectedImageUrls.length > 0) {
                    // Salva as URLs no sessionStorage para o GestaoImagens ler
                    sessionStorage.setItem("autoLinkUrls", detectedImageUrls.join("\n"));
                  }
                  navigate("/imagens");
                }}
                className="flex items-center gap-2 w-full justify-center bg-purple-700 text-white px-4 py-2 text-sm font-semibold hover:bg-purple-800 transition-colors"
              >
                <ImageIcon size={13} />
                {detectedImageUrls.length > 0 ? "Vincular Imagens Automaticamente" : "Ir para Gestão de Imagens"}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="bg-gray-900 text-white px-6 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors">
              Importar outro arquivo
            </button>
          </div>
        </div>
      )}

      {/* Modal de Revisão de Duplicados */}
      <ImportDuplicatesReviewModal
        open={showDuplicatesModal}
        duplicates={detectedDuplicates}
        onResolve={async (decisions) => {
          setProcessingDuplicates(true);
          try {
            for (const [duplicateId, decision] of Object.entries(decisions)) {
              if (decision === "skip") continue;
              const duplicate = detectedDuplicates.find((d) => d.id === duplicateId);
              if (!duplicate) continue;
              if (decision === "update") {
                await replaceDuplicatesMutation.mutateAsync({
                  oldProductId: duplicate.id,
                  newProductId: duplicate.existingProductId,
                });
              } else if (decision === "replace") {
                await mergeDuplicatesMutation.mutateAsync({
                  primaryProductId: duplicate.existingProductId,
                  secondaryProductId: duplicate.id,
                });
              }
            }
            setProcessingDuplicates(false);
            setShowDuplicatesModal(false);
            setDetectedDuplicates([]);
          } catch (error) {
            console.error("Erro ao processar duplicados:", error);
            setProcessingDuplicates(false);
          }
        }}
        onCancel={() => setShowDuplicatesModal(false)}
        isLoading={processingDuplicates}
      />
    </div>
  );
}
