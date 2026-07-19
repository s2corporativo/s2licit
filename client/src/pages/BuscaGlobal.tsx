import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Search, Loader2, Package, Building2, KanbanSquare, MailCheck, FileText, Receipt, PackageCheck, ShieldCheck, Tags } from "lucide-react";
import BuscaRapida from "./BuscaRapida";

type SearchMode = "sistema" | "precos";

const TIPO_META: Record<string, { label: string; icon: React.ElementType; cor: string }> = {
  produto: { label: "Produto", icon: Package, cor: "text-blue-600" },
  fornecedor: { label: "Fornecedor", icon: Building2, cor: "text-purple-600" },
  oportunidade: { label: "Oportunidade", icon: KanbanSquare, cor: "text-amber-600" },
  cotacao: { label: "Cotação", icon: MailCheck, cor: "text-teal-600" },
  proposta: { label: "Proposta", icon: FileText, cor: "text-indigo-600" },
  nota_fiscal: { label: "Nota Fiscal", icon: Receipt, cor: "text-emerald-600" },
  pedido_compra: { label: "Pedido de Compra", icon: PackageCheck, cor: "text-orange-600" },
  certidao: { label: "Certidão", icon: ShieldCheck, cor: "text-green-600" },
};

function getInitialMode(): SearchMode {
  return new URLSearchParams(window.location.search).get("modo") === "precos" ? "precos" : "sistema";
}

export default function BuscaGlobal() {
  const [mode, setMode] = useState<SearchMode>(getInitialMode);
  const [q, setQ] = useState("");
  const [buscado, setBuscado] = useState("");
  const busca = trpc.buscaGlobal.buscar.useQuery({ q: buscado }, { enabled: mode === "sistema" && buscado.length >= 2 });

  const changeMode = (next: SearchMode) => {
    setMode(next);
    const url = new URL(window.location.href);
    if (next === "precos") url.searchParams.set("modo", "precos");
    else url.searchParams.delete("modo");
    window.history.replaceState({}, "", url);
  };

  if (mode === "precos") {
    return (
      <div>
        <SearchTabs mode={mode} onChange={changeMode} />
        <BuscaRapida />
      </div>
    );
  }

  const grupos = new Map<string, NonNullable<typeof busca.data>["resultados"]>();
  for (const result of busca.data?.resultados ?? []) {
    if (!grupos.has(result.tipo)) grupos.set(result.tipo, []);
    grupos.get(result.tipo)!.push(result);
  }

  return (
    <div>
      <SearchTabs mode={mode} onChange={changeMode} />
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Search className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Busca em todo o sistema</h1>
            <p className="text-sm text-gray-500">Produtos, fornecedores, oportunidades, propostas, notas, pedidos e certidões</p>
          </div>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); setBuscado(q.trim()); }} className="flex gap-2 mb-5">
          <input value={q} onChange={(event) => setQ(event.target.value)} autoFocus aria-label="Buscar em todo o sistema" placeholder="Digite órgão, produto, processo, NF ou fornecedor…" className="flex-1 border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 outline-none" />
          <button type="submit" disabled={q.trim().length < 2} className="text-sm font-semibold px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50">Buscar</button>
        </form>

        {busca.isLoading && buscado && <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
        {busca.error && <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{busca.error.message}</div>}

        {busca.data && buscado && (busca.data.total === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400 border border-dashed border-gray-200">Nada encontrado para “{buscado}”.</div>
        ) : (
          <div className="space-y-5">
            {[...grupos.entries()].map(([tipo, itens]) => {
              const meta = TIPO_META[tipo] ?? { label: tipo, icon: Search, cor: "text-gray-500" };
              const Icon = meta.icon;
              return (
                <section key={tipo}>
                  <h2 className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-1.5 ${meta.cor}`}><Icon className="w-3.5 h-3.5" /> {meta.label} ({itens.length})</h2>
                  <div className="space-y-1">
                    {itens.map((result) => (
                      <Link key={`${result.tipo}-${result.id}`} href={result.link} className="block border border-gray-200 hover:border-blue-300 hover:shadow-sm p-2.5 transition-all">
                        <div className="text-sm font-medium text-gray-900 truncate">{result.titulo}</div>
                        {result.subtitulo && <div className="text-xs text-gray-500 truncate">{result.subtitulo}</div>}
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchTabs({ mode, onChange }: { mode: SearchMode; onChange: (mode: SearchMode) => void }) {
  return (
    <div className="mx-auto flex max-w-4xl gap-2 px-6 pt-6">
      <button onClick={() => onChange("sistema")} className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold ${mode === "sistema" ? "bg-blue-700 text-white" : "border border-gray-200 bg-white text-gray-600"}`}><Search className="h-4 w-4" /> Todo o sistema</button>
      <button onClick={() => onChange("precos")} className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold ${mode === "precos" ? "bg-blue-700 text-white" : "border border-gray-200 bg-white text-gray-600"}`}><Tags className="h-4 w-4" /> Produtos e menor preço</button>
    </div>
  );
}
