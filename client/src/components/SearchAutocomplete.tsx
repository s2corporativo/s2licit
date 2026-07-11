import { trpc } from "@/lib/trpc";
import { ExternalLink, Package, Search, Tag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

type Suggestion = {
  id: number;
  label: string;
  sublabel: string;
  type: "product" | "activeIngredient" | "manufacturer";
  imageUrl: string | null;
  price: string | null;
  priceUnit: string | null;
  supplierName: string | null;
  categoryName: string | null;
  categoryColor: string | null;
};

interface SearchAutocompleteProps {
  placeholder?: string;
  onSelect?: (suggestion: Suggestion) => void;
  onSearch?: (query: string) => void;
  autoFocus?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function SearchAutocomplete({
  placeholder = "Buscar produto, princípio ativo, fabricante...",
  onSelect,
  onSearch,
  autoFocus = false,
  size = "md",
  className = "",
}: SearchAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: suggestions = [], isFetching } = trpc.products.autocomplete.useQuery(
    { query: debouncedQuery, limit: 12 },
    {
      enabled: debouncedQuery.trim().length >= 2,
      staleTime: 10_000,
    }
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setHighlighted(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter" && query.trim()) {
        handleSearch(query.trim());
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlighted >= 0 && suggestions[highlighted]) {
        handleSelect(suggestions[highlighted] as Suggestion);
      } else {
        handleSearch(query.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  const handleSelect = (s: Suggestion) => {
    setQuery(s.label);
    setOpen(false);
    setHighlighted(-1);
    if (onSelect) {
      onSelect(s);
    } else {
      // Default: navigate to search page
      if (s.type === "activeIngredient") {
        navigate(`/busca?q=${encodeURIComponent(s.label)}&type=activeIngredient`);
      } else {
        navigate(`/busca?q=${encodeURIComponent(s.label)}`);
      }
    }
  };

  const handleSearch = (q: string) => {
    setOpen(false);
    if (onSearch) {
      onSearch(q);
    } else {
      navigate(`/busca?q=${encodeURIComponent(q)}`);
    }
  };

  const clear = () => {
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const showDropdown = open && debouncedQuery.trim().length >= 2;
  const hasResults = suggestions.length > 0;

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3.5 text-base",
  };

  const iconSize = size === "lg" ? 16 : size === "sm" ? 12 : 14;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input */}
      <div
        className={`flex items-center gap-2 border-2 transition-colors ${
          open && debouncedQuery.length >= 2
            ? "border-gray-900"
            : "border-gray-200 hover:border-gray-400"
        } bg-white`}
      >
        <div className={`pl-3 text-gray-400 flex-shrink-0`}>
          {isFetching ? (
            <div
              className="border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin"
              style={{ width: iconSize, height: iconSize }}
            />
          ) : (
            <Search size={iconSize} />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`flex-1 outline-none bg-transparent text-gray-900 placeholder-gray-400 ${sizeClasses[size]}`}
        />
        {query && (
          <button
            onClick={clear}
            className="pr-3 text-gray-300 hover:text-gray-700 flex-shrink-0"
          >
            <X size={iconSize - 2} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border-2 border-t-0 border-gray-900 shadow-xl max-h-80 overflow-y-auto">
          {!hasResults ? (
            <div className="px-4 py-6 text-center">
              <Package size={20} className="text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">
                Nenhum produto encontrado para <strong>"{debouncedQuery}"</strong>
              </p>
            </div>
          ) : (
            <>
              {/* Group: Products */}
              {suggestions.filter((s) => s.type === "product").length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                    <span className="text-[9px] font-black tracking-widest uppercase text-gray-400">
                      Produtos
                    </span>
                  </div>
                  {suggestions
                    .filter((s) => s.type === "product")
                    .map((s, i) => {
                      const globalIdx = suggestions.indexOf(s);
                      return (
                        <button
                          key={`product-${s.id}-${i}`}
                          onMouseDown={(e) => { e.preventDefault(); handleSelect(s as Suggestion); }}
                          onMouseEnter={() => setHighlighted(globalIdx)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-gray-50 transition-colors ${
                            highlighted === globalIdx ? "bg-gray-900 text-white" : "hover:bg-gray-50"
                          }`}
                        >
                          {/* Thumbnail */}
                          <div className="w-8 h-8 flex-shrink-0 border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden">
                            {s.imageUrl ? (
                              <img
                                src={s.imageUrl}
                                alt=""
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <Package size={12} className={highlighted === globalIdx ? "text-gray-400" : "text-gray-300"} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-semibold truncate ${highlighted === globalIdx ? "text-white" : "text-gray-900"}`}>
                              {highlightMatch(s.label, debouncedQuery, highlighted === globalIdx)}
                            </div>
                            <div className={`text-[10px] truncate mt-0.5 ${highlighted === globalIdx ? "text-gray-300" : "text-gray-400"}`}>
                              {s.sublabel}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            {s.price && (
                              <div className={`text-xs font-bold ${highlighted === globalIdx ? "text-white" : "text-gray-900"}`}>
                                R$ {parseFloat(s.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                              </div>
                            )}
                            {s.categoryName && (
                              <div
                                className="text-[9px] font-semibold"
                                style={{ color: highlighted === globalIdx ? "#d1d5db" : (s.categoryColor ?? "#6b7280") }}
                              >
                                {s.categoryName}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </>
              )}

              {/* Group: Active Ingredients */}
              {suggestions.filter((s) => s.type === "activeIngredient").length > 0 && (
                <>
                  <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 border-t border-gray-200">
                    <span className="text-[9px] font-black tracking-widest uppercase text-gray-400">
                      Princípio Ativo
                    </span>
                  </div>
                  {suggestions
                    .filter((s) => s.type === "activeIngredient")
                    .map((s, i) => {
                      const globalIdx = suggestions.indexOf(s);
                      return (
                        <button
                          key={`ai-${i}`}
                          onMouseDown={(e) => { e.preventDefault(); handleSelect(s as Suggestion); }}
                          onMouseEnter={() => setHighlighted(globalIdx)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-gray-50 transition-colors ${
                            highlighted === globalIdx ? "bg-gray-900 text-white" : "hover:bg-gray-50"
                          }`}
                        >
                          <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center ${highlighted === globalIdx ? "bg-gray-700" : "bg-blue-50"}`}>
                            <Tag size={12} className={highlighted === globalIdx ? "text-gray-300" : "text-blue-800"} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-semibold truncate ${highlighted === globalIdx ? "text-white" : "text-gray-900"}`}>
                              {highlightMatch(s.label, debouncedQuery, highlighted === globalIdx)}
                            </div>
                            <div className={`text-[10px] ${highlighted === globalIdx ? "text-gray-300" : "text-gray-400"}`}>
                              Buscar por princípio ativo
                            </div>
                          </div>
                          <ExternalLink size={10} className={highlighted === globalIdx ? "text-gray-400" : "text-gray-300"} />
                        </button>
                      );
                    })}
                </>
              )}

              {/* Footer: search all */}
              <button
                onMouseDown={(e) => { e.preventDefault(); handleSearch(debouncedQuery); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-gray-50 hover:bg-gray-100 transition-colors border-t border-gray-200"
              >
                <Search size={11} className="text-gray-400" />
                <span className="text-xs text-gray-600">
                  Ver todos os resultados para <strong>"{debouncedQuery}"</strong>
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Highlight matching text in suggestion label
function highlightMatch(text: string, query: string, inverted: boolean) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className={`font-black ${inverted ? "text-blue-400" : "text-blue-800"}`}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </>
  );
}
