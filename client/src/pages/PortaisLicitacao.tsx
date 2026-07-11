import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import { KeyRound, ExternalLink, Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function PortaisLicitacao() {
  const isAdmin = usePermission("admin");
  const utils = trpc.useUtils();
  const portaisQuery = trpc.portalCredentials.portais.useQuery();
  const listQuery = trpc.portalCredentials.list.useQuery();

  const [form, setForm] = useState({ portal: "", apelido: "", usuario: "", senha: "", cnpj: "", loginUrl: "" });

  const salvar = trpc.portalCredentials.salvar.useMutation({
    onSuccess: () => {
      toast.success("Credencial salva com segurança.");
      setForm({ portal: "", apelido: "", usuario: "", senha: "", cnpj: "", loginUrl: "" });
      utils.portalCredentials.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const remover = trpc.portalCredentials.remover.useMutation({
    onSuccess: () => { toast.success("Credencial removida."); utils.portalCredentials.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const portalInfo = (p: string) => portaisQuery.data?.find((x) => x.portal === p);

  const abrirPortal = (cred: { portal: string; loginUrl: string | null; usuario: string }) => {
    const url = cred.loginUrl || portalInfo(cred.portal)?.loginUrl;
    if (!url) { toast.error("Portal sem URL de login."); return; }
    navigator.clipboard?.writeText(cred.usuario).catch(() => {});
    toast.success("Usuário copiado. Abrindo o portal…");
    window.open(url, "_blank", "noopener");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <KeyRound className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portais de Licitação</h1>
          <p className="text-sm text-gray-500">Cofre de acessos (senha criptografada) — Funarbe, Fundep, COPASA, Compras MG e outros</p>
        </div>
      </div>

      <div className="flex items-start gap-2 border border-blue-200 bg-blue-50 p-3 my-4 text-sm text-blue-800">
        <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" />
        <div>
          As senhas ficam <strong>criptografadas</strong> e nunca aparecem na tela. "Abrir portal" copia seu
          usuário e abre a página de login numa nova aba. O envio automático de propostas roda no modo
          <strong> semi-automático</strong> (o robô loga e preenche; você confere e envia).
        </div>
      </div>

      {isAdmin && (
        <div className="border border-gray-200 p-4 mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Adicionar acesso</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select value={form.portal} onChange={(e) => setForm({ ...form, portal: e.target.value })} className="border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecione o portal…</option>
              {portaisQuery.data?.map((p) => <option key={p.portal} value={p.portal}>{p.nome}</option>)}
            </select>
            <input value={form.apelido} onChange={(e) => setForm({ ...form, apelido: e.target.value })} placeholder="Apelido (opcional)" className="border border-gray-300 px-3 py-2 text-sm" />
            <input value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} placeholder="Usuário / CNPJ / login" className="border border-gray-300 px-3 py-2 text-sm" />
            <input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder="Senha" className="border border-gray-300 px-3 py-2 text-sm" autoComplete="new-password" />
            <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="CNPJ (opcional)" className="border border-gray-300 px-3 py-2 text-sm" />
            <input value={form.loginUrl} onChange={(e) => setForm({ ...form, loginUrl: e.target.value })} placeholder="URL de login (só se diferente do padrão)" className="border border-gray-300 px-3 py-2 text-sm" />
          </div>
          {form.portal && portalInfo(form.portal)?.notas && (
            <p className="text-xs text-gray-400 mt-2">{portalInfo(form.portal)?.notas}</p>
          )}
          <button
            onClick={() => {
              if (!form.portal || !form.usuario || !form.senha) { toast.error("Portal, usuário e senha são obrigatórios."); return; }
              salvar.mutate({ portal: form.portal, apelido: form.apelido || undefined, usuario: form.usuario, senha: form.senha, cnpj: form.cnpj || undefined, loginUrl: form.loginUrl || undefined });
            }}
            disabled={salvar.isPending}
            className="mt-3 flex items-center gap-1 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 disabled:opacity-60"
          >
            {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Salvar acesso
          </button>
        </div>
      )}

      <div className="border border-gray-200">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-500">Acessos salvos</div>
        {listQuery.isLoading ? (
          <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : listQuery.data && listQuery.data.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-bold">Portal</th>
                <th className="text-left px-4 py-2 font-bold">Usuário</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {listQuery.data.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-800">{c.nomePortal}</div>
                    {c.apelido && <div className="text-[10px] text-gray-400">{c.apelido}</div>}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{c.usuario}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => abrirPortal(c)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 mr-3">
                      <ExternalLink className="w-3.5 h-3.5" /> Abrir portal
                    </button>
                    {isAdmin && (
                      <button onClick={() => remover.mutate({ id: c.id })} className="text-gray-400 hover:text-red-600" title="Remover">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-gray-400">Nenhum acesso salvo ainda.</div>
        )}
      </div>
    </div>
  );
}
