import SearchAutocomplete from "@/components/SearchAutocomplete";
import { trpc } from "@/lib/trpc";
import { AlertCircle, AlertTriangle, ArrowDown, CheckCircle2, FilePlus, Package, Search, TrendingDown, TrendingUp, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type SearchResult = {
  id: number;
  code: string | null;
  name: string;
  activeIngredient: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  price: string | null;
  priceUnit: string | null;
  unit: string | null;
  supplierId: number;
  categoryId: number | null;
  supplierName: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categorySlug: string | null;
};

// ─── Price Alert Badge ────────────────────────────────────────────────────────
function PriceAlertBadge({ alertPercent }: { alertPercent: number | null }) {
  if (!alertPercent) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 border border-blue-300 text-blue-900 text-[9px] font-bold ml-1"
      title={`Preço subiu ${alertPercent.toFixed(1)}% desde a última cotação`}
    >
      <TrendingUp size={9} />+{alertPercent.toFixed(0)}%
    </span>
  );
}

// ─── Cheaper Alternatives Modal ───────────────────────────────────────────────
function CheaperAlternativesModal({
  product,
  onClose,
}: {
  product: SearchResult;
  onClose: () => void;
}) {
  const refPrice = product.price ? parseFloat(product.price) : null;
  const { data: alternatives, isLoading } =
    trpc.priceIntelligence.cheaperAlternatives.useQuery(
      { productId: product.id, referencePrice: refPrice },
      { enabled: !!product.id }
    );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-900 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-600" />
            <h2 className="text-base font-black text-gray-900">Alternativas Econômicas</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200">
            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Produto Selecionado</div>
            <div className="text-sm font-black text-gray-900">{product.name}</div>
            {product.activeIngredient && (
              <div className="text-xs text-gray-500">P.A.: {product.activeIngredient}</div>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-gray-500">{product.manufacturer ?? "—"}</span>
              {product.price && (
                <span className="text-sm font-black text-blue-800">
                  R$ {parseFloat(product.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </div>
          {isLoading && (
            <div className="py-8 text-center">
              <div className="w-4 h-1 bg-green-600 mx-auto mb-2 animate-pulse" />
              <p className="text-xs text-gray-400">Buscando alternativas...</p>
            </div>
          )}
          {!isLoading && (!alternatives || alternatives.length === 0) && (
            <div className="py-8 text-center border border-gray-200">
              <CheckCircle2 size={20} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Nenhuma alternativa mais barata encontrada.</p>
              <p className="text-xs text-gray-400 mt-1">Este produto já tem o menor preço para este princípio ativo.</p>
            </div>
          )}
          {alternatives && alternatives.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-bold tracking-widest uppercase text-green-700 mb-2">
                {alternatives.length} alternativa{alternatives.length !== 1 ? "s" : ""} mais barata{alternatives.length !== 1 ? "s" : ""} encontrada{alternatives.length !== 1 ? "s" : ""}:
              </div>
              {alternatives.map((alt) => (
                <div key={alt.id} className="border border-green-200 bg-green-50 p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-gray-900">{alt.name}</div>
                    {alt.activeIngredient && (
                      <div className="text-xs text-gray-500">P.A.: {alt.activeIngredient}</div>
                    )}
                    <div className="text-xs text-gray-600 mt-1">
                      {alt.manufacturer && <span className="font-semibold">{alt.manufacturer}</span>}
                      {alt.concentration && <span className="text-gray-400"> · {alt.concentration}</span>}
                      {alt.presentation && <span className="text-gray-400"> · {alt.presentation}</span>}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      Fornecedor: <span className="font-semibold text-gray-700">{alt.supplierName}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    {alt.savingsPercent !== null && (
                      <div className="text-[10px] font-bold tracking-widest uppercase text-green-700 mb-1">
                        {alt.savingsPercent}% mais barato
                      </div>
                    )}
                    <div className="text-xl font-black text-green-700">
                      R$ {alt.price ? parseFloat(alt.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}
                    </div>
                    {alt.priceUnit && (
                      <div className="text-[10px] text-gray-400">/{alt.priceUnit}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add to Proposal Button ──────────────────────────────────────────────────
// ─── Cheaper Similar Alert Modal ─────────────────────────────────────────────
type SimilarProduct = {
  id: number;
  name: string;
  activeIngredient: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  price: string | null;
  unit: string | null;
  imageUrl: string | null;
  supplierName: string | null;
  savingPct: number;
};

function CheaperSimilarModal({
  original,
  similars,
  onKeep,
  onReplace,
}: {
  original: { name: string; price: string | null; supplierName: string | null };
  similars: SimilarProduct[];
  onKeep: () => void;
  onReplace: (s: SimilarProduct) => void;
}) {
  const best = similars[0];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-4 flex items-start gap-3">
          <div className="w-8 h-8 bg-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <TrendingDown size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-black text-amber-900">Similar mais barato encontrado!</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Existe um produto com o mesmo princípio ativo por até{" "}
              <span className="font-black">{best.savingPct}% menos</span>. Deseja substituir?
            </p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="border border-gray-200 p-3">
            <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-1">Produto selecionado</div>
            <p className="text-sm font-semibold text-gray-900">{original.name}</p>
            {original.supplierName && <p className="text-xs text-gray-500">{original.supplierName}</p>}
            <p className="text-base font-black text-gray-900 mt-1">
              R$ {original.price ? parseFloat(original.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}
            </p>
          </div>
          <div className="space-y-2">
            {similars.map((s) => (
              <button
                key={s.id}
                onClick={() => onReplace(s)}
                className="w-full border-2 border-green-300 bg-green-50 hover:bg-green-100 p-3 text-left transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] font-bold tracking-widest uppercase text-green-700 mb-0.5">Alternativa mais barata</div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                    {s.concentration && <p className="text-xs text-gray-500">{s.concentration}{s.presentation ? ` — ${s.presentation}` : ""}</p>}
                    {s.supplierName && <p className="text-xs text-blue-600">{s.supplierName}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-green-700">
                      R$ {s.price ? parseFloat(s.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}
                    </p>
                    <span className="inline-block bg-green-600 text-white text-[10px] font-black px-1.5 py-0.5">
                      −{s.savingPct}%
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onKeep}
            className="flex-1 border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-900 transition-colors"
          >
            Manter original
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add to Proposal Button ──────────────────────────────────────────────────
function AddToProposalButton({ product }: { product: SearchResult }) {
  const [open, setOpen] = useState(false);
  const [pendingProposalId, setPendingProposalId] = useState<number | null>(null);
  const [similarAlert, setSimilarAlert] = useState<{ similars: SimilarProduct[]; proposalId: number } | null>(null);

  const { data: proposals } = trpc.proposals.list.useQuery();
  const utils = trpc.useUtils();

  const addItem = trpc.proposals.addItem.useMutation({
    onSuccess: () => {
      toast.success(`"${product.name}" adicionado à proposta!`);
      setOpen(false);
      setPendingProposalId(null);
      setSimilarAlert(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const draftProposals = (proposals ?? []).filter((p) => p.status === "draft" || p.status === "sent" || p.status === "order");

  const doAddItem = (proposalId: number, overrideProduct?: SimilarProduct) => {
    const src = overrideProduct
      ? { id: overrideProduct.id, name: overrideProduct.name, activeIngredient: overrideProduct.activeIngredient, manufacturer: overrideProduct.manufacturer, concentration: overrideProduct.concentration, presentation: overrideProduct.presentation, unit: overrideProduct.unit, supplierName: overrideProduct.supplierName, price: overrideProduct.price }
      : { id: product.id, name: product.name, activeIngredient: product.activeIngredient, manufacturer: product.manufacturer, concentration: product.concentration, presentation: product.presentation, unit: product.unit, supplierName: product.supplierName, price: product.price };
    addItem.mutate({
      proposalId,
      productId: src.id,
      productName: src.name,
      activeIngredient: src.activeIngredient ?? null,
      manufacturer: src.manufacturer ?? null,
      concentration: src.concentration ?? null,
      presentation: src.presentation ?? null,
      unit: src.unit ?? null,
      supplierName: src.supplierName ?? null,
      unitPrice: src.price ?? null,
      quantity: 1,
      registroMapa: overrideProduct ? null : (product as any).mapa ?? null,
    });
  };

  const handleSelectProposal = async (proposalId: number) => {
    if (!product.price || !product.id) {
      doAddItem(proposalId);
      return;
    }
    try {
      const result = await utils.proposals.findCheaperSimilar.fetch({
        productId: product.id,
        unitPrice: product.price,
      });
      if (result.similars && result.similars.length > 0) {
        setPendingProposalId(proposalId);
        setSimilarAlert({ similars: result.similars as SimilarProduct[], proposalId });
        setOpen(false);
      } else {
        doAddItem(proposalId);
      }
    } catch {
      doAddItem(proposalId);
    }
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 border border-gray-200 text-[10px] font-bold text-gray-600 hover:border-gray-900 hover:text-gray-900 transition-colors whitespace-nowrap"
          title="Inserir na Proposta"
        >
          <FilePlus size={11} />
          Proposta
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-900 shadow-lg z-50 min-w-48 max-h-60 overflow-y-auto">
            <div className="px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-gray-400 border-b border-gray-100">
              Inserir em:
            </div>
            {draftProposals.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400">
                Nenhuma proposta ativa.
                <a href="/propostas" className="block text-blue-800 font-bold mt-1 hover:underline">Criar proposta →</a>
              </div>
            ) : (
              draftProposals.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProposal(p.id)}
                  disabled={addItem.isPending}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <div className="font-semibold text-gray-900 truncate">{p.title}</div>
                  {p.processNumber && <div className="text-[10px] text-gray-400">{p.processNumber}</div>}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {similarAlert && pendingProposalId && (
        <CheaperSimilarModal
          original={{ name: product.name, price: product.price, supplierName: product.supplierName }}
          similars={similarAlert.similars}
          onKeep={() => { doAddItem(pendingProposalId); }}
          onReplace={(s) => { doAddItem(pendingProposalId, s); }}
        />
      )}
    </>
  );
}

export default function BuscaRapida() {
  const [submitted, setSubmitted] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [location] = useLocation();
  const [selectedForAlternatives, setSelectedForAlternatives] = useState<SearchResult | null>(null);

  // Read query from URL params on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q && q.trim().length >= 2) setSubmitted(q.trim());
  }, [location]);

  const { data: categories } = trpc.categories.list.useQuery();
  const { data: results, isLoading } = trpc.products.smartSearch.useQuery(
    { query: submitted, categoryId },
    { enabled: submitted.length >= 2 }
  );
  const { data: priceAlerts } = trpc.priceIntelligence.priceAlerts.useQuery(
    undefined,
    { enabled: submitted.length >= 2 }
  );
  const priceAlertMap = new Map<number, number>();
  (priceAlerts ?? []).forEach((a) => {
    if (a.alertPercent) priceAlertMap.set(a.productId, parseFloat(String(a.alertPercent)));
  });

  const handleSearch = (q: string) => {
    if (q.trim().length >= 2) setSubmitted(q.trim());
  };

  // Group results by activeIngredient
  const grouped = groupByActiveIngredient(results ?? []);
  const bestPerGroup = getBestPerGroup(grouped);

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <span className="its-bar" />
        <h1 className="text-3xl font-black tracking-tight text-gray-900">
          Busca Rápida
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Digite o nome do produto ou princípio ativo para encontrar o menor preço entre todos os fornecedores.
          Clique em <span className="font-semibold text-green-700">Alt.</span> para ver genéricos mais baratos com o mesmo princípio ativo.
        </p>
      </div>

      {/* Search form */}
      <div className="mb-8">
        <SearchAutocomplete
          placeholder="Ex: Amoxicilina, Ivermectina, Cimento CP-II..."
          onSearch={handleSearch}
          onSelect={(s) => handleSearch(s.label)}
          autoFocus
          size="lg"
        />

        {/* Category filter */}
        {categories && categories.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            <button
              type="button"
              onClick={() => setCategoryId(undefined)}
              className={`text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 border transition-colors ${
                !categoryId
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-300 text-gray-500 hover:border-gray-900 hover:text-gray-900"
              }`}
            >
              Todas
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() =>
                  setCategoryId(categoryId === cat.id ? undefined : cat.id)
                }
                className={`text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 border transition-colors`}
                style={
                  categoryId === cat.id
                    ? {
                        backgroundColor: cat.color ?? "#DC2626",
                        borderColor: cat.color ?? "#DC2626",
                        color: "white",
                      }
                    : { borderColor: "#D1D5DB", color: "#6B7280" }
                }
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && submitted && (
        <div className="py-12 text-center">
          <div className="w-6 h-1 bg-blue-800 mx-auto mb-3 animate-pulse" />
          <p className="text-xs text-gray-400 tracking-widest uppercase">
            Buscando...
          </p>
        </div>
      )}

      {/* No results */}
      {!isLoading && submitted && results && results.length === 0 && (
        <div className="border border-gray-200 p-8 text-center">
          <AlertCircle size={20} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500">
            Nenhum produto encontrado para "{submitted}"
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Tente buscar por um termo diferente ou importe planilhas de
            fornecedores.
          </p>
        </div>
      )}

      {/* Results */}
      {!isLoading && results && results.length > 0 && (
        <div>
          <div className="its-rule mb-4" />
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold tracking-widest uppercase text-gray-400">
              {results.length} resultado{results.length !== 1 ? "s" : ""} para
              "{submitted}"
            </h2>
            <div className="flex items-center gap-3">
              {priceAlertMap.size > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-blue-800 font-bold tracking-widest uppercase">
                  <AlertTriangle size={11} />
                  {priceAlertMap.size} alerta{priceAlertMap.size !== 1 ? "s" : ""} de preço
                </div>
              )}
              <div className="flex items-center gap-1 text-[10px] text-blue-800 font-bold tracking-widest uppercase">
                <TrendingDown size={11} />
                Ordenado por menor preço
              </div>
            </div>
          </div>

          {/* Best price summary */}
          {bestPerGroup.length > 0 && (
            <div className="mb-6 space-y-0">
              {bestPerGroup.map((group) => (
                <BestPriceCard
                  key={group.activeIngredient}
                  group={group}
                  priceAlertMap={priceAlertMap}
                  onSelectAlternatives={(p) => setSelectedForAlternatives(p)}
                />
              ))}
            </div>
          )}

          {/* Full results table */}
          <div className="mt-8">
            <div className="its-rule mb-4" />
            <h3 className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">
              Todos os resultados
            </h3>
            <div className="overflow-x-auto">
              <table className="its-table">
                <thead>
                  <tr>
                    <th className="w-10"></th>
                    <th>Produto</th>
                    <th>Princípio Ativo</th>
                    <th>Fabricante</th>
                    <th>Concentração</th>
                    <th>Fornecedor</th>
                    <th>Categoria</th>
                    <th className="text-right">Preço</th>
                    <th className="print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((p) => {
                    const isLowest =
                      p.activeIngredient &&
                      bestPerGroup.find(
                        (g) => g.activeIngredient === p.activeIngredient
                      )?.best?.id === p.id;
                    const alertPct = priceAlertMap.get(p.id) ?? null;
                    return (
                      <tr key={p.id}>
                        <td className="w-10 text-center">
                          {(p as any).imageUrl ? (
                            <div className="group relative inline-block">
                              <img
                                src={(p as any).imageUrl}
                                alt=""
                                className="w-8 h-8 object-contain border border-gray-100"
                                onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.2"; }}
                              />
                              <div className="absolute left-10 top-0 z-30 hidden group-hover:block bg-white border border-gray-200 shadow-xl p-2 w-32">
                                <img src={(p as any).imageUrl} alt={p.name} className="w-full object-contain max-h-28" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              </div>
                            </div>
                          ) : (
                            <div className="w-8 h-8 bg-gray-50 border border-gray-100 flex items-center justify-center mx-auto">
                              <Package size={10} className="text-gray-200" />
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="font-semibold text-gray-900 text-xs flex items-center gap-1">
                            {p.name}
                            {alertPct && <PriceAlertBadge alertPercent={alertPct} />}
                          </div>
                          {p.code && (
                            <div className="text-[10px] text-gray-400 font-mono">
                              {p.code}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="text-xs text-gray-700">
                            {p.activeIngredient ?? "—"}
                          </span>
                        </td>
                        <td className="text-xs text-gray-600">
                          {p.manufacturer ?? "—"}
                        </td>
                        <td className="text-xs text-gray-600">
                          {p.concentration ?? "—"}
                        </td>
                        <td className="text-xs font-medium text-gray-900">
                          {p.supplierName ?? "—"}
                        </td>
                        <td>
                          {p.categoryName && (
                            <span
                              className="category-badge"
                              style={{ color: p.categoryColor ?? "#6B7280" }}
                            >
                              {p.categoryName}
                            </span>
                          )}
                        </td>
                        <td className="text-right">
                          {p.price ? (
                            <span
                              className={`price-display ${
                                isLowest ? "price-best" : "text-gray-900"
                              }`}
                            >
                              {isLowest && (
                                <ArrowDown
                                  size={10}
                                  className="inline mr-0.5 mb-0.5"
                                />
                              )}
                              R${" "}
                              {parseFloat(p.price).toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                              })}
                              {p.priceUnit && (
                                <span className="text-[10px] text-gray-400 ml-1 font-normal">
                                  /{p.priceUnit}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="print:hidden">
                          <div className="flex items-center gap-1">
                            <AddToProposalButton product={p} />
                            {p.activeIngredient && (
                              <button
                                onClick={() => setSelectedForAlternatives(p)}
                                className="flex items-center gap-1 px-2 py-1 border border-green-300 text-[10px] font-bold text-green-700 hover:bg-green-50 transition-colors whitespace-nowrap"
                                title="Ver alternativas mais baratas"
                              >
                                <Zap size={10} />
                                Alt.
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cheaper Alternatives Modal */}
      {selectedForAlternatives && (
        <CheaperAlternativesModal
          product={selectedForAlternatives}
          onClose={() => setSelectedForAlternatives(null)}
        />
      )}

      {/* Initial state */}
      {!submitted && (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-2 border-gray-200 flex items-center justify-center mx-auto mb-4">
            <Search size={16} className="text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">
            Use a barra de busca acima para encontrar produtos
          </p>
        </div>
      )}
    </div>
  );
}

function groupByActiveIngredient(results: SearchResult[]) {
  const map = new Map<string, SearchResult[]>();
  results.forEach((p) => {
    const key = p.activeIngredient?.toLowerCase().trim() ?? `__no_ai_${p.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  });
  return map;
}

function getBestPerGroup(grouped: Map<string, SearchResult[]>) {
  const result: {
    activeIngredient: string;
    best: SearchResult;
    count: number;
  }[] = [];
  grouped.forEach((items, key) => {
    if (key.startsWith("__no_ai_")) return;
    const withPrice = items.filter((p) => p.price && parseFloat(p.price) > 0);
    if (withPrice.length === 0) return;
    const sorted = [...withPrice].sort(
      (a, b) => parseFloat(a.price!) - parseFloat(b.price!)
    );
    result.push({
      activeIngredient: items[0].activeIngredient!,
      best: sorted[0],
      count: items.length,
    });
  });
  return result;
}

function BestPriceCard({
  group,
  priceAlertMap,
  onSelectAlternatives,
}: {
  group: { activeIngredient: string; best: SearchResult; count: number };
  priceAlertMap: Map<number, number>;
  onSelectAlternatives: (p: SearchResult) => void;
}) {
  const { best } = group;
  const alertPct = priceAlertMap.get(best.id) ?? null;
  return (
    <div className="border border-gray-200 p-4 flex items-center justify-between gap-4 hover:border-gray-400 transition-colors">
      <div className="min-w-0">
        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">
          Princípio Ativo
        </div>
        <div className="text-sm font-black text-gray-900">
          {group.activeIngredient}
        </div>
        <div className="text-xs text-gray-600 mt-1">
          <span className="font-semibold">{best.name}</span>
          {alertPct && <PriceAlertBadge alertPercent={alertPct} />}
          {best.manufacturer && (
            <span className="text-gray-400"> · {best.manufacturer}</span>
          )}
          {best.concentration && (
            <span className="text-gray-400"> · {best.concentration}</span>
          )}
        </div>
        <div className="text-[10px] text-gray-400 mt-1">
          Fornecedor:{" "}
          <span className="font-semibold text-gray-700">
            {best.supplierName}
          </span>{" "}
          · {group.count} produto{group.count !== 1 ? "s" : ""} encontrado
          {group.count !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        <div className="text-right">
          <div className="text-[10px] font-bold tracking-widest uppercase text-blue-800 mb-1">
            Menor Preço
          </div>
          <div className="price-display price-best text-2xl">
            R${" "}
            {parseFloat(best.price!).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
            })}
          </div>
          {best.priceUnit && (
            <div className="text-[10px] text-gray-400">/{best.priceUnit}</div>
          )}
        </div>
        <button
          onClick={() => onSelectAlternatives(best)}
          className="flex items-center gap-1 px-2 py-1 border border-green-400 text-[10px] font-bold text-green-700 hover:bg-green-50 transition-colors"
        >
          <Zap size={10} />
          Ver alternativas
        </button>
      </div>
    </div>
  );
}
