import { trpc } from "@/lib/trpc";
import { readObjects } from "@/lib/spreadsheet";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";

type Step = "arquivo" | "mapear" | "revisar" | "resultado";
type Field =
  | "name"
  | "ean"
  | "activeIngredient"
  | "concentration"
  | "pharmaceuticalForm"
  | "presentation"
  | "manufacturer"
  | "price"
  | "code"
  | "imageUrl"
  | "productUrl";

type Mapping = Partial<Record<Field, string>>;

type ImportSummary = {
  total: number;
  created: number;
  updated: number;
  newSupplier: number;
  priceUpdated: number;
  reviewNeeded: number;
  errors: number;
  details: Array<{
    action: string;
    name: string;
    productId?: number;
    confidence?: number;
    reason?: string;
    error?: string;
  }>;
};

const FIELD_LABELS: Record<Field, string> = {
  name: "Produto *",
  ean: "EAN / GTIN / Código de barras",
  activeIngredient: "Princípio ativo / composição",
  concentration: "Concentração",
  pharmaceuticalForm: "Forma farmacêutica",
  presentation: "Apresentação",
  manufacturer: "Fabricante / laboratório",
  price: "Preço de custo",
  code: "Código",
  imageUrl: "URL da imagem",
  productUrl: "URL do produto",
};

const FIELDS = Object.keys(FIELD_LABELS) as Field[];

const PATTERNS: Record<Field, string[]> = {
  name: ["nome do produto", "produto", "nome comercial", "descricao do produto", "denominacao", "name"],
  ean: ["ean", "gtin", "codigo de barras", "cod barras", "barcode"],
  activeIngredient: ["principio ativo", "composicao", "substancia ativa", "ingrediente ativo", "active ingredient"],
  concentration: ["concentracao", "dosagem", "dose", "teor", "concentration"],
  pharmaceuticalForm: ["forma farmaceutica", "forma", "pharmaceutical form"],
  presentation: ["apresentacao", "presentation", "embalagem"],
  manufacturer: ["fabricante", "laboratorio", "manufacturer", "marca"],
  price: ["preco de custo", "preco", "valor unitario", "custo", "price"],
  code: ["codigo do produto", "codigo produto", "sku", "referencia", "code"],
  imageUrl: ["url da imagem", "url imagem", "imagem", "image url", "foto"],
  productUrl: ["url do produto", "link do produto", "url produto", "link produto", "product url"],
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  for (const field of FIELDS) {
    const match = headers.find((header) => {
      if (used.has(header)) return false;
      const normalizedHeader = normalize(header);
      return PATTERNS[field].some((pattern) => {
        const normalizedPattern = normalize(pattern);
        return normalizedHeader === normalizedPattern || normalizedHeader.includes(normalizedPattern);
      });
    });
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}

function text(row: Record<string, string>, column?: string) {
  const value = column ? row[column] : undefined;
  const trimmed = value == null ? "" : String(value).trim();
  return trimmed || undefined;
}

function parsePrice(value?: string) {
  if (!value) return undefined;
  const raw = value.replace(/R\$/gi, "").replace(/\s/g, "");
  let normalized = raw;
  if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  }
  const number = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function emptySummary(): ImportSummary {
  return {
    total: 0,
    created: 0,
    updated: 0,
    newSupplier: 0,
    priceUpdated: 0,
    reviewNeeded: 0,
    errors: 0,
    details: [],
  };
}

export default function ImportarCatalogo() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("arquivo");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const suppliers = trpc.suppliers.list.useQuery({ activeOnly: true });
  const categories = trpc.categories.list.useQuery();
  const importMutation = trpc.importSmart.importWithDeduplication.useMutation();
  const utils = trpc.useUtils();

  const validRows = useMemo(
    () => rows.filter((row) => Boolean(text(row, mapping.name))),
    [rows, mapping.name],
  );

  const preview = useMemo(() => validRows.slice(0, 8), [validRows]);
  const mappedPriceWithoutSupplier = Boolean(mapping.price && !supplierId);

  const reset = () => {
    setStep("arquivo");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setSupplierId("");
    setCategoryId("");
    setError(null);
    setProgress(0);
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const loadFile = async (file: File) => {
    setError(null);
    try {
      let parsed: Record<string, string>[];
      if (file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv") {
        const result = Papa.parse<Record<string, string>>(await file.text(), {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(),
        });
        if (result.errors.length && result.data.length === 0) {
          throw new Error(result.errors[0]?.message ?? "CSV inválido");
        }
        parsed = result.data;
      } else {
        parsed = (await readObjects(await file.arrayBuffer(), { defval: "" })) as Record<string, string>[];
      }

      if (!parsed.length) throw new Error("Arquivo vazio ou sem linhas reconhecíveis");
      if (parsed.length > 15_000) {
        throw new Error("A importação simples aceita até 15.000 linhas por arquivo");
      }

      const detectedHeaders = Object.keys(parsed[0] ?? {});
      if (!detectedHeaders.length) throw new Error("Não foi possível identificar as colunas");

      setFileName(file.name);
      setHeaders(detectedHeaders);
      setRows(parsed);
      setMapping(detectMapping(detectedHeaders));
      setStep("mapear");
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  };

  const goToReview = () => {
    if (!mapping.name) {
      setError("Mapeie a coluna que contém o nome do produto.");
      return;
    }
    if (!validRows.length) {
      setError("Nenhuma linha possui nome de produto válido.");
      return;
    }
    setError(null);
    setStep("revisar");
  };

  const mappedProducts = () =>
    validRows.map((row) => ({
      name: text(row, mapping.name)!,
      ean: text(row, mapping.ean),
      principioAtivo: text(row, mapping.activeIngredient),
      concentracao: text(row, mapping.concentration),
      formaFarmaceutica: text(row, mapping.pharmaceuticalForm),
      presentation: text(row, mapping.presentation),
      fabricante: text(row, mapping.manufacturer),
      code: text(row, mapping.code),
      imageUrl: text(row, mapping.imageUrl),
      productUrl: text(row, mapping.productUrl),
      supplierId: supplierId ? Number(supplierId) : undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      price: supplierId ? parsePrice(text(row, mapping.price)) : undefined,
    }));

  const runImport = async () => {
    setError(null);
    setProgress(0);
    const source = mappedProducts();
    const aggregate = emptySummary();
    const CHUNK = 1000;

    try {
      for (let start = 0; start < source.length; start += CHUNK) {
        const chunk = source.slice(start, start + CHUNK);
        const result = await importMutation.mutateAsync({ products: chunk });
        aggregate.total += result.total;
        aggregate.created += result.created;
        aggregate.updated += result.updated;
        aggregate.newSupplier += result.newSupplier;
        aggregate.priceUpdated += result.priceUpdated;
        aggregate.reviewNeeded += result.reviewNeeded;
        aggregate.errors += result.errors;
        if (aggregate.details.length < 200) {
          aggregate.details.push(...result.details.slice(0, 200 - aggregate.details.length));
        }
        setProgress(Math.round((Math.min(start + CHUNK, source.length) / source.length) * 100));
      }

      setSummary(aggregate);
      setStep("resultado");
      await Promise.all([
        utils.catalog.list.invalidate(),
        utils.catalog.qualitySummary.invalidate(),
        utils.catalog.health.invalidate(),
      ]);
    } catch (importError) {
      setError((importError as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">Central de Produtos</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Importar catálogo</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Um fluxo curto: arquivo, mapeamento, revisão e importação. Identidade e deduplicação são resolvidas pelo catálogo canônico.
          </p>
        </div>
        <Link href="/produtos?tab=importar" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 no-underline">
          <ArrowLeft size={14} /> Produtos
        </Link>
      </div>

      <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {(["arquivo", "mapear", "revisar", "resultado"] as Step[]).map((item, index) => {
          const labels = ["1. Arquivo", "2. Mapear", "3. Revisar", "4. Resultado"];
          const order = ["arquivo", "mapear", "revisar", "resultado"] as Step[];
          const current = order.indexOf(step);
          return (
            <div key={item} className={`px-3 py-3 text-center text-[10px] font-black uppercase tracking-wide ${current === index ? "bg-blue-950 text-white" : current > index ? "bg-blue-50 text-blue-900" : "text-slate-400"}`}>
              {labels[index]}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}

      {step === "arquivo" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
            className="flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 text-center transition hover:border-blue-400 hover:bg-blue-50/40"
          >
            <FileSpreadsheet size={34} className="text-blue-700" />
            <div className="mt-4 text-sm font-black text-slate-900">Selecione ou arraste uma planilha</div>
            <div className="mt-1 text-xs text-slate-500">Excel ou CSV · até 15.000 linhas</div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }}
          />
        </section>
      )}

      {step === "mapear" && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <div className="text-sm font-black text-slate-900">{fileName}</div>
              <div className="text-xs text-slate-500">{rows.length.toLocaleString("pt-BR")} linhas · mapeamento automático editável</div>
            </div>
            <button onClick={reset} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
              <RotateCcw size={13} /> Trocar arquivo
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Fornecedor da planilha</label>
              <select value={supplierId} onChange={(event) => setSupplierId(event.target.value ? Number(event.target.value) : "")} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="">Sem fornecedor / somente produto mestre</option>
                {suppliers.data?.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Categoria padrão</label>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : "")} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <option value="">Não definir</option>
                {categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
          </div>

          {mappedPriceWithoutSupplier && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              A coluna de preço será ignorada enquanto nenhum fornecedor estiver selecionado. Preço pertence à oferta, não ao produto mestre.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field}>
                <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">{FIELD_LABELS[field]}</label>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value || undefined }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                >
                  <option value="">Não mapear</option>
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button onClick={goToReview} className="rounded-xl bg-blue-950 px-5 py-2.5 text-sm font-bold text-white">Revisar importação</button>
          </div>
        </section>
      )}

      {step === "revisar" && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4"><div className="text-xl font-black text-slate-950">{validRows.length.toLocaleString("pt-BR")}</div><div className="text-xs text-slate-500">produtos válidos</div></div>
            <div className="rounded-xl bg-slate-50 p-4"><div className="text-xl font-black text-slate-950">{supplierId ? "Sim" : "Não"}</div><div className="text-xs text-slate-500">oferta de fornecedor</div></div>
            <div className="rounded-xl bg-slate-50 p-4"><div className="text-xl font-black text-slate-950">{categoryId ? "Sim" : "Não"}</div><div className="text-xs text-slate-500">categoria padrão</div></div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Produto</th><th className="px-3 py-2">EAN</th><th className="px-3 py-2">Fabricante</th><th className="px-3 py-2">Preço</th></tr>
              </thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={`${text(row, mapping.name)}-${index}`} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-900">{text(row, mapping.name)}</td>
                    <td className="px-3 py-2 text-slate-500">{text(row, mapping.ean) ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{text(row, mapping.manufacturer) ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{supplierId ? (text(row, mapping.price) ?? "—") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importMutation.isPending && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-900"><Loader2 size={14} className="animate-spin" /> Importando... {progress}%</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full bg-blue-700 transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}

          <div className="flex justify-between gap-3">
            <button onClick={() => setStep("mapear")} disabled={importMutation.isPending} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Voltar</button>
            <button onClick={() => void runImport()} disabled={importMutation.isPending} className="inline-flex items-center gap-2 rounded-xl bg-blue-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {importMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Importar {validRows.length.toLocaleString("pt-BR")}
            </button>
          </div>
        </section>
      )}

      {step === "resultado" && summary && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="text-green-700" />
            <div><div className="text-sm font-black text-green-950">Importação concluída</div><div className="mt-1 text-xs text-green-800">Casos ambíguos foram preservados para revisão; não houve fusão automática por similaridade incerta.</div></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Criados", summary.created],
              ["Completados", summary.updated],
              ["Novas ofertas", summary.newSupplier],
              ["Preços atualizados", summary.priceUpdated],
              ["Para revisão", summary.reviewNeeded],
              ["Erros", summary.errors],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 p-4"><div className="text-xl font-black text-slate-950">{Number(value).toLocaleString("pt-BR")}</div><div className="text-xs text-slate-500">{label}</div></div>
            ))}
          </div>

          {(summary.reviewNeeded > 0 || summary.errors > 0) && (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
              {summary.details.filter((detail) => detail.action === "revisar_manual" || detail.action === "erro").map((detail, index) => (
                <div key={`${detail.name}-${index}`} className="border-b border-slate-100 px-4 py-3 text-xs last:border-b-0">
                  <div className="font-bold text-slate-900">{detail.name}</div>
                  <div className="mt-1 text-slate-500">{detail.error ?? detail.reason ?? "Revisão necessária"}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Link href="/produtos" className="rounded-xl bg-blue-950 px-4 py-2.5 text-sm font-bold text-white no-underline">Abrir catálogo</Link>
            {summary.reviewNeeded > 0 && <Link href="/produtos?tab=qualidade" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 no-underline">Abrir Qualidade</Link>}
            <button onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Importar outro arquivo</button>
          </div>
        </section>
      )}
    </div>
  );
}
