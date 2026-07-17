import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserPlus, Trash2, KeyRound, Unlock, Loader2, ShieldCheck, Ban, Power } from "lucide-react";

const ROLES = ["viewer", "user", "editor", "admin"] as const;
const ROLE_LABEL: Record<string, string> = { viewer: "Visualizador", user: "Usuário", editor: "Editor", admin: "Administrador" };

/** Gestão de usuários e permissões (§20) — somente admin. */
export default function Usuarios() {
  const utils = trpc.useUtils();
  const { data: usuarios = [], isLoading } = trpc.users.list.useQuery();
  const [form, setForm] = useState<{ name: string; email: string; role: (typeof ROLES)[number]; password: string }>({
    name: "", email: "", role: "viewer", password: "",
  });

  const onOk = (msg: string) => async () => { toast.success(msg); await utils.users.list.invalidate(); };
  const onErr = (e: { message: string }) => toast.error(e.message);

  const createM = trpc.users.create.useMutation({ onSuccess: onOk("Usuário criado."), onError: onErr });
  const roleM = trpc.users.updateRole.useMutation({ onSuccess: onOk("Papel atualizado."), onError: onErr });
  const pwM = trpc.users.resetPassword.useMutation({ onSuccess: onOk("Senha redefinida."), onError: onErr });
  const unlockM = trpc.users.unlock.useMutation({ onSuccess: onOk("Conta desbloqueada."), onError: onErr });
  const disableM = trpc.users.setDisabled.useMutation({ onSuccess: onOk("Status da conta atualizado."), onError: onErr });
  const removeM = trpc.users.remove.useMutation({ onSuccess: onOk("Usuário removido."), onError: onErr });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createM.mutate(form, { onSuccess: () => setForm({ name: "", email: "", role: "viewer", password: "" }) });
  };

  const now = Date.now();

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 bg-gray-900 flex items-center justify-center"><ShieldCheck size={20} className="text-white" /></div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Usuários e permissões</h1>
          <p className="text-sm text-gray-500">Cadastro de acessos e papéis (Administrador, Editor, Usuário, Visualizador).</p>
        </div>
      </div>

      {/* Novo usuário */}
      <form onSubmit={submit} className="bg-white border border-gray-200 p-4 mb-6 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Nome</label>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-gray-900" />
        </div>
        <div className="md:col-span-1">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">E-mail</label>
          <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-gray-900" />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Papel</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as (typeof ROLES)[number] })}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-gray-900">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Senha inicial</label>
          <input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:border-gray-900" />
        </div>
        <button type="submit" disabled={createM.isPending}
          className="flex items-center justify-center gap-2 bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-800 disabled:opacity-60">
          {createM.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Criar
        </button>
      </form>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
      ) : (
        <div className="bg-white border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-gray-900 text-white text-left text-[10px] uppercase tracking-widest">
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2 w-40">Papel</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 w-40 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const locked = u.lockedUntil != null && new Date(u.lockedUntil).getTime() > now;
                return (
                  <tr key={u.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium text-gray-900">{u.email}</td>
                    <td className="px-3 py-2 text-gray-700">{u.name}</td>
                    <td className="px-3 py-2">
                      <select
                        value={u.role}
                        onChange={(e) => roleM.mutate({ id: u.id, role: e.target.value as (typeof ROLES)[number] })}
                        className="border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:border-gray-900"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.mfaEnabled && <span className="text-[9px] font-bold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">MFA</span>}
                        {locked && <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">Bloqueado</span>}
                        {u.disabled && <span className="text-[9px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">Desativado</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {locked && (
                          <button title="Desbloquear" onClick={() => unlockM.mutate({ id: u.id })}
                            className="border border-gray-300 p-1.5 hover:border-gray-900"><Unlock size={13} /></button>
                        )}
                        {u.disabled ? (
                          <button title="Reativar conta" onClick={() => disableM.mutate({ id: u.id, disabled: false })}
                            className="border border-green-200 text-green-700 p-1.5 hover:bg-green-50"><Power size={13} /></button>
                        ) : (
                          <button title="Desativar conta (revogar acesso)" onClick={() => {
                            if (window.confirm(`Desativar ${u.email}? O acesso será revogado (recomendado no lugar de remover).`)) disableM.mutate({ id: u.id, disabled: true });
                          }} className="border border-orange-200 text-orange-700 p-1.5 hover:bg-orange-50"><Ban size={13} /></button>
                        )}
                        <button title="Redefinir senha" onClick={() => {
                          const p = window.prompt(`Nova senha para ${u.email} (mín. 8 caracteres):`);
                          if (p && p.length >= 8) pwM.mutate({ id: u.id, password: p });
                          else if (p) toast.error("A senha deve ter ao menos 8 caracteres.");
                        }} className="border border-gray-300 p-1.5 hover:border-gray-900"><KeyRound size={13} /></button>
                        <button title="Remover" onClick={() => {
                          if (window.confirm(`Remover o usuário ${u.email}?`)) removeM.mutate({ id: u.id });
                        }} className="border border-red-200 text-red-600 p-1.5 hover:bg-red-50"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
