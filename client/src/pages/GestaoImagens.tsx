import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Link2,
  Loader2,
  Package,
  Search,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Image Preview with fallback ─────────────────────────────────────────────
function ProductImage({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [error, setError] = useState(false);
  useEffect(() => setError(false), [src]);
  if (!src || error) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <Package size={14} className="text-gray-300" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`object-contain ${className}`}
      onError={() => setError(true)}
    />
  );
}

// ─── Tab: Por Nome ────────────────────────────────────────────────────────────
function TabPorNome() {
  const [imageUrl, setImageUrl] = useState("");
  const [nameTerm, setNameTerm] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (nameTerm.trim().length >= 2) {
      debounceRef.current = setTimeout(() => setSearchTerm(nameTerm.trim()), 400);
    } else {
      setSearchTerm("");
    }
  }, [nameTerm]);

  useEffect(() => setConfirmed(false), [imageUrl, nameTerm]);

  const { data: products = [], isFetching } = trpc.products.searchByName.useQuery(
    { nameTerm: searchTerm },
    { enabled: searchTerm.length >= 2 }
  );

  const utils = trpc.useUtils();
  const applyImage = trpc.products.applyImageByName.useMutation({
    onSuccess: (result) => {
      toast.success(`Imagem aplicada a ${result.updated} produto(s) com sucesso!`);
      utils.products.list.invalidate();
      utils.products.searchByName.invalidate();
      setConfirmed(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return url.startsWith("http://") || url.startsWith("https://");
    } catch {
      return false;
    }
  };

  const canApply = isValidUrl(imageUrl) && searchTerm.length >= 2 && products.length > 0;

  const handleApply = () => {
    if (!canApply) return;
    if (!confirmed) { setConfirmed(true); return; }
    applyImage.mutate({ nameTerm: searchTerm, imageUrl });
  };

  const withThisImage = products.filter((p) => p.imageUrl === imageUrl);
  const withOtherImage = products.filter((p) => p.imageUrl && p.imageUrl !== imageUrl);
  const withoutImage = products.filter((p) => !p.imageUrl);

  return (
    <div>
      {/* Input Panel */}
      <div className="border border-gray-200 p-6 mb-6 bg-white">
        <div className="grid grid-cols-1 gap-5">
          <div>
            <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1.5">URL da Imagem</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://exemplo.com/imagem-do-produto.jpg"
                  className="w-full border border-gray-200 pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-colors"
                />
              </div>
              {imageUrl && (
                <button onClick={() => setImageUrl("")} className="px-2 border border-gray-200 text-gray-400 hover:text-gray-900 hover:border-gray-900 transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Formatos suportados: JPG, PNG, WebP, SVG — a URL deve ser pública e acessível</div>
          </div>

          {imageUrl && isValidUrl(imageUrl) && (
            <div className="flex items-center gap-4 p-3 border border-blue-100 bg-blue-50">
              <div className="w-20 h-20 border border-blue-200 bg-white flex-shrink-0 overflow-hidden">
                <ProductImage src={imageUrl} alt="Preview" className="w-full h-full" />
              </div>
              <div>
                <div className="text-xs font-bold text-blue-800 mb-0.5">Preview da imagem</div>
                <div className="text-[10px] text-blue-600 break-all max-w-sm">{imageUrl}</div>
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-1.5">Nome do Produto (parcial)</label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={nameTerm}
                onChange={(e) => setNameTerm(e.target.value)}
                placeholder="Ex: Fusion, Ivermectina, Amoxicilina..."
                className="w-full border border-gray-200 pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
              {isFetching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Digite pelo menos 2 caracteres — o sistema encontra todos os produtos cujo nome contém esse texto</div>
          </div>
        </div>
      </div>

      {searchTerm.length >= 2 && (
        <div className="mb-6">
          {products.length === 0 && !isFetching ? (
            <div className="border border-gray-200 p-8 text-center">
              <AlertCircle size={24} className="text-gray-300 mx-auto mb-2" />
              <div className="text-sm text-gray-500">Nenhum produto encontrado com "{searchTerm}"</div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-900">{products.length} produto{products.length !== 1 ? "s" : ""} encontrado{products.length !== 1 ? "s" : ""}</span>
                  {withThisImage.length > 0 && <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-green-100 text-green-700">{withThisImage.length} já com esta imagem</span>}
                  {withOtherImage.length > 0 && <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-yellow-100 text-yellow-700">{withOtherImage.length} com outra imagem</span>}
                  {withoutImage.length > 0 && <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-gray-100 text-gray-600">{withoutImage.length} sem imagem</span>}
                </div>
              </div>
              <div className="border border-gray-200 overflow-hidden mb-4">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-widest text-[10px] text-gray-400 w-16">Atual</th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-widest text-[10px] text-gray-400">Nome do Produto</th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-widest text-[10px] text-gray-400">Fabricante</th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-widest text-[10px] text-gray-400 w-20">Nova</th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-widest text-[10px] text-gray-400 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const hasThisImage = p.imageUrl === imageUrl;
                      const hasOtherImage = p.imageUrl && p.imageUrl !== imageUrl;
                      return (
                        <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-2"><div className="w-10 h-10 border border-gray-100 bg-gray-50 overflow-hidden"><ProductImage src={p.imageUrl} alt={p.name} className="w-full h-full" /></div></td>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-gray-900 leading-tight">{p.name}</div>
                            {p.imageUrl && <div className="text-[10px] text-gray-400 truncate max-w-xs mt-0.5">{p.imageUrl}</div>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{p.manufacturer ?? "—"}</td>
                          <td className="px-3 py-2">
                            {isValidUrl(imageUrl) ? (
                              <div className="w-10 h-10 border border-blue-200 bg-blue-50 overflow-hidden"><ProductImage src={imageUrl} alt="Nova" className="w-full h-full" /></div>
                            ) : (
                              <div className="w-10 h-10 border border-gray-100 bg-gray-50 flex items-center justify-center"><ImageIcon size={12} className="text-gray-300" /></div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {hasThisImage ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-green-700"><CheckCircle2 size={10} /> Já aplicada</span>
                            ) : hasOtherImage ? (
                              <span className="text-[10px] font-bold text-yellow-700">Substituir</span>
                            ) : (
                              <span className="text-[10px] font-bold text-blue-700">Adicionar</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {canApply && (
                <div className={`p-4 border ${confirmed ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-gray-50"}`}>
                  {confirmed ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-bold text-blue-800 mb-0.5">Confirmar aplicação em {products.length} produto{products.length !== 1 ? "s" : ""}?</div>
                        <div className="text-[10px] text-blue-800">Esta ação irá sobrescrever imagens existentes nos produtos com "{searchTerm}"</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmed(false)} className="px-4 py-2 border border-gray-300 text-sm font-semibold text-gray-700 hover:border-gray-900 transition-colors">Cancelar</button>
                        <button onClick={handleApply} disabled={applyImage.isPending} className="flex items-center gap-2 px-5 py-2 bg-blue-800 text-white text-sm font-bold hover:bg-blue-900 transition-colors disabled:opacity-50">
                          {applyImage.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                          {applyImage.isPending ? "Aplicando..." : `Confirmar — ${products.length} produto${products.length !== 1 ? "s" : ""}`}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-700">Aplicar imagem a <strong>{products.length} produto{products.length !== 1 ? "s" : ""}</strong> com nome contendo <strong>"{searchTerm}"</strong></div>
                      <button onClick={handleApply} disabled={!isValidUrl(imageUrl)} className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-50">
                        <ImageIcon size={13} />Aplicar Imagem
                      </button>
                    </div>
                  )}
                </div>
              )}
              {!isValidUrl(imageUrl) && products.length > 0 && (
                <div className="p-3 border border-yellow-200 bg-yellow-50 text-xs text-yellow-800">
                  <AlertCircle size={12} className="inline mr-1" />Cole uma URL válida de imagem no campo acima para poder aplicar.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {searchTerm.length < 2 && (
        <div className="border-2 border-dashed border-gray-200 p-12 text-center">
          <ImageIcon size={32} className="text-gray-200 mx-auto mb-3" />
          <div className="text-sm font-semibold text-gray-500 mb-1">Como usar</div>
          <div className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            1. Cole a URL da imagem do produto no campo acima<br />
            2. Digite parte do nome do produto (ex: "Fusion", "Ivermec")<br />
            3. Veja a lista de produtos encontrados com preview<br />
            4. Clique em "Aplicar Imagem" para atualizar todos de uma vez
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Auto-Link por URL ───────────────────────────────────────────────────
type AutoLinkRow = {
  imageUrl: string;
  tokens: string[];
  matchedProductId: number | null;
  matchedProductName: string | null;
  similarity: number;
};

function TabAutoLink() {
  const [urlsText, setUrlsText] = useState("");
  const [results, setResults] = useState<AutoLinkRow[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState(false);
  const [fromImport, setFromImport] = useState(false);

  const utils = trpc.useUtils();

  // Auto-preenche URLs vindas da importação de planilha
  useEffect(() => {
    const stored = sessionStorage.getItem("autoLinkUrls");
    if (stored && stored.trim()) {
      setUrlsText(stored.trim());
      setFromImport(true);
      sessionStorage.removeItem("autoLinkUrls");
    }
  }, []);

  const autoLink = trpc.products.autoLinkImageUrls.useMutation({
    onSuccess: (data) => {
      setResults(data);
      // Pre-select all with a match >= 70%
      const preSelected = new Set(
        data
          .filter((r) => r.matchedProductId !== null && r.similarity >= 0.7)
          .map((r) => r.imageUrl)
      );
      setSelectedIds(preSelected);
      setApplied(false);
    },
    onError: (e) => toast.error("Erro ao analisar URLs: " + e.message),
  });

  const bulkApply = trpc.products.bulkApplyImageUrls.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.updated} imagem(ns) vinculada(s) com sucesso!`);
      utils.products.list.invalidate();
      setApplied(true);
    },
    onError: (e) => toast.error("Erro ao aplicar imagens: " + e.message),
  });

  const handleAnalyze = () => {
    const urls = urlsText
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http://") || u.startsWith("https://"));
    if (urls.length === 0) {
      toast.error("Nenhuma URL válida encontrada. Certifique-se de que cada URL começa com http:// ou https://");
      return;
    }
    if (urls.length > 500) {
      toast.error("Máximo de 500 URLs por vez.");
      return;
    }
    autoLink.mutate({ imageUrls: urls });
  };

  const handleApplySelected = () => {
    if (!results) return;
    const items = results
      .filter((r) => r.matchedProductId !== null && selectedIds.has(r.imageUrl))
      .map((r) => ({ productId: r.matchedProductId!, imageUrl: r.imageUrl }));
    if (items.length === 0) {
      toast.error("Nenhum item selecionado para aplicar.");
      return;
    }
    bulkApply.mutate({ items });
  };

  const toggleRow = (url: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const matchedCount = results?.filter((r) => r.matchedProductId !== null).length ?? 0;
  const unmatchedCount = results?.filter((r) => r.matchedProductId === null).length ?? 0;
  const selectedCount = results?.filter((r) => r.matchedProductId !== null && selectedIds.has(r.imageUrl)).length ?? 0;

  return (
    <div>
      {/* Banner: URLs da importação */}
      {fromImport && (
        <div className="border border-green-200 bg-green-50 p-4 mb-4 flex items-center gap-3 text-xs text-green-800">
          <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
          <div>
            <span className="font-bold">URLs detectadas na planilha importada!</span>{" "}
            As URLs de imagem da sua planilha foram preenchidas automaticamente abaixo. Clique em "Analisar URLs" para vincular aos produtos.
          </div>
          <button onClick={() => setFromImport(false)} className="ml-auto text-green-600 hover:text-green-800"><X size={13} /></button>
        </div>
      )}

      {/* Instructions */}
      <div className="border border-blue-100 bg-blue-50 p-4 mb-6 text-xs text-blue-800 leading-relaxed">
        <div className="font-bold mb-1">Como funciona o Auto-Link</div>
        O sistema extrai o nome do produto a partir do caminho da URL (ex: <code className="bg-blue-100 px-1">/produtos/ivermectina-1-pour-on-5l.jpg</code> → tokens "ivermectina", "1", "pour", "on", "5l") e usa similaridade fuzzy para encontrar o produto correspondente no banco. Produtos com similaridade ≥ 70% são pré-selecionados.
      </div>

      {/* URL Input */}
      <div className="border border-gray-200 p-6 mb-6 bg-white">
        <label className="text-[10px] font-bold tracking-widest uppercase text-gray-400 block mb-2">
          Lista de URLs de Imagem (uma por linha)
        </label>
        <textarea
          value={urlsText}
          onChange={(e) => { setUrlsText(e.target.value); setResults(null); }}
          placeholder={"https://cdn.site.com/produtos/ivermectina-1-pour-on-5l.jpg\nhttps://cdn.site.com/produtos/amoxicilina-50mg-comprimidos.jpg\nhttps://cdn.site.com/produtos/fusion-cl-50-5l.jpg"}
          rows={8}
          className="w-full border border-gray-200 px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-gray-900 transition-colors resize-y"
        />
        <div className="flex items-center justify-between mt-3">
          <div className="text-[10px] text-gray-400">
            {urlsText.split("\n").filter((u) => u.trim().startsWith("http")).length} URL(s) detectada(s) — máximo 500 por vez
          </div>
          <button
            onClick={handleAnalyze}
            disabled={autoLink.isPending || urlsText.trim().length === 0}
            className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {autoLink.isPending ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {autoLink.isPending ? "Analisando..." : "Analisar URLs"}
          </button>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div>
          {/* Summary */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5 bg-green-100 border border-green-200 px-3 py-1.5 text-xs font-bold text-green-700">
              <CheckCircle2 size={12} />{matchedCount} produto{matchedCount !== 1 ? "s" : ""} identificado{matchedCount !== 1 ? "s" : ""}
            </div>
            {unmatchedCount > 0 && (
              <div className="flex items-center gap-1.5 bg-orange-100 border border-orange-200 px-3 py-1.5 text-xs font-bold text-orange-700">
                <AlertCircle size={12} />{unmatchedCount} sem correspondência
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-blue-100 border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-700">
              {selectedCount} selecionado{selectedCount !== 1 ? "s" : ""} para aplicar
            </div>
          </div>

          {/* Table */}
          <div className="border border-gray-200 overflow-hidden mb-4">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selectedCount === matchedCount && matchedCount > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(results.filter((r) => r.matchedProductId !== null).map((r) => r.imageUrl)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      className="w-3.5 h-3.5"
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-widest text-[10px] text-gray-400 w-16">Imagem</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-widest text-[10px] text-gray-400">URL / Tokens Extraídos</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-widest text-[10px] text-gray-400">Produto Correspondente</th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-widest text-[10px] text-gray-400 w-24">Similaridade</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => {
                  const isSelected = selectedIds.has(row.imageUrl);
                  const hasMatch = row.matchedProductId !== null;
                  return (
                    <tr
                      key={row.imageUrl || `autolink-row-${i}`}
                      className={`border-t border-gray-100 ${hasMatch ? (isSelected ? "bg-green-50" : "hover:bg-gray-50") : "bg-orange-50 opacity-60"}`}
                    >
                      <td className="px-3 py-2">
                        {hasMatch && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRow(row.imageUrl)}
                            className="w-3.5 h-3.5"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="w-10 h-10 border border-gray-100 bg-gray-50 overflow-hidden">
                          <ProductImage src={row.imageUrl} alt="img" className="w-full h-full" />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-[10px] text-gray-400 truncate max-w-xs mb-1">{row.imageUrl}</div>
                        <div className="flex flex-wrap gap-1">
                          {row.tokens.map((t, ti) => (
                            <span key={`${t}-${ti}`} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-mono rounded">{t}</span>
                          ))}
                          {row.tokens.length === 0 && <span className="text-[10px] text-blue-700">Nenhum token extraído</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {hasMatch ? (
                          <div className="font-semibold text-gray-900">{row.matchedProductName}</div>
                        ) : (
                          <span className="text-[10px] text-orange-600 font-bold">Sem correspondência</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.similarity > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${row.similarity >= 0.85 ? "bg-green-500" : row.similarity >= 0.7 ? "bg-yellow-500" : "bg-red-400"}`}
                                style={{ width: `${Math.round(row.similarity * 100)}%` }}
                              />
                            </div>
                            <span className={`text-[10px] font-bold ${row.similarity >= 0.85 ? "text-green-700" : row.similarity >= 0.7 ? "text-yellow-700" : "text-blue-800"}`}>
                              {Math.round(row.similarity * 100)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Apply Button */}
          {!applied && selectedCount > 0 && (
            <div className="p-4 border border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Vincular <strong>{selectedCount} imagem{selectedCount !== 1 ? "ns" : ""}</strong> aos produtos correspondentes
              </div>
              <button
                onClick={handleApplySelected}
                disabled={bulkApply.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {bulkApply.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                {bulkApply.isPending ? "Aplicando..." : `Aplicar ${selectedCount} vínculo${selectedCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          )}

          {applied && (
            <div className="p-4 border border-green-200 bg-green-50 flex items-center gap-3">
              <CheckCircle2 size={16} className="text-green-600" />
              <div className="text-sm font-semibold text-green-800">Imagens vinculadas com sucesso! Os produtos foram atualizados.</div>
              <button onClick={() => { setResults(null); setUrlsText(""); setApplied(false); }} className="ml-auto text-xs text-green-700 underline hover:no-underline">
                Processar mais URLs
              </button>
            </div>
          )}

          {matchedCount === 0 && (
            <div className="p-6 border border-orange-200 bg-orange-50 text-center">
              <AlertCircle size={24} className="text-orange-400 mx-auto mb-2" />
              <div className="text-sm font-bold text-orange-800 mb-1">Nenhum produto identificado</div>
              <div className="text-xs text-orange-600">
                As URLs não contêm tokens suficientes para identificar produtos. Verifique se os nomes dos arquivos de imagem correspondem aos nomes dos produtos cadastrados.
              </div>
            </div>
          )}
        </div>
      )}

      {!results && !autoLink.isPending && (
        <div className="border-2 border-dashed border-gray-200 p-12 text-center">
          <Wand2 size={32} className="text-gray-200 mx-auto mb-3" />
          <div className="text-sm font-semibold text-gray-500 mb-1">Auto-Link Inteligente</div>
          <div className="text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
            Cole uma lista de URLs de imagem (uma por linha). O sistema extrai automaticamente o nome do produto a partir do caminho da URL e encontra o produto correspondente no banco usando similaridade fuzzy.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GestaoImagens() {
  const [activeTab, setActiveTab] = useState<"por-nome" | "auto-link">("por-nome");

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="w-6 h-1 bg-blue-800 mb-3" />
        <h1 className="text-3xl font-black tracking-tight text-gray-900">Gestão de Imagens</h1>
        <p className="text-sm text-gray-500 mt-1">
          Vincule imagens aos produtos por nome ou cole uma lista de URLs para vinculação automática.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("por-nome")}
          className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === "por-nome" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}
        >
          <Search size={13} className="inline mr-1.5 -mt-0.5" />
          Por Nome
        </button>
        <button
          onClick={() => setActiveTab("auto-link")}
          className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === "auto-link" ? "border-gray-900 text-gray-900" : "border-transparent text-gray-400 hover:text-gray-700"}`}
        >
          <Wand2 size={13} className="inline mr-1.5 -mt-0.5" />
          Auto-Link por URL
        </button>
      </div>

      {activeTab === "por-nome" ? <TabPorNome /> : <TabAutoLink />}
    </div>
  );
}
