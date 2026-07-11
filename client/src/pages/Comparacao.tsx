import { trpc } from "@/lib/trpc";
import { ArrowDown, BarChart3, FilePlus, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Add to Proposal Button ───────────────────────────────────────────────────
type ProductResult = {
  id: number;
  name: string;
  activeIngredient: string | null;
  manufacturer: string | null;
  concentration: string | null;
  presentation: string | null;
  unit: string | null;
  supplierName: string | null;
  price: string | null;
  priceUnit: string | null;
  imageUrl?: string | null;
};

function AddToProposalButton({ product }: { product: ProductResult }) {
  const [open, setOpen] = useState(false);
  const { data: proposals } = trpc.proposals.list.useQuery();
  const addItem = trpc.proposals.addItem.useMutation({
    onSuccess: () => {
      toast.success(`"${product.name}" adicionado à proposta!`);
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const activeProposals = (proposals ?? []).filter(
    (p) => p.status === "draft" || p.status === "sent" || p.status === "order"
  );

  return (
    <div className="relative mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-bold text-gray-600 hover:border-gray-900 hover:text-gray-900 transition-colors whitespace-nowrap"
        title="Inserir na Proposta"
      >
        <FilePlus size={12} />
        Inserir na Proposta
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-900 shadow-xl z-50 min-w-52 max-h-64 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-bold tracking-widest uppercase text-gray-400 border-b border-gray-100 bg-gray-50">
            Inserir em qual proposta?
          </div>
          {activeProposals.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-400">
              Nenhuma proposta ativa.
              <a
                href="/propostas"
                className="block text-blue-800 font-bold mt-1 hover:underline"
              >
                Criar nova proposta →
              </a>
            </div>
          ) : (
            activeProposals.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  addItem.mutate({
                    proposalId: p.id,
                    productId: product.id,
                    productName: product.name,
                    activeIngredient: product.activeIngredient ?? null,
                    manufacturer: product.manufacturer ?? null,
                    concentration: product.concentration ?? null,
                    presentation: product.presentation ?? null,
                    unit: product.unit ?? null,
                    supplierName: product.supplierName ?? null,
                    unitPrice: product.price ?? null,
                    quantity: 1,
                    registroMapa: (product as any).mapa ?? null,
                  })
                }
                disabled={addItem.isPending}
                className="w-full text-left px-3 py-2.5 text-xs hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
              >
                <div className="font-semibold text-gray-900 truncate">
                  {p.title}
                </div>
                {p.processNumber && (
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {p.processNumber}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Comparacao() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>();

  const { data: categories } = trpc.categories.list.useQuery();
  const { data: results, isLoading } =
    trpc.products.compareByActiveIngredient.useQuery(
      { activeIngredient: submitted, categoryId },
      { enabled: submitted.length >= 2 }
    );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) setSubmitted(query.trim());
  };

  const minPrice =
    results && results.length > 0
      ? Math.min(
          ...results.filter((r) => r.price).map((r) => parseFloat(r.price!))
        )
      : null;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <span className="its-bar" />
        <h1 className="text-3xl font-black tracking-tight text-gray-900">
          Comparação de Preços
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Busque por princípio ativo e compare todos os fornecedores disponíveis
          com suas especificações completas.
        </p>
      </div>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-0">
          <div className="flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex: Amoxicilina, Ivermectina, Dipirona..."
              className="its-search"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="bg-gray-900 text-white px-5 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors flex items-center gap-2 self-end mb-0.5"
          >
            <Search size={14} />
            Comparar
          </button>
        </div>

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
              Todas as categorias
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() =>
                  setCategoryId(categoryId === cat.id ? undefined : cat.id)
                }
                className="text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 border transition-colors"
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
      </form>

      {isLoading && submitted && (
        <div className="py-12 text-center">
          <div className="w-6 h-1 bg-blue-800 mx-auto mb-3 animate-pulse" />
          <p className="text-xs text-gray-400 tracking-widest uppercase">
            Comparando...
          </p>
        </div>
      )}

      {!isLoading && submitted && results && results.length === 0 && (
        <div className="border border-gray-200 p-8 text-center">
          <BarChart3 size={20} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500">
            Nenhum produto encontrado com princípio ativo "{submitted}"
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Verifique se o princípio ativo está cadastrado nas planilhas
            importadas.
          </p>
        </div>
      )}

      {!isLoading && results && results.length > 0 && (
        <div>
          {/* Summary bar */}
          <div className="border border-gray-900 p-4 mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                Princípio Ativo
              </div>
              <div className="text-xl font-black text-gray-900">{submitted}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {results.length} produto{results.length !== 1 ? "s" : ""} de{" "}
                {new Set(results.map((r) => r.supplierId)).size} fornecedor
                {new Set(results.map((r) => r.supplierId)).size !== 1
                  ? "es"
                  : ""}
              </div>
            </div>
            {minPrice !== null && (
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] font-bold tracking-widest uppercase text-blue-800">
                  Menor Preço
                </div>
                <div className="price-display price-best text-2xl">
                  R${" "}
                  {minPrice.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Price comparison cards */}
          <div className="grid grid-cols-1 gap-px bg-gray-200 border border-gray-200 mb-8">
            {results.map((p, idx) => {
              const price = p.price ? parseFloat(p.price) : null;
              const isBest = price !== null && price === minPrice;
              const priceDiff =
                price !== null && minPrice !== null && price > minPrice
                  ? (((price - minPrice) / minPrice) * 100).toFixed(1)
                  : null;

              return (
                <div
                  key={p.id}
                  className={`bg-white p-4 flex items-start justify-between gap-4 ${
                    isBest ? "border-l-4 border-l-red-600" : ""
                  }`}
                >
                  {/* Left: image + info */}
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Product image or index */}
                    {(p as any).imageUrl ? (
                      <div className="w-14 h-14 flex-shrink-0 border border-gray-100 bg-gray-50 overflow-hidden">
                        <img
                          src={(p as any).imageUrl}
                          alt={p.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            const parent = (e.target as HTMLImageElement)
                              .parentElement;
                            if (parent) {
                              parent.innerHTML = `<div class="w-full h-full flex items-center justify-center font-mono text-xs font-bold text-gray-400">${idx + 1}</div>`;
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-7 h-7 bg-gray-100 flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold text-gray-500">
                        {idx + 1}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">
                          {p.name}
                        </span>
                        {isBest && (
                          <span className="text-[10px] font-bold tracking-widest uppercase bg-blue-800 text-white px-1.5 py-0.5">
                            Menor Preço
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                        {p.manufacturer && (
                          <div>
                            <span className="text-gray-400">Fabricante:</span>{" "}
                            {p.manufacturer}
                          </div>
                        )}
                        {p.concentration && (
                          <div>
                            <span className="text-gray-400">Concentração:</span>{" "}
                            {p.concentration}
                          </div>
                        )}
                        {p.presentation && (
                          <div>
                            <span className="text-gray-400">Apresentação:</span>{" "}
                            {p.presentation}
                          </div>
                        )}
                        {p.unit && (
                          <div>
                            <span className="text-gray-400">Unidade:</span>{" "}
                            {p.unit}
                          </div>
                        )}
                        {(p as any).description && (
                          <div className="text-gray-400 text-[11px] mt-1 line-clamp-2">
                            {(p as any).description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs font-semibold text-gray-700">
                          {p.supplierName}
                        </span>
                        {p.categoryName && (
                          <span
                            className="category-badge"
                            style={{ color: p.categoryColor ?? "#6B7280" }}
                          >
                            {p.categoryName}
                          </span>
                        )}
                      </div>

                      {/* Add to Proposal button */}
                      <AddToProposalButton product={p as any} />
                    </div>
                  </div>

                  {/* Right: price */}
                  <div className="flex-shrink-0 text-right">
                    {price !== null ? (
                      <>
                        <div
                          className={`price-display text-xl ${
                            isBest ? "price-best" : "text-gray-900"
                          }`}
                        >
                          {isBest && (
                            <ArrowDown
                              size={12}
                              className="inline mr-0.5 mb-0.5"
                            />
                          )}
                          R${" "}
                          {price.toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                        {p.priceUnit && (
                          <div className="text-[10px] text-gray-400">
                            /{p.priceUnit}
                          </div>
                        )}
                        {priceDiff && (
                          <div className="text-[10px] text-orange-500 font-semibold mt-1">
                            +{priceDiff}% acima do menor
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">Sem preço</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!submitted && (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-2 border-gray-200 flex items-center justify-center mx-auto mb-4">
            <BarChart3 size={16} className="text-gray-300" />
          </div>
          <p className="text-sm text-gray-400">
            Digite um princípio ativo para comparar preços entre fornecedores
          </p>
        </div>
      )}
    </div>
  );
}
