import { trpc } from "@/lib/trpc";
import {
    ArrowLeft,
    Download,
    Edit2,
    ExternalLink,
    FileText,
    GitMerge,
    Loader2,
    Mail,
    Plus,
    Save,
    ScrollText,
    ShoppingCart,
    Trash2,
    TrendingDown,
    TrendingUp,
    X,
  } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

// ─── Item Row ─────────────────────────────────────────────────────────────────
function ItemRow({
  item,
  index,
  onUpdate,
  onRemove,
  taxPct = 0,
  minMarginPct = 0,
}: {
  item: any;
  index: number;
  onUpdate: (id: number, data: any) => void;
  onRemove: (id: number) => void;
  taxPct?: number;
  minMarginPct?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(item.quantity ?? 1));
  const [price, setPrice] = useState(item.unitPrice ? String(item.unitPrice) : "");
  const [suggestedPrice, setSuggestedPrice] = useState(item.suggestedPrice ? String(item.suggestedPrice) : "");
  const [editalRefPrice, setEditalRefPrice] = useState(item.editalRefPrice ? String(item.editalRefPrice) : "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [registroMapa, setRegistroMapa] = useState((item as any).registroMapa ?? "");
  const [showSimilares, setShowSimilares] = useState(false);
  const activeIngredient = item.activeIngredient ?? "";
  const productId = item.productId as number | undefined;
  // Equivalentes por ficha técnica (usa productId)
  const { data: equivData, isLoading: loadingEquiv } = trpc.products.suggestEquivalentsByFichaTecnica.useQuery(
    { productId: productId!, limit: 20, onlyWithPrice: false },
    { enabled: showSimilares && !!productId }
  );
  // Fallback por princípio ativo quando não há productId
  const { data: similaresFallback = [], isLoading: loadingFallback } = trpc.products.compareByActiveIngredient.useQuery(
    { activeIngredient },
    { enabled: showSimilares && !productId && !!activeIngredient }
  );
  const loadingSimilares = productId ? loadingEquiv : loadingFallback;
  const equivalents = productId ? (equivData?.equivalents ?? []) : (similaresFallback as any[]);
  const fichaRef = equivData?.fichaRef;
  // Verificar se há equivalentes para mostrar o banner
  const { data: equivPreview } = trpc.products.suggestEquivalentsByFichaTecnica.useQuery(
    { productId: productId!, limit: 5, onlyWithPrice: false },
    { enabled: !showSimilares && !!productId }
  );
  const hasOtherSimilares = productId
    ? (equivPreview?.totalFound ?? 0) > 0
    : (similaresFallback as any[]).some((s: any) => s.id !== item.productId);
  // A peça comercial usa somente o preço de venda explicitamente informado.
  const effectivePrice = suggestedPrice;
  const total = effectivePrice && qty ? (parseFloat(effectivePrice) * parseInt(qty)).toFixed(2) : null;
  const costPrice = item.costPrice ? parseFloat(String(item.costPrice)) : null;
  // Preço mínimo de venda = custo ÷ (1 - margem%) × (1 + imposto%)
  const minSalePrice = costPrice != null && costPrice > 0
    ? (costPrice * (1 + taxPct / 100)) / (1 - Math.min(minMarginPct, 99) / 100)
    : null;
  const suggestedNum = suggestedPrice ? parseFloat(suggestedPrice) : null;
  const priceStatus: "ok" | "warn" | "danger" | null =
    minSalePrice != null && suggestedNum != null
      ? suggestedNum >= minSalePrice ? "ok"
        : suggestedNum >= minSalePrice * 0.95 ? "warn"
        : "danger"
      : null;
  // Margem atual (%): (preço - custo) / preço * 100
  const currentMarginPct = costPrice != null && costPrice > 0 && suggestedNum != null && suggestedNum > 0
    ? ((suggestedNum - costPrice) / suggestedNum) * 100
    : null;

  const handleSave = () => {
    onUpdate(item.id, {
      quantity: parseInt(qty) || 1,
      unitPrice: price || null,
      suggestedPrice: suggestedPrice || null,
      editalRefPrice: editalRefPrice || null,
      notes: notes || null,
      registroMapa: registroMapa.trim() || null,
    });
    setEditing(false);
  };

  return (
    <>
    <tr className={`border-b hover:bg-gray-50 ${
      priceStatus === "danger" ? "bg-red-50 border-red-200" :
      priceStatus === "warn" ? "bg-yellow-50 border-yellow-100" :
      "border-gray-100"
    }`}>
      <td className="px-3 py-2 text-xs text-gray-400 font-mono w-10 text-center">
        {index + 1}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-start gap-3">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.productName}
              className="w-12 h-12 object-contain border border-gray-100 flex-shrink-0 bg-white"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">{item.productName}</div>
            {item.activeIngredient && (
              <div className="text-[10px] text-gray-400">P.A.: {item.activeIngredient}</div>
            )}
            {item.concentration && (
              <div className="text-[10px] text-gray-400">{item.concentration}{item.presentation ? ` — ${item.presentation}` : ""}</div>
            )}
            {item.manufacturer && (
              <div className="text-[10px] text-gray-400">Fab.: {item.manufacturer}</div>
            )}
            {item.supplierName && (
              <div className="text-[10px] text-blue-500">Fornecedor: {item.supplierName}</div>
            )}
            {editing ? (
              <div className="mt-1.5">
                <label className="text-[9px] font-bold tracking-widest uppercase text-gray-400 block mb-0.5">Reg. MAPA/ANVISA</label>
                <input
                  type="text"
                  value={registroMapa}
                  onChange={(e) => setRegistroMapa(e.target.value)}
                  placeholder="Ex: PA 0012345/2019"
                  className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:border-gray-900 font-mono"
                />
              </div>
            ) : (
              (item as any).registroMapa && (
                <div className="text-[10px] text-gray-500 font-mono">Reg. MAPA/ANVISA: <span className="font-semibold">{(item as any).registroMapa}</span></div>
              )
            )}
            {item.productUrl && (
              <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-700 hover:underline font-semibold mt-0.5">
                <ShoppingCart size={10} /> Comprar produto ↗
              </a>
            )}
            {activeIngredient && (
              <button
                onClick={() => setShowSimilares((v) => !v)}
                className="inline-flex items-center gap-1 text-[10px] text-teal-700 hover:underline font-semibold mt-0.5 ml-2"
              >
                <GitMerge size={10} /> {showSimilares ? "Ocultar similares" : "Ver similares"}
              </button>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-xs text-gray-600 w-20">{item.unit ?? "—"}</td>
      <td className="px-3 py-2 w-24">
        {editing ? (
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:border-gray-900"
            min={1}
          />
        ) : (
          <span className="text-sm font-semibold text-gray-900">{item.quantity}</span>
        )}
      </td>
      {/* Custo do Sistema */}
      <td className="px-3 py-2 w-28">
        {editing ? (
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:border-gray-900"
            step="0.01"
          />
        ) : (
          <span className="text-xs text-gray-500">
            {item.unitPrice ? `R$ ${parseFloat(item.unitPrice).toFixed(2)}` : "—"}
          </span>
        )}
        {costPrice !== null && !editing && (
          <div className="text-[9px] text-gray-400">custo</div>
        )}
      </td>
      {/* Ref. Edital */}
      <td className="px-3 py-2 w-28">
        {editing ? (
          <input
            type="number"
            value={editalRefPrice}
            onChange={(e) => setEditalRefPrice(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:border-gray-900 bg-amber-50"
            step="0.01"
          />
        ) : (
          <span className="text-xs text-amber-700 font-medium">
            {item.editalRefPrice ? `R$ ${parseFloat(item.editalRefPrice).toFixed(2)}` : "—"}
          </span>
        )}
      </td>
      {/* Preço Sugerido */}
      <td className="px-3 py-2 w-32">
        {editing ? (
          <input
            type="number"
            value={suggestedPrice}
            onChange={(e) => setSuggestedPrice(e.target.value)}
            placeholder="0.00"
            className="w-full border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:border-blue-600 bg-blue-50 font-bold"
            step="0.01"
          />
        ) : (
          <div>
            <span className="text-sm font-bold text-blue-800">
              {item.suggestedPrice ? `R$ ${parseFloat(item.suggestedPrice).toFixed(2)}` : "Não definido"}
            </span>
            {priceStatus === "ok" && (
              <div className="flex items-center gap-1 mt-0.5">
                <TrendingUp size={9} className="text-green-600" />
                <span className="text-[9px] text-green-700 font-bold">Acima do mínimo</span>
              </div>
            )}
            {priceStatus === "warn" && (
              <div className="flex items-center gap-1 mt-0.5">
                <TrendingDown size={9} className="text-yellow-600" />
                <span className="text-[9px] text-yellow-700 font-bold">Próximo do mínimo</span>
              </div>
            )}
            {priceStatus === "danger" && (
              <div className="flex items-center gap-1 mt-0.5">
                <TrendingDown size={9} className="text-red-600" />
                <span className="text-[9px] text-red-700 font-bold">Abaixo do mínimo! (R$ {minSalePrice!.toFixed(2)})</span>
              </div>
            )}
            {priceStatus === null && minSalePrice !== null && (
              <div className="text-[9px] text-gray-400 mt-0.5">Mín: R$ {minSalePrice.toFixed(2)}</div>
            )}
            {currentMarginPct !== null && (
              <div className={`text-[9px] font-bold mt-0.5 ${
                currentMarginPct >= minMarginPct ? "text-green-700" :
                currentMarginPct >= minMarginPct * 0.95 ? "text-yellow-700" :
                "text-red-700"
              }`}>
                Margem: {currentMarginPct.toFixed(1)}%
              </div>
            )}
          </div>
        )}
      </td>
      {/* Total (baseado no preço sugerido) */}
      <td className="px-3 py-2 w-32 text-sm font-semibold text-gray-900">
        {total ? `R$ ${parseFloat(total).toFixed(2)}` : item.totalPrice ? `R$ ${parseFloat(item.totalPrice).toFixed(2)}` : "—"}
      </td>
      <td className="px-3 py-2 w-24">
        {editing ? (
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              className="text-green-600 hover:text-green-800 p-1 text-xs font-bold"
            >
              OK
            </button>
            <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-900 p-1">
              <X size={11} />
            </button>
          </div>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={() => setEditing(true)}
              className="text-gray-400 hover:text-gray-900 p-1"
              title="Editar"
            >
              <Edit2 size={11} />
            </button>
            <button
              onClick={() => onRemove(item.id)}
              className="text-gray-300 hover:text-blue-800 p-1"
              title="Remover"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </td>
    </tr>
    {/* Banner: equivalentes disponíveis */}
    {(activeIngredient || productId) && hasOtherSimilares && !showSimilares && (
      <tr className="bg-amber-50 border-b border-amber-100">
        <td colSpan={9} className="px-4 py-1.5">
          <div className="flex items-center gap-2">
            <GitMerge size={11} className="text-amber-600" />
            <span className="text-[10px] text-amber-800 font-bold">
              {productId
                ? `${equivPreview?.totalFound ?? 0} equivalente(s) técnico(s) encontrado(s) no catálogo`
                : `Existem equivalentes por princípio ativo no catálogo`
              }
            </span>
            <button onClick={() => setShowSimilares(true)} className="text-[10px] text-amber-700 underline ml-auto font-bold">
              Ver equivalentes
            </button>
          </div>
        </td>
      </tr>
    )}
    {/* Painel de equivalentes por ficha técnica */}
    {showSimilares && (activeIngredient || productId) && (
      <tr className="bg-teal-50 border-b border-teal-100">
        <td colSpan={9} className="px-4 py-3">
          {/* Cabeçalho do painel */}
          <div className="flex items-center gap-2 mb-2">
            <GitMerge size={13} className="text-teal-700" />
            <span className="text-xs font-black text-teal-900">
              Equivalentes Técnicos
              {activeIngredient ? ` — P.A.: ${activeIngredient}` : ""}
            </span>
            <span className="text-[10px] text-teal-600">— clique para substituir este item</span>
            <button onClick={() => setShowSimilares(false)} className="ml-auto text-[10px] text-gray-400 hover:text-gray-700 underline">
              Fechar
            </button>
          </div>
          {/* Ficha técnica de referência */}
          {fichaRef && Object.values(fichaRef).some(Boolean) && (
            <div className="mb-2 p-2 bg-white border border-teal-200 text-[10px] text-gray-600 flex flex-wrap gap-x-4 gap-y-0.5">
              <span className="font-bold text-teal-800 w-full mb-0.5">Ficha Técnica do Produto Atual:</span>
              {fichaRef.principioAtivo && <span><b>P.A.:</b> {fichaRef.principioAtivo}</span>}
              {fichaRef.concentracao && <span><b>Conc.:</b> {fichaRef.concentracao}</span>}
              {fichaRef.formaFarmaceutica && <span><b>Forma:</b> {fichaRef.formaFarmaceutica}</span>}
              {fichaRef.classeTerapeutica && <span><b>Classe:</b> {fichaRef.classeTerapeutica}</span>}
              {fichaRef.especieAlvo && <span><b>Espécie:</b> {fichaRef.especieAlvo}</span>}
            </div>
          )}
          {/* Lista de equivalentes */}
          {loadingSimilares ? (
            <p className="text-xs text-gray-400">Buscando equivalentes...</p>
          ) : equivalents.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum equivalente encontrado no catálogo.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {equivalents.map((s: any) => {
                const sPrice = s.price ? parseFloat(String(s.price)) : null;
                const currentPrice = item.unitPrice ? parseFloat(String(item.unitPrice)) : null;
                const isCheaper = sPrice !== null && currentPrice !== null && sPrice < currentPrice;
                const diffPct = sPrice && currentPrice ? ((currentPrice - sPrice) / currentPrice * 100).toFixed(1) : null;
                const statusColor = s.status === "APROVADO" ? "border-green-300 bg-green-50" : s.status === "REVISAO" ? "border-yellow-300 bg-yellow-50" : "border-gray-200 bg-white";
                const statusLabel = s.status === "APROVADO" ? { text: "APROVADO", cls: "bg-green-100 text-green-800" } : s.status === "REVISAO" ? { text: "REVISÃO", cls: "bg-yellow-100 text-yellow-800" } : { text: "DIVERGENTE", cls: "bg-red-100 text-red-700" };
                return (
                  <div
                    key={s.id}
                    className={`flex items-start gap-2 border p-2 cursor-pointer hover:border-teal-400 transition-colors ${statusColor}`}
                    onClick={() => {
                      onUpdate(item.id, {
                        productId: s.id,
                        productName: s.name,
                        activeIngredient: s.activeIngredient ?? null,
                        manufacturer: s.manufacturer ?? null,
                        concentration: s.concentration ?? null,
                        presentation: s.presentation ?? null,
                        unit: s.unit ?? item.unit,
                        supplierName: s.supplierName ?? null,
                        unitPrice: sPrice ? String(sPrice.toFixed(2)) : item.unitPrice,
                        imageUrl: s.imageUrl ?? null,
                        productUrl: s.productUrl ?? null,
                      });
                      setShowSimilares(false);
                      toast.success(`Produto substituído por ${s.name}`);
                    }}
                  >
                    {s.imageUrl && (
                      <img src={s.imageUrl} alt={s.name} className="w-10 h-10 object-contain border border-gray-100 flex-shrink-0 bg-white" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap mb-0.5">
                        <p className="text-xs font-semibold text-gray-900 truncate flex-1">{s.name}</p>
                        {s.status && <span className={`text-[9px] px-1 font-bold ${statusLabel.cls}`}>{statusLabel.text}</span>}
                        {s.score !== undefined && <span className="text-[9px] text-gray-400">{s.score}%</span>}
                      </div>
                      {s.manufacturer && <p className="text-[10px] text-gray-500">Fab.: {s.manufacturer}</p>}
                      {s.concentration && <p className="text-[10px] text-gray-400">{s.concentration}{s.presentation ? ` — ${s.presentation}` : ""}</p>}
                      {/* Ficha técnica do candidato */}
                      {s.fichaParsed && (s.fichaParsed.classeTerapeutica || s.fichaParsed.especieAlvo) && (
                        <p className="text-[9px] text-gray-400">
                          {s.fichaParsed.classeTerapeutica && <span>Classe: {s.fichaParsed.classeTerapeutica} </span>}
                          {s.fichaParsed.especieAlvo && <span>Espécie: {s.fichaParsed.especieAlvo}</span>}
                        </p>
                      )}
                      {/* Detalhes de compatibilidade */}
                      {s.matchDetails && s.matchDetails.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {s.matchDetails.map((m: any) => (
                            <span key={m.field} className={`text-[9px] px-1 ${m.match ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                              {m.match ? "✓" : "✗"} {m.field}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {sPrice !== null && (
                          <span className={`text-xs font-bold ${isCheaper ? "text-green-700" : "text-gray-700"}`}>
                            R$ {sPrice.toFixed(2)}
                          </span>
                        )}
                        {isCheaper && diffPct && (
                          <span className="text-[10px] bg-green-100 text-green-800 px-1 font-bold">{diffPct}% mais barato</span>
                        )}
                        {s.economia && (
                          <span className="text-[10px] bg-green-100 text-green-800 px-1 font-bold">Economia: {s.economia}%</span>
                        )}
                        {s.supplierName && (
                          <span className="text-[10px] text-blue-600">{s.supplierName}</span>
                        )}
                        {s.productUrl && (
                          <a href={s.productUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-blue-700 hover:underline inline-flex items-center gap-0.5">
                            <ExternalLink size={9} /> Comprar
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </td>
      </tr>
    )}
  </>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────
export default function PropostaEditor() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = parseInt(params.id ?? "0");

  const { data: proposal, isLoading, refetch } = trpc.proposals.get.useQuery(
    { id },
    { enabled: !!id }
  );
  const { data: company } = trpc.company.get.useQuery();
  const utils = trpc.useUtils();

  const [editingHeader, setEditingHeader] = useState(false);
  // Modal de parcelamento ao marcar como Entregue
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [installmentForm, setInstallmentForm] = useState({ nInstallments: 1, firstDueDate: new Date().toISOString().slice(0, 10) });
  const advanceStatusMutation = trpc.proposals.advanceStatus.useMutation({
    onSuccess: () => {
      utils.proposals.get.invalidate({ id });
      utils.proposals.list.invalidate();
      toast.success("Proposta marcada como entregue!");
      setEditingHeader(false);
      setShowInstallmentModal(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const [headerForm, setHeaderForm] = useState({
    title: "",
    processNumber: "",
    orgName: "",
    status: "draft" as "draft" | "sent" | "order" | "in_transit" | "delivered" | "cancelled",
    validityDays: "30",
    paymentTerms: "",
    deliveryTerms: "",
    notes: "",
  });

  useEffect(() => {
    if (proposal) {
      setHeaderForm({
        title: proposal.title ?? "",
        processNumber: proposal.processNumber ?? "",
        orgName: proposal.orgName ?? "",
        status: proposal.status as any,
        validityDays: String(proposal.validityDays ?? 30),
        paymentTerms: proposal.paymentTerms ?? "",
        deliveryTerms: proposal.deliveryTerms ?? "",
        notes: proposal.notes ?? "",
      });
    }
  }, [proposal]);

  const updateProposal = trpc.proposals.update.useMutation({
    onSuccess: () => {
      utils.proposals.get.invalidate({ id });
      utils.proposals.list.invalidate();
      toast.success("Proposta atualizada!");
      setEditingHeader(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateItem = trpc.proposals.updateItem.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  const removeItem = trpc.proposals.removeItem.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  const handleSaveHeader = () => {
    // Se está marcando como Entregue e ainda não estava entregue, abrir modal de parcelamento
    if (headerForm.status === "delivered" && proposal?.status !== "delivered") {
      setShowInstallmentModal(true);
      return;
    }
    updateProposal.mutate({
      id,
      title: headerForm.title,
      processNumber: headerForm.processNumber || null,
      orgName: headerForm.orgName || null,
      status: headerForm.status,
      validityDays: parseInt(headerForm.validityDays) || 30,
      paymentTerms: headerForm.paymentTerms || null,
      deliveryTerms: headerForm.deliveryTerms || null,
      notes: headerForm.notes || null,
    });
  };
  const handleConfirmDelivery = () => {
    // Salvar dados do header primeiro, depois avançar status com parcelamento
    updateProposal.mutate({
      id,
      title: headerForm.title,
      processNumber: headerForm.processNumber || null,
      orgName: headerForm.orgName || null,
      validityDays: parseInt(headerForm.validityDays) || 30,
      paymentTerms: headerForm.paymentTerms || null,
      deliveryTerms: headerForm.deliveryTerms || null,
      notes: headerForm.notes || null,
    }, {
      onSuccess: () => {
        advanceStatusMutation.mutate({
          id,
          newStatus: "delivered",
          installments: installmentForm.nInstallments > 1 ? installmentForm.nInstallments : undefined,
          firstDueDate: installmentForm.firstDueDate
            ? new Date(installmentForm.firstDueDate + "T12:00:00")
            : undefined,
        });
      },
    });
  };

  const totalGeral = (proposal?.items ?? []).reduce((sum, item) => {
    const salePrice = Number((item as any).suggestedPrice);
    const quantity = Number(item.quantity);
    if (!Number.isFinite(salePrice) || salePrice <= 0) return sum;
    if (!Number.isFinite(quantity) || quantity <= 0) return sum;
    return sum + salePrice * quantity;
  }, 0);

  const exportPricingIssues = (proposal?.items ?? []).flatMap((item, index) => {
    const issues: string[] = [];
    const salePrice = Number((item as any).suggestedPrice);
    const quantity = Number(item.quantity);
    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      issues.push(`Item ${index + 1}: preço de venda não definido`);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      issues.push(`Item ${index + 1}: quantidade inválida`);
    }
    return issues;
  });
  if ((proposal?.items ?? []).length === 0) {
    exportPricingIssues.push("A proposta não possui itens");
  }
  const canExportPdf = exportPricingIssues.length === 0;

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // ── Declarações ──────────────────────────────────────────────────────────
  const { data: declaracaoTemplates } = trpc.declarations.listTemplates.useQuery();
  const [selectedDeclarations, setSelectedDeclarations] = useState<number[]>([]);
  const [showDeclaracoesPanel, setShowDeclaracoesPanel] = useState(false);
  const saveSnapshotMutation = trpc.declarations.saveSnapshot.useMutation();
  const { data: savedSnapshots } = trpc.declarations.getForProposal.useQuery(
    { proposalId: id },
    { enabled: !!id }
  );
  // Pré-selecionar declarações salvas ao carregar a proposta
  useEffect(() => {
    if (savedSnapshots && (savedSnapshots as any[]).length > 0 && declaracaoTemplates) {
      const savedTemplateIds = (savedSnapshots as any[])
        .map((s: any) => s.templateId)
        .filter((tid: any) => tid !== null && tid !== undefined) as number[];
      if (savedTemplateIds.length > 0) {
        setSelectedDeclarations(savedTemplateIds);
      }
    }
  }, [savedSnapshots, declaracaoTemplates]);

  const toggleDeclaracao = (id: number) => {
    setSelectedDeclarations((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  // ── Manual item modal ──────────────────────────────────────────────────────
  const [showManualModal, setShowManualModal] = useState(false);
  const emptyManualForm = {
    productName: "",
    activeIngredient: "",
    manufacturer: "",
    concentration: "",
    presentation: "",
    unit: "",
    supplierName: "",
    registroMapa: "",
    unitPrice: "",
    quantity: "1",
    notes: "",
  };
  const [manualForm, setManualForm] = useState(emptyManualForm);

  // ── Alerta de similar mais barato (item manual) ──────────────────────────────────────
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
  const [similarAlert, setSimilarAlert] = useState<{
    similars: SimilarProduct[];
    addedItemId: number | null;
    originalName: string;
    originalPrice: string | null;
    originalSupplier: string | null;
  } | null>(null);

  const addManualItem = trpc.proposals.addItem.useMutation({
    onSuccess: async (insertedId) => {
      refetch();
      setManualForm(emptyManualForm);
      setShowManualModal(false);
      toast.success("Item adicionado à proposta!");
      // Verificar se há similar mais barato
      const price = manualForm.unitPrice;
      // Buscar similares por princípio ativo se disponível
      if (price && price !== "0" && manualForm.activeIngredient?.trim()) {
        try {
          // Buscar produtos com o mesmo princípio ativo
          const search = await utils.products.list.fetch({
            search: manualForm.activeIngredient,
            searchField: "activeIngredient",
            limit: 10,
          });
          const match = (search as any)?.products?.find((p: any) =>
            p.activeIngredient?.toLowerCase() === manualForm.activeIngredient.toLowerCase()
          );
          if (match?.id) {
            const result = await utils.proposals.findCheaperSimilar.fetch({
              productId: match.id,
              unitPrice: price,
            });
            if (result.similars && result.similars.length > 0) {
              setSimilarAlert({
                similars: result.similars as SimilarProduct[],
                addedItemId: typeof insertedId === "number" ? insertedId : null,
                originalName: manualForm.productName,
                originalPrice: price,
                originalSupplier: manualForm.supplierName || null,
              });
            }
          }
        } catch {
          // silently ignore
        }
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.productName.trim()) {
      toast.error("O nome do produto é obrigatório.");
      return;
    }
    addManualItem.mutate({
      proposalId: id,
      productId: null,
      productName: manualForm.productName.trim(),
      activeIngredient: manualForm.activeIngredient || null,
      manufacturer: manualForm.manufacturer || null,
      concentration: manualForm.concentration || null,
      presentation: manualForm.presentation || null,
      unit: manualForm.unit || null,
      supplierName: manualForm.supplierName || null,
      registroMapa: manualForm.registroMapa || null,
      unitPrice: manualForm.unitPrice || null,
      quantity: parseInt(manualForm.quantity) || 1,
      notes: manualForm.notes || null,
    });
  };

  const { data: propTemplates = [] } = trpc.proposalTemplates.list.useQuery();
  // Módulo de Regras Tributárias removido
  const totalImpostosPct = 0;

  // ── Painel de Margem ────────────────────────────────────────────
  const [panelMarkup, setPanelMarkup] = useState(30);
  // ── Painel de Impostos e Frete ──────────────────────────────────
  const [panelIcms, setPanelIcms] = useState(0);
  const [panelSt, setPanelSt] = useState(0);
  const [panelOutrosImpostos, setPanelOutrosImpostos] = useState(0);
  const [panelFrete, setPanelFrete] = useState(0);
  const [panelMinMargin, setPanelMinMargin] = useState(10);
  // Inicializar margem mínima com o valor global da empresa
  useEffect(() => {
    if ((company as any)?.minMarginPercent != null) {
      setPanelMinMargin(parseFloat(String((company as any).minMarginPercent)));
    }
  }, [(company as any)?.minMarginPercent]);
  const custoTotal = (proposal?.items ?? []).reduce((sum, item) => {
    const price = item.unitPrice ? parseFloat(String(item.unitPrice)) : 0;
    const qty = item.quantity ?? 1;
    return sum + price * qty;
  }, 0);
  // Total comercial: preço de venda explícito; custo nunca é fallback.
  const totalSugerido = (proposal?.items ?? []).reduce((sum, item) => {
    const price = Number((item as any).suggestedPrice);
    const qty = Number(item.quantity);
    if (!Number.isFinite(price) || price <= 0) return sum;
    if (!Number.isFinite(qty) || qty <= 0) return sum;
    return sum + price * qty;
  }, 0);
  const totalImpostosManualPct = panelIcms + panelSt + panelOutrosImpostos;
  const valorImpostos = totalSugerido * (totalImpostosManualPct / 100);
  const totalFinal = totalSugerido + valorImpostos + panelFrete;
  const custoComImpostos = custoTotal * (1 + totalImpostosPct / 100);
  const vendaTotal = custoComImpostos * (1 + panelMarkup / 100);
  const lucroTotal = vendaTotal - custoComImpostos;
  const margemPct = vendaTotal > 0 ? (lucroTotal / vendaTotal) * 100 : 0;

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfProgressMsg, setPdfProgressMsg] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const handleDownloadPdf = async () => {
    if (!canExportPdf) {
      toast.error(`PDF bloqueado: ${exportPricingIssues.slice(0, 2).join(". ")}.`);
      return;
    }
    setDownloadingPdf(true);
    setPdfProgressMsg("Preparando dados...");
    try {
      // Salvar snapshot das declarações selecionadas antes de gerar o PDF
      if (selectedDeclarations.length > 0 && declaracaoTemplates) {
        const selectedTemplates = (declaracaoTemplates as any[]).filter((t: any) => selectedDeclarations.includes(t.id));
        await saveSnapshotMutation.mutateAsync({
          proposalId: id,
          declarations: selectedTemplates.map((t: any, i: number) => ({
            templateId: t.id,
            title: t.title,
            content: t.content,
            sortOrder: i,
          })),
        });
      } else if (selectedDeclarations.length === 0) {
        // Limpar snapshot se nenhuma declaração selecionada
        await saveSnapshotMutation.mutateAsync({ proposalId: id, declarations: [] });
      }
      const params = new URLSearchParams();
      if (selectedDeclarations.length > 0) params.set("declarations", selectedDeclarations.join(","));
      const qs = params.toString();
      setPdfProgressMsg("Gerando PDF...");
      const url = `/api/proposals/${id}/pdf${qs ? `?${qs}` : ""}`;
      const response = await fetch(url);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Erro ao gerar PDF");
      }
      setPdfProgressMsg("Preparando download...");
      const blob = await response.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `proposta-${id}-${(proposal?.title ?? 'proposta').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      setPdfProgressMsg("");
      toast.success("PDF baixado com sucesso!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF. Tente novamente.");
    } finally {
      setDownloadingPdf(false);
      setPdfProgressMsg("");
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 py-12 text-center">
        <div className="w-6 h-1 bg-blue-800 mx-auto mb-3 animate-pulse" />
        <p className="text-xs text-gray-400 tracking-widest uppercase">Carregando proposta...</p>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="p-8 py-12 text-center">
        <FileText size={24} className="text-gray-200 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Proposta não encontrada.</p>
        <button onClick={() => navigate("/propostas")} className="mt-3 text-xs text-blue-800 font-bold hover:underline">
          Voltar para Propostas
        </button>
      </div>
    );
  }

  const STATUS_LABELS: Record<string, string> = { draft: "Rascunho", sent: "Enviada", order: "Pedido", in_transit: "Em Trânsito", delivered: "Entregue", cancelled: "Cancelada" };

  return (
    <div className="p-8">
      {/* Back + Actions */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button
          onClick={() => navigate("/propostas")}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={14} />
          Propostas
        </button>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-1 ${
            proposal.status === "delivered" ? "bg-green-50 text-green-700" :
            proposal.status === "sent" || proposal.status === "order" || proposal.status === "in_transit" ? "bg-blue-50 text-blue-700" :
            proposal.status === "cancelled" ? "bg-blue-50 text-blue-900" :
            "bg-gray-100 text-gray-600"
          }`}>
            {STATUS_LABELS[proposal.status] ?? proposal.status}
          </span>
          <button
            onClick={() => setEditingHeader(true)}
            className="flex items-center gap-2 border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:border-gray-900 transition-colors"
          >
            <Edit2 size={12} />
            Editar Cabeçalho
          </button>
          <button
            onClick={() => {
              const title = proposal?.title ?? "Proposta Comercial";
              const orgao = (proposal as any)?.orgao ?? "";
              setEmailTo("");
              setEmailSubject(`Proposta Comercial - ${title}${orgao ? ` - ${orgao}` : ""}`);
              setEmailBody(`Prezados,\n\nSegue em anexo nossa proposta comercial referente a ${title}${orgao ? ` para ${orgao}` : ""}.\n\nEstamos à disposição para quaisquer esclarecimentos.\n\nAtenciosamente,\n${(company as any)?.name ?? ""}`)
              setShowEmailModal(true);
            }}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 text-xs font-semibold hover:border-gray-900 transition-colors"
          >
            <Mail size={12} />
            Enviar E-mail
          </button>
          <button
            onClick={() => handleDownloadPdf()}
            disabled={downloadingPdf || !canExportPdf}
            className="flex items-center gap-2 bg-blue-800 text-white px-4 py-2 text-xs font-bold hover:bg-blue-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed min-w-[110px] justify-center"
            title={canExportPdf ? "Baixar proposta com preços de venda salvos" : exportPricingIssues.join("; ")}
          >
            {downloadingPdf ? (
              <><Loader2 size={12} className="animate-spin" />{pdfProgressMsg || "Gerando..."}</>
            ) : (
              <><Download size={12} />Baixar PDF</>
            )}
          </button>
          <button
            onClick={() => setShowDeclaracoesPanel(true)}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 text-xs font-bold hover:border-gray-900 transition-colors"
          >
            <ScrollText size={12} />
            Declarações
            {selectedDeclarations.length > 0 && (
              <span className="bg-blue-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                {selectedDeclarations.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {exportPricingIssues.length > 0 && (
        <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 print:hidden">
          <span className="font-black">Exportação bloqueada.</span>{" "}
          Salve o preço de venda de todos os itens antes de baixar o PDF.
          <span className="ml-1 text-red-600">
            {exportPricingIssues.slice(0, 3).join("; ")}
            {exportPricingIssues.length > 3 ? ` (+${exportPricingIssues.length - 3})` : ""}
          </span>
        </div>
      )}

      {/* Edit Header Modal */}
      {editingHeader && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-900 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-800" />
                <h2 className="text-base font-black text-gray-900">Editar Cabeçalho</h2>
              </div>
              <button onClick={() => setEditingHeader(false)} className="text-gray-400 hover:text-gray-900 p-1">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {(["title", "processNumber", "orgName", "validityDays", "paymentTerms", "deliveryTerms"] as const).map((field) => (
                <div key={field}>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">
                    {field === "title" ? "Título *" :
                     field === "processNumber" ? "Número do Processo" :
                     field === "orgName" ? "Órgão Requisitante" :
                     field === "validityDays" ? "Validade (dias)" :
                     field === "paymentTerms" ? "Condições de Pagamento" :
                     "Prazo de Entrega"}
                  </label>
                  <input
                    type={field === "validityDays" ? "number" : "text"}
                    value={headerForm[field]}
                    onChange={(e) => setHeaderForm((f) => ({ ...f, [field]: e.target.value }))}
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
              ))}
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Status</label>
                <select
                  value={headerForm.status}
                  onChange={(e) => setHeaderForm((f) => ({ ...f, status: e.target.value as any }))}
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                >
                  <option value="draft">Rascunho</option>
                  <option value="sent">Enviada</option>
                  <option value="order">Pedido</option>
                  <option value="in_transit">Em Trânsito</option>
                  <option value="delivered">Entregue</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Observações</label>
                <textarea
                  value={headerForm.notes}
                  onChange={(e) => setHeaderForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button onClick={() => setEditingHeader(false)} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:border-gray-900">
                  Cancelar
                </button>
                <button
                  onClick={handleSaveHeader}
                  disabled={updateProposal.isPending}
                  className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-50"
                >
                  <Save size={14} />
                  {updateProposal.isPending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── PRINTABLE PROPOSAL ─── */}
      <div className="proposal-print bg-white border border-gray-200 p-8 max-w-4xl mx-auto">
        {/* Company Header */}
        <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-900">
          <div className="flex items-center gap-4">
            {company?.logoUrl && (
              <img
                src={company.logoUrl}
                alt="Logo"
                className="h-16 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div>
              <div className="text-xl font-black text-gray-900 tracking-tight">
                {company?.name || "Sua Empresa"}
              </div>
              {company?.cnpj && <div className="text-xs text-gray-500">CNPJ: {company.cnpj}</div>}
              {company?.address && <div className="text-xs text-gray-500">{company.address}{company.city ? `, ${company.city}` : ""}{company.state ? `/${company.state}` : ""}</div>}
              {(company?.phone || company?.email) && (
                <div className="text-xs text-gray-500">
                  {company.phone}{company.phone && company.email ? " · " : ""}{company.email}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-1">Proposta Comercial</div>
            <div className="text-2xl font-black text-blue-800">#{String(proposal.id).padStart(4, "0")}</div>
            <div className="text-xs text-gray-500 mt-1">Data: {formatDate(proposal.createdAt)}</div>
            {proposal.validityDays && (
              <div className="text-xs text-gray-500">Validade: {proposal.validityDays} dias</div>
            )}
          </div>
        </div>

        {/* Proposal Info */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Proposta</div>
            <div className="text-base font-black text-gray-900">{proposal.title}</div>
            {proposal.processNumber && (
              <div className="text-sm text-gray-600 mt-0.5">
                <span className="font-semibold">Processo:</span> {proposal.processNumber}
              </div>
            )}
          </div>
          {proposal.orgName && (
            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Órgão Requisitante</div>
              <div className="text-base font-black text-gray-900">{proposal.orgName}</div>
            </div>
          )}
        </div>

        {/* Painel de Margem */}
        {(proposal.items ?? []).length > 0 && (
          <div className="mb-6 print:hidden">
            <div className="bg-gray-900 text-white px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-green-400" />
                <span className="text-[10px] font-bold tracking-widest uppercase text-gray-300">Painel de Margem</span>

              </div>
              <div className="flex items-center gap-3">

                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-gray-400 uppercase tracking-widest">Markup</label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    step={5}
                    value={panelMarkup}
                    onChange={(e) => setPanelMarkup(Number(e.target.value))}
                    className="w-16 bg-gray-800 text-white text-center text-sm font-bold border border-gray-600 px-2 py-1 focus:outline-none focus:border-green-400"
                  />
                  <span className="text-gray-400 text-sm">%</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 border-l border-r border-b border-gray-200">
              {/* Custo Total */}
              <div className="border-r border-gray-200 px-5 py-4">
                <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-1">Custo Total</div>
                <div className="text-xl font-black text-gray-900">
                  R$ {custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">Preço de compra</div>
              </div>

              {/* Preço de Venda */}
              <div className="border-r border-gray-200 px-5 py-4">
                <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-1">Preço de Venda</div>
                <div className="text-xl font-black text-blue-800">
                  R$ {vendaTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">Custo × {(1 + panelMarkup / 100).toFixed(2)}</div>
              </div>
              {/* Lucro Esperado */}
              <div className="border-r border-gray-200 px-5 py-4">
                <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-1">Lucro Esperado</div>
                <div className={`text-xl font-black ${lucroTotal >= 0 ? "text-green-700" : "text-red-600"}`}>
                  R$ {lucroTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">Venda − Custo</div>
              </div>
              {/* Margem % */}
              <div className="px-5 py-4">
                <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-1">Margem Líquida</div>
                <div className={`text-xl font-black ${
                  margemPct >= 20 ? "text-green-700" :
                  margemPct >= 10 ? "text-yellow-600" :
                  "text-red-600"
                }`}>
                  {margemPct.toFixed(1)}%
                </div>
                {/* Barra visual */}
                <div className="mt-2 h-1.5 bg-gray-100 w-full">
                  <div
                    className={`h-full transition-all ${
                      margemPct >= 20 ? "bg-green-500" :
                      margemPct >= 10 ? "bg-yellow-400" :
                      "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(margemPct, 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-gray-400 mt-0.5">
                  {margemPct >= 20 ? "Margem saudável" : margemPct >= 10 ? "Margem aceitável" : "Margem baixa"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 print:hidden">
            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Itens da Proposta</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowManualModal(true)}
                className="flex items-center gap-2 border border-gray-900 px-3 py-1.5 text-xs font-bold text-gray-900 hover:bg-gray-900 hover:text-white transition-colors"
              >
                <Plus size={12} />
                Adicionar Item Manual
              </button>
            </div>
          </div>
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-2 hidden print:block">Itens da Proposta</div>
          <table className="w-full border border-gray-200 text-sm">
            <thead>
              <tr className="bg-gray-900 text-white">
                <th className="px-3 py-2 text-left text-[10px] font-bold tracking-widest uppercase w-10">#</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold tracking-widest uppercase">Produto / Descrição</th>
                <th className="px-3 py-2 text-left text-[10px] font-bold tracking-widest uppercase w-20">Unid.</th>
                <th className="px-3 py-2 text-right text-[10px] font-bold tracking-widest uppercase w-20">Qtd.</th>
                <th className="px-3 py-2 text-right text-[10px] font-bold tracking-widest uppercase w-28">Custo</th>
                <th className="px-3 py-2 text-right text-[10px] font-bold tracking-widest uppercase w-28 bg-amber-50 text-amber-800">Ref. Edital</th>
                <th className="px-3 py-2 text-right text-[10px] font-bold tracking-widest uppercase w-32 bg-blue-50 text-blue-800">P. Sugerido</th>
                <th className="px-3 py-2 text-right text-[10px] font-bold tracking-widest uppercase w-32">Total</th>
                <th className="px-3 py-2 w-20 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {(proposal.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-400">
                    Nenhum item adicionado. Use a Busca Rápida para inserir produtos.
                  </td>
                </tr>
              ) : (
                (proposal.items ?? []).map((item, i) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={i}
                    onUpdate={(itemId, data) => updateItem.mutate({ id: itemId, ...data })}
                    onRemove={(itemId) => removeItem.mutate({ id: itemId })}
                    taxPct={totalImpostosManualPct}
                    minMarginPct={panelMinMargin}
                  />
                ))
              )}
            </tbody>
            {(proposal.items ?? []).length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-900 bg-gray-50">
                  <td colSpan={7} className="px-3 py-3 text-right text-sm font-black text-gray-900 uppercase tracking-wide">
                    Total Geral
                  </td>
                  <td className="px-3 py-3 text-right text-base font-black text-blue-800">
                    R$ {totalGeral.toFixed(2).replace(".", ",")}
                  </td>
                  <td className="print:hidden" />
                </tr>
              </tfoot>
            )}
           </table>
        </div>
        {/* Seletor de Template de Proposta */}
        {propTemplates.length > 0 && (
          <div className="mt-4 border border-blue-200 bg-blue-50 p-3 print:hidden flex items-center gap-3">
            <span className="text-[10px] font-bold tracking-widest uppercase text-blue-600 shrink-0">Template</span>
            <select
              className="flex-1 border border-blue-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:border-blue-500"
              defaultValue=""
              onChange={(e) => {
                const tpl = propTemplates.find((t: any) => String(t.id) === e.target.value);
                if (!tpl) return;
                setPanelIcms(parseFloat(String(tpl.icmsPercent ?? 0)));
                setPanelSt(parseFloat(String(tpl.stPercent ?? 0)));
                setPanelOutrosImpostos(parseFloat(String(tpl.otherTaxPercent ?? 0)));
                setPanelFrete(parseFloat(String(tpl.freightPercent ?? 0)));
                toast.success(`Template “${tpl.name}” aplicado`);
              }}
            >
              <option value="">Selecionar template de proposta...</option>
              {propTemplates.map((t: any) => (
                <option key={t.id} value={String(t.id)}>
                  {t.isDefault === "yes" ? "★ " : ""}{t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {/* Painel de Impostos e Frete */}
        <div className="mt-4 mb-6 border border-gray-200 bg-gray-50 p-4 print:hidden">
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-3">Impostos e Frete (não aparecem no PDF)</div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-600 block mb-1">ICMS (%)</label>
              <input
                type="number"
                value={panelIcms}
                onChange={(e) => setPanelIcms(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-gray-900"
                step="0.1" min={0} max={100}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 block mb-1">ST (%)</label>
              <input
                type="number"
                value={panelSt}
                onChange={(e) => setPanelSt(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-gray-900"
                step="0.1" min={0} max={100}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 block mb-1">Outros Impostos (%)</label>
              <input
                type="number"
                value={panelOutrosImpostos}
                onChange={(e) => setPanelOutrosImpostos(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-gray-900"
                step="0.1" min={0} max={100}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-600 block mb-1">Frete (R$)</label>
              <input
                type="number"
                value={panelFrete}
                onChange={(e) => setPanelFrete(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-gray-900"
                step="0.01" min={0}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 border-t border-gray-200 pt-3">
            <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Margem Mínima para cálculo do preço mínimo de venda:</span>
            <input
              type="number"
              value={panelMinMargin}
              onChange={(e) => setPanelMinMargin(parseFloat(e.target.value) || 0)}
              className="w-20 border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:border-blue-800 text-center font-bold"
              step="1" min={0} max={99}
            />
            <span className="text-sm text-gray-500 font-semibold">%</span>
            <span className="text-[10px] text-gray-400">(badge verde = acima do mínimo, amarelo = próximo, vermelho = prejuízo)</span>
          </div>
          {/* Resumo financeiro */}
          <div className="mt-4 grid grid-cols-4 gap-4 border-t border-gray-200 pt-3">
            <div className="text-center">
              <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400">Total Produtos</div>
              <div className="text-base font-black text-gray-900 mt-0.5">R$ {totalSugerido.toLocaleString("pt-BR", {minimumFractionDigits:2})}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400">Impostos ({(panelIcms+panelSt+panelOutrosImpostos).toFixed(1)}%)</div>
              <div className="text-base font-black text-orange-700 mt-0.5">+ R$ {valorImpostos.toLocaleString("pt-BR", {minimumFractionDigits:2})}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400">Frete</div>
              <div className="text-base font-black text-orange-700 mt-0.5">+ R$ {panelFrete.toLocaleString("pt-BR", {minimumFractionDigits:2})}</div>
            </div>
            <div className="text-center bg-blue-900 text-white p-2">
              <div className="text-[9px] font-bold tracking-widest uppercase opacity-70">Total Final</div>
              <div className="text-lg font-black mt-0.5">R$ {totalFinal.toLocaleString("pt-BR", {minimumFractionDigits:2})}</div>
            </div>
          </div>
        </div>
        {/* Terms */}
        {(proposal.paymentTerms || proposal.deliveryTerms) && (
          <div className="grid grid-cols-2 gap-6 mb-6 pt-4 border-t border-gray-200">
            {proposal.paymentTerms && (
              <div>
                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Condições de Pagamento</div>
                <div className="text-sm text-gray-700">{proposal.paymentTerms}</div>
              </div>
            )}
            {proposal.deliveryTerms && (
              <div>
                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Prazo de Entrega</div>
                <div className="text-sm text-gray-700">{proposal.deliveryTerms}</div>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {(proposal.notes || company?.notes) && (
          <div className="mb-6 pt-4 border-t border-gray-200">
            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Observações</div>
            <div className="text-xs text-gray-600 whitespace-pre-line">
              {proposal.notes || company?.notes}
            </div>
          </div>
        )}

        {/* Declarações selecionadas */}
        {selectedDeclarations.length > 0 && (
          <div className="mb-6 pt-4 border-t border-gray-200">
            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3">Declarações</div>
            <div className="space-y-3">
              {(declaracaoTemplates ?? []).filter((d: any) => selectedDeclarations.includes(d.id)).map((d: any) => (
                <div key={d.id} className="border border-gray-200 p-4">
                  <div className="text-xs font-bold text-gray-900 mb-1">{d.title}</div>
                  <div className="text-xs text-gray-600 whitespace-pre-line">{d.content}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dados da Empresa — Rodapé Fixo */}
        <div className="mt-8 pt-6 border-t-2 border-gray-900">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-2">Empresa</div>
              <div className="text-sm font-black text-gray-900">S2 ESTRATÉGIA E GESTÃO LTDA</div>
              <div className="text-xs text-gray-600 mt-0.5">CNPJ: 12.537.474/0001-12</div>
              <div className="text-xs text-gray-600">Rua 1 de Janeiro, 415 — Betim/MG</div>
              <div className="text-xs text-gray-600">CEP 32685-066</div>
            </div>
            <div>
              <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-2">Contato</div>
              <div className="text-xs text-gray-600">Tel/WhatsApp: (31) 99907-4546</div>
              <div className="text-xs text-gray-600">E-mail: adm@vetmg.com.br</div>
            </div>
            <div>
              <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-2">Dados Bancários</div>
              <div className="text-xs text-gray-600">Banco do Brasil</div>
              <div className="text-xs text-gray-600">Agência: 750-1</div>
              <div className="text-xs text-gray-600">Conta Corrente: 126941-0</div>
            </div>
          </div>
          {/* Assinatura */}
          <div className="mt-8 flex justify-end print:mt-12">
            <div className="text-center">
              <div className="w-56 border-t border-gray-400 pt-2">
                <div className="text-xs font-semibold text-gray-700">S2 Estratégia e Gestão Ltda</div>
                <div className="text-[10px] text-gray-400">CNPJ: 12.537.474/0001-12</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Painel de Declarações (fora da área de impressão) */}
      {showDeclaracoesPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:hidden">
          <div className="bg-white w-full max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-900 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <ScrollText size={16} className="text-blue-800" />
                <div>
                  <h2 className="text-base font-black text-gray-900">Declarações da Proposta</h2>
                  <p className="text-[10px] text-gray-400 mt-0.5">Selecionadas serão anexadas ao final do PDF</p>
                </div>
              </div>
              <button onClick={() => setShowDeclaracoesPanel(false)} className="text-gray-400 hover:text-gray-900 p-1">
                <X size={16} />
              </button>
            </div>
            {/* Select All / Clear All */}
            {(declaracaoTemplates ?? []).length > 0 && (
              <div className="px-6 py-2 border-b border-gray-100 flex gap-3">
                <button
                  onClick={() => setSelectedDeclarations((declaracaoTemplates ?? []).map((d: any) => d.id))}
                  className="text-xs text-blue-800 font-bold hover:underline"
                >
                  Selecionar todas
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setSelectedDeclarations([])}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Limpar seleção
                </button>
              </div>
            )}
            {/* List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {(declaracaoTemplates ?? []).length === 0 ? (
                <div className="text-center py-8">
                  <ScrollText size={32} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-sm text-gray-500">Nenhum template de declaração cadastrado.</p>                </div>
              ) : (
                (declaracaoTemplates ?? []).map((d: any) => (
                  <label key={d.id} className={`flex items-start gap-3 p-4 border-2 cursor-pointer transition-colors ${
                    selectedDeclarations.includes(d.id)
                      ? 'border-blue-800 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}>
                    <input
                      type="checkbox"
                      checked={selectedDeclarations.includes(d.id)}
                      onChange={() => toggleDeclaracao(d.id)}
                      className="mt-0.5 accent-blue-800"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900">{d.title}</div>
                      <div className="text-xs text-gray-500 mt-1 line-clamp-3 whitespace-pre-line">{d.content}</div>
                    </div>
                    {selectedDeclarations.includes(d.id) && (
                      <span className="text-[9px] font-black text-blue-800 bg-blue-100 px-1.5 py-0.5 self-start flex-shrink-0">INCLUSA</span>
                    )}
                  </label>
                ))
              )}
            </div>
            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <span className="text-xs font-bold text-gray-700">{selectedDeclarations.length}</span>
                <span className="text-xs text-gray-500"> declaração(ões) selecionada(s)</span>
                {selectedDeclarations.length > 0 && (
                  <div className="text-[10px] text-blue-800 mt-0.5">Serão incluídas no PDF como páginas separadas</div>
                )}
              </div>
              <button
                onClick={() => setShowDeclaracoesPanel(false)}
                className="px-6 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-blue-800 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Item Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:hidden">
          <div className="bg-white w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-900 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-800" />
                <h2 className="text-base font-black text-gray-900">Adicionar Item Manual</h2>
              </div>
              <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-gray-900 p-1">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmitManual} className="p-6 space-y-4">
              {/* Nome do produto */}
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Nome do Produto *</label>
                <input
                  type="text"
                  value={manualForm.productName}
                  onChange={(e) => setManualForm((f) => ({ ...f, productName: e.target.value }))}
                  placeholder="Ex: Amoxicilina 500mg"
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  autoFocus
                />
              </div>
              {/* Grid 2 colunas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Princípio Ativo</label>
                  <input
                    type="text"
                    value={manualForm.activeIngredient}
                    onChange={(e) => setManualForm((f) => ({ ...f, activeIngredient: e.target.value }))}
                    placeholder="Ex: Amoxicilina"
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Fabricante</label>
                  <input
                    type="text"
                    value={manualForm.manufacturer}
                    onChange={(e) => setManualForm((f) => ({ ...f, manufacturer: e.target.value }))}
                    placeholder="Ex: EMS"
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Concentração</label>
                  <input
                    type="text"
                    value={manualForm.concentration}
                    onChange={(e) => setManualForm((f) => ({ ...f, concentration: e.target.value }))}
                    placeholder="Ex: 500mg"
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Apresentação</label>
                  <input
                    type="text"
                    value={manualForm.presentation}
                    onChange={(e) => setManualForm((f) => ({ ...f, presentation: e.target.value }))}
                    placeholder="Ex: Cápsula, Frasco 100mL"
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Unidade</label>
                  <input
                    type="text"
                    value={manualForm.unit}
                    onChange={(e) => setManualForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="Ex: UN, CX, KG"
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Fornecedor</label>
                  <input
                    type="text"
                    value={manualForm.supplierName}
                    onChange={(e) => setManualForm((f) => ({ ...f, supplierName: e.target.value }))}
                    placeholder="Nome do fornecedor"
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Registro MAPA/ANVISA</label>
                  <input
                    type="text"
                    value={manualForm.registroMapa}
                    onChange={(e) => setManualForm((f) => ({ ...f, registroMapa: e.target.value }))}
                    placeholder="Ex: PA 0012345/2019"
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Preço Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualForm.unitPrice}
                    onChange={(e) => setManualForm((f) => ({ ...f, unitPrice: e.target.value }))}
                    placeholder="0,00"
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    value={manualForm.quantity}
                    onChange={(e) => setManualForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
              </div>
              {/* Observações */}
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Observações</label>
                <textarea
                  value={manualForm.notes}
                  onChange={(e) => setManualForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Informações adicionais sobre o item..."
                  rows={2}
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none"
                />
              </div>
              {/* Preview do total */}
              {manualForm.unitPrice && manualForm.quantity && (
                <div className="bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Total do Item</span>
                  <span className="text-base font-black text-blue-800">
                    R$ {(parseFloat(manualForm.unitPrice || "0") * (parseInt(manualForm.quantity) || 1)).toFixed(2).replace(".", ",")}
                  </span>
                </div>
              )}
              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowManualModal(false); setManualForm(emptyManualForm); }}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 hover:border-gray-900 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={addManualItem.isPending}
                  className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-50"
                >
                  <Plus size={14} />
                  {addManualItem.isPending ? "Adicionando..." : "Adicionar à Proposta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cheaper Similar Alert Modal (item manual) */}
      {similarAlert && (
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
                  <span className="font-black">{similarAlert.similars[0].savingPct}% menos</span>. Deseja substituir o item recém-adicionado?
                </p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {/* Original */}
              <div className="border border-gray-200 p-3">
                <div className="text-[9px] font-bold tracking-widest uppercase text-gray-400 mb-1">Item adicionado</div>
                <p className="text-sm font-semibold text-gray-900">{similarAlert.originalName}</p>
                {similarAlert.originalSupplier && <p className="text-xs text-gray-500">{similarAlert.originalSupplier}</p>}
                <p className="text-base font-black text-gray-900 mt-1">
                  R$ {similarAlert.originalPrice ? parseFloat(similarAlert.originalPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—"}
                </p>
              </div>
              {/* Similars */}
              <div className="space-y-2">
                {similarAlert.similars.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      if (similarAlert.addedItemId) {
                        updateItem.mutate({
                          id: similarAlert.addedItemId,
                          productName: s.name,
                          activeIngredient: s.activeIngredient ?? null,
                          manufacturer: s.manufacturer ?? null,
                          concentration: s.concentration ?? null,
                          presentation: s.presentation ?? null,
                          unit: s.unit ?? null,
                          supplierName: s.supplierName ?? null,
                          unitPrice: s.price ?? null,
                        });
                      }
                      setSimilarAlert(null);
                      toast.success(`Item substituído por ${s.name}`);
                    }}
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
                onClick={() => setSimilarAlert(null)}
                className="flex-1 border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-900 transition-colors"
              >
                Manter original
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Envio por E-mail */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Enviar Proposta por E-mail</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">Abre seu cliente de e-mail com os campos pré-preenchidos</p>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-gray-900">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-500 block mb-1">Destinatário (Para)</label>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="email@orgao.gov.br"
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-500 block mb-1">Assunto</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-500 block mb-1">Corpo do E-mail</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={6}
                  className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none font-mono"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-700">
                <strong>Importante:</strong> Baixe o PDF da proposta antes de enviar e anexe-o manualmente no seu cliente de e-mail.
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-300 hover:border-gray-900 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const mailto = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
                  window.open(mailto, "_blank");
                  setShowEmailModal(false);
                  toast.success("Cliente de e-mail aberto!");
                }}
                className="px-4 py-2 text-xs font-bold bg-blue-800 text-white hover:bg-blue-900 transition-colors flex items-center gap-2"
              >
                <Mail size={12} />
                Abrir no Cliente de E-mail
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Parcelamento ao Marcar como Entregue */}
      {showInstallmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-md shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-900">Marcar como Entregue — Parcelamento</h3>
              <button onClick={() => setShowInstallmentModal(false)} className="text-gray-400 hover:text-gray-900"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-gray-600">
                A proposta será marcada como <strong>Entregue</strong> e uma entrada de receita será criada automaticamente no financeiro.
              </p>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Número de Parcelas</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={installmentForm.nInstallments}
                  onChange={(e) => setInstallmentForm((f) => ({ ...f, nInstallments: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                />
                {installmentForm.nInstallments > 1 && (
                  <p className="text-[11px] text-blue-700 mt-1">
                    {installmentForm.nInstallments}x de R$ {(totalGeral / installmentForm.nInstallments).toFixed(2)} (total: R$ {totalGeral.toFixed(2)})
                  </p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1">Vencimento da 1ª Parcela</label>
                <input
                  type="date"
                  value={installmentForm.firstDueDate}
                  onChange={(e) => setInstallmentForm((f) => ({ ...f, firstDueDate: e.target.value }))}
                  className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setShowInstallmentModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-300 hover:border-gray-900"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelivery}
                disabled={advanceStatusMutation.isPending || updateProposal.isPending}
                className="px-4 py-2 text-xs font-bold bg-green-700 text-white hover:bg-green-800 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {advanceStatusMutation.isPending ? "Salvando..." : `Confirmar Entrega${installmentForm.nInstallments > 1 ? ` (${installmentForm.nInstallments}x)` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .proposal-print, .proposal-print * { visibility: visible; }
          .proposal-print { position: absolute; left: 0; top: 0; width: 100%; border: none !important; padding: 20px !important; }
          .print\\:hidden { display: none !important; }
          .print\\:mt-16 { margin-top: 4rem !important; }
        }
      `}</style>
    </div>
  );
}

