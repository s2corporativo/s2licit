import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ScrollText, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const PAGE = 50;

/** Trilha de auditoria (§18/§20) — somente admin. */
export default function Logs() {
  const [offset, setOffset] = useState(0);
  const [entity, setEntity] = useState("");
  const { data: rows = [], isLoading, isFetching } = trpc.audit.getLogs.useQuery(
    {
      limit: PAGE,
      offset,
      entity: entity || undefined,
    },
    { placeholderData: (prev) => prev }
  );

  const fmt = (d: unknown) => (d ? new Date(d as string).toLocaleString("pt-BR") : "—");

  const exportCsv = () => {
    const header = ["data", "usuarioId", "acao", "entidade", "entidadeId", "origem", "resumo", "ip"];
    const linhas = rows.map((r) => [
      fmt(r.createdAt), r.userId ?? "", r.action, r.entity, r.entityId ?? "", r.origin,
      (r.summary ?? "").replace(/"/g, '""'), (r as { ipAddress?: string }).ipAddress ?? "",
    ]);
    const csv = [header, ...linhas].map((l) => l.map((c) => `"${String(c)}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gray-900 flex items-center justify-center"><ScrollText size={20} className="text-white" /></div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Logs de auditoria</h1>
            <p className="text-sm text-gray-500">Acessos e alterações registrados no sistema.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={entity}
            onChange={(e) => { setEntity(e.target.value); setOffset(0); }}
            placeholder="Filtrar por entidade (ex.: auth, user)"
            className="border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 w-56"
          />
          <button onClick={exportCsv} disabled={rows.length === 0}
            className="flex items-center gap-2 border border-gray-300 px-3 py-2 text-sm font-semibold hover:border-gray-900 disabled:opacity-50">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="bg-gray-900 text-white text-left text-[10px] uppercase tracking-widest">
                  <th className="px-3 py-2 w-40">Data</th>
                  <th className="px-3 py-2 w-16">Usuário</th>
                  <th className="px-3 py-2">Ação</th>
                  <th className="px-3 py-2">Entidade</th>
                  <th className="px-3 py-2">Origem</th>
                  <th className="px-3 py-2">Resumo</th>
                  <th className="px-3 py-2 w-32">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Nenhum registro.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap tabular-nums">{fmt(r.createdAt)}</td>
                    <td className="px-3 py-2 text-gray-600">{r.userId ?? "—"}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{r.action}</td>
                    <td className="px-3 py-2 text-gray-700">{r.entity}{r.entityId ? ` #${r.entityId}` : ""}</td>
                    <td className="px-3 py-2 text-gray-600">{r.origin}</td>
                    <td className="px-3 py-2 text-gray-700">{r.summary ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-500 tabular-nums">{(r as { ipAddress?: string }).ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
            <span>{isFetching ? "Atualizando…" : `Mostrando ${rows.length} registro(s)`}</span>
            <div className="flex items-center gap-2">
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}
                className="flex items-center gap-1 border border-gray-300 px-2 py-1 hover:border-gray-900 disabled:opacity-40">
                <ChevronLeft size={14} /> Anterior
              </button>
              <button disabled={rows.length < PAGE} onClick={() => setOffset(offset + PAGE)}
                className="flex items-center gap-1 border border-gray-300 px-2 py-1 hover:border-gray-900 disabled:opacity-40">
                Próxima <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
