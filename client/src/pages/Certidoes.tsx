import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import { ShieldCheck, AlertTriangle, XCircle, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

function diasAte(dataValidade: string): number {
  const ms = new Date(dataValidade).getTime() - Date.now();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export default function Certidoes() {
  const isAdmin = usePermission("admin");
  const utils = trpc.useUtils();
  const listQuery = trpc.certidoes.list.useQuery();
  const alertasQuery = trpc.certidoes.alertas.useQuery({ diasAlerta: 30 });

  const [form, setForm] = useState({ tipo: "", orgaoEmissor: "", numero: "", dataValidade: "" });
  const createMutation = trpc.certidoes.create.useMutation({
    onSuccess: () => {
      toast.success("Certidão cadastrada.");
      setForm({ tipo: "", orgaoEmissor: "", numero: "", dataValidade: "" });
      utils.certidoes.list.invalidate();
      utils.certidoes.alertas.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMutation = trpc.certidoes.remove.useMutation({
    onSuccess: () => { toast.success("Certidão removida."); utils.certidoes.list.invalidate(); utils.certidoes.alertas.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const alertas = alertasQuery.data;
  const totalAlertas = (alertas?.vencidas.length ?? 0) + (alertas?.vencendo.length ?? 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Certidões e Habilitação</h1>
          <p className="text-sm text-gray-500">Controle de validade das certidões da empresa</p>
        </div>
      </div>

      {totalAlertas > 0 && (
        <div className="mb-6 space-y-2">
          {alertas!.vencidas.map((c) => (
            <div key={`v-${c.id}`} className="flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
              <XCircle className="w-4 h-4 shrink-0" />
              <strong>{c.tipo}</strong> venceu em {new Date(c.dataValidade).toLocaleDateString("pt-BR")}.
            </div>
          ))}
          {alertas!.vencendo.map((c) => (
            <div key={`p-${c.id}`} className="flex items-center gap-2 border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <strong>{c.tipo}</strong> vence em {diasAte(c.dataValidade as unknown as string)} dia(s) ({new Date(c.dataValidade).toLocaleDateString("pt-BR")}).
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="mb-6 border border-gray-200 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Cadastrar certidão</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              placeholder="Tipo (ex: CND Federal)"
              className="border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            />
            <input
              value={form.orgaoEmissor}
              onChange={(e) => setForm({ ...form, orgaoEmissor: e.target.value })}
              placeholder="Órgão emissor"
              className="border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={form.dataValidade}
              onChange={(e) => setForm({ ...form, dataValidade: e.target.value })}
              className="border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={() => {
              if (!form.tipo || !form.dataValidade) { toast.error("Informe tipo e validade."); return; }
              createMutation.mutate({
                tipo: form.tipo,
                orgaoEmissor: form.orgaoEmissor || undefined,
                numero: form.numero || undefined,
                dataValidade: form.dataValidade,
              });
            }}
            disabled={createMutation.isPending}
            className="mt-3 flex items-center gap-1 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 disabled:opacity-60"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar
          </button>
        </div>
      )}

      <div className="border border-gray-200">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-500">
          Certidões cadastradas
        </div>
        {listQuery.isLoading ? (
          <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : listQuery.data && listQuery.data.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-bold">Tipo</th>
                <th className="text-left px-4 py-2 font-bold">Órgão</th>
                <th className="text-left px-4 py-2 font-bold">Validade</th>
                <th className="text-left px-4 py-2 font-bold">Situação</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listQuery.data.map((c) => {
                const dias = diasAte(c.dataValidade as unknown as string);
                const situacao = dias < 0 ? { label: "Vencida", cls: "text-red-700" } : dias <= 30 ? { label: `Vence em ${dias}d`, cls: "text-amber-700" } : { label: "Válida", cls: "text-green-700" };
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2 font-medium text-gray-800">{c.tipo}</td>
                    <td className="px-4 py-2 text-gray-600">{c.orgaoEmissor || "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{new Date(c.dataValidade).toLocaleDateString("pt-BR")}</td>
                    <td className={`px-4 py-2 font-semibold ${situacao.cls}`}>{situacao.label}</td>
                    <td className="px-4 py-2 text-right">
                      {isAdmin && (
                        <button onClick={() => removeMutation.mutate({ id: c.id })} className="text-gray-400 hover:text-red-600" title="Remover">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-gray-400">Nenhuma certidão cadastrada.</div>
        )}
      </div>
    </div>
  );
}
