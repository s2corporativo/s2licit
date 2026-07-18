import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Search, Loader2, Package, Building2, KanbanSquare, MailCheck, FileText, Receipt, PackageCheck, ShieldCheck } from "lucide-react";

/** Busca Global: um campo, todas as entidades do sistema. */

const TIPO_META: Record<string, { label: string; icon: any; cor: string }> = {
  produto: { label: "Produto", icon: Package, cor: "text-blue-600" },
  fornecedor: { label: "Fornecedor", icon: Building2, cor: "text-purple-600" },
  oportunidade: { label: "Oportunidade", icon: KanbanSquare, cor: "text-amber-600" },
  cotacao: { label: "Cotação", icon: MailCheck, cor: "text-teal-600" },
  proposta: { label: "Proposta", icon: FileText, cor: "text-indigo-600" },
  nota_fiscal: { label: "Nota Fiscal", icon: Receipt, cor: "text-emerald-600" },
  pedido_compra: { label: "Pedido de Compra", icon: PackageCheck, cor: "text-orange-600" },
  certidao: { label: "Certidão", icon: ShieldCheck, cor: "text-green-600" },
};

export default function BuscaGlobal() {
  const [q, setQ] = useState("");
  const [buscado, setBuscado] = useState("");
  const busca = trpc.buscaGlobal.buscar.useQuery({ q: buscado }, { enabled: buscado.length >= 2 });

  const grupos = new Map<string, NonNullable<typeof busca.data>["resultados"]>();
  for (const r of busca.data?.resultados ?? []) {
    if (!grupos.has(r.tipo)) grupos.set(r.tipo, []);
    grupos.get(r.tipo)!.push(r);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Search className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Busca Global</h1>
          <p className="text-sm text-gray-500">Produtos, fornecedores, oportunidades, cotações, propostas, notas, pedidos e certidões</p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setBuscado(q.trim()); }}
        className="flex gap-2 mb-5"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          aria-label="Buscar em todo o sistema"
          placeholder="Digite órgão, produto, processo, NF, fornecedor…"
          className="flex-1 border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 outline-none"
        />
        <button type="submit" disabled={q.trim().length < 2}
          className="text-sm font-semibold px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded disabled:opacity-50">
          Buscar
        </button>
      </form>

      {busca.isLoading && buscado && (
        <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      )}

      {busca.data && buscado && (
        busca.data.total === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400 border border-dashed border-gray-200">
            Nada encontrado para “{buscado}”.
          </div>
        ) : (
          <div className="space-y-5">
            {[...grupos.entries()].map(([tipo, itens]) => {
              const meta = TIPO_META[tipo] ?? { label: tipo, icon: Search, cor: "text-gray-500" };
              const Icon = meta.icon;
              return (
                <section key={tipo}>
                  <h2 className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-1.5 ${meta.cor}`}>
                    <Icon className="w-3.5 h-3.5" /> {meta.label} ({itens.length})
                  </h2>
                  <div className="space-y-1">
                    {itens.map((r) => (
                      <Link key={`${r.tipo}-${r.id}`} href={r.link}
                        className="block border border-gray-200 hover:border-blue-300 hover:shadow-sm p-2.5 transition-all">
                        <div className="text-sm font-medium text-gray-900 truncate">{r.titulo}</div>
                        {r.subtitulo && <div className="text-[11px] text-gray-500 truncate">{r.subtitulo}</div>}
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
