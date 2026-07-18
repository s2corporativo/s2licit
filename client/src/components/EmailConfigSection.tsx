import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Mail, PlugZap, Save } from "lucide-react";

/**
 * Configuração de e-mail (IMAP para receber cotações, SMTP para enviar)
 * pela interface, com teste de conexão — antes só era possível por
 * variável de ambiente na VPS.
 */
export function EmailConfigSection() {
  const configQuery = trpc.emailConfig.get.useQuery();
  const utils = trpc.useUtils();

  const [form, setForm] = useState({
    imapHost: "",
    imapPort: "993",
    imapUser: "",
    imapPassword: "",
    imapTls: true,
    imapMailbox: "INBOX",
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPassword: "",
    smtpSecure: false,
    smtpFrom: "",
  });

  useEffect(() => {
    const d = configQuery.data;
    if (!d) return;
    setForm((prev) => ({
      ...prev,
      imapHost: d.imap.host,
      imapPort: String(d.imap.port || 993),
      imapUser: d.imap.user,
      imapTls: d.imap.tls,
      imapMailbox: d.imap.mailbox || "INBOX",
      smtpHost: d.smtp.host,
      smtpPort: String(d.smtp.port || 587),
      smtpUser: d.smtp.user,
      smtpSecure: d.smtp.secure,
      smtpFrom: d.smtp.from,
    }));
  }, [configQuery.data]);

  const salvar = trpc.emailConfig.save.useMutation({
    onSuccess: () => {
      toast.success("Configuração de e-mail salva.");
      setForm((p) => ({ ...p, imapPassword: "", smtpPassword: "" }));
      utils.emailConfig.get.invalidate();
    },
    onError: (e) => toast.error("Não foi possível salvar a configuração de e-mail.", { description: e.message }),
  });

  const testar = trpc.emailConfig.testar.useMutation({
    onSuccess: (res, vars) => {
      const nome = vars.tipo === "imap" ? "recebimento (IMAP)" : "envio (SMTP)";
      if (res.ok) toast.success(`Conexão de ${nome} funcionando.`, { description: res.detalhe });
      else toast.error(`Conexão de ${nome} falhou.`, { description: res.detalhe });
    },
    onError: (e) => toast.error("Falha ao testar a conexão.", { description: e.message }),
  });

  const set = (k: keyof typeof form, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const handleSalvar = () => {
    salvar.mutate({
      imapHost: form.imapHost || null,
      imapPort: form.imapPort ? parseInt(form.imapPort) : null,
      imapUser: form.imapUser || null,
      imapPassword: form.imapPassword || null,
      imapTls: form.imapTls,
      imapMailbox: form.imapMailbox || null,
      smtpHost: form.smtpHost || null,
      smtpPort: form.smtpPort ? parseInt(form.smtpPort) : null,
      smtpUser: form.smtpUser || null,
      smtpPassword: form.smtpPassword || null,
      smtpSecure: form.smtpSecure,
      smtpFrom: form.smtpFrom || null,
    });
  };

  const origemLabel = (o: string) =>
    o === "interface" ? "configurado por esta tela" : o === "ambiente" ? "configurado na instalação (.env)" : "não configurado";

  const d = configQuery.data;

  const campo = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { type?: string; placeholder?: string; hint?: string }
  ) => (
    <div>
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </label>
      <input
        id={id}
        type={opts?.type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={opts?.placeholder}
        className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 transition-colors"
      />
      {opts?.hint && <div className="text-[10px] text-gray-400 mt-0.5">{opts.hint}</div>}
    </div>
  );

  return (
    <div className="mt-10 border-t border-gray-100 pt-8">
      <div className="flex items-center gap-2 mb-1">
        <Mail size={16} className="text-blue-600" />
        <h2 className="text-base font-bold text-gray-900">E-mail do sistema</h2>
      </div>
      <p className="text-xs text-gray-500 mb-5">
        Conta usada para receber pedidos de cotação (recebimento) e enviar propostas e alertas
        (envio). Para Gmail, use uma senha de aplicativo. O que for salvo aqui tem prioridade
        sobre a configuração feita na instalação.
      </p>

      {configQuery.isLoading ? (
        <div className="p-6 text-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          {/* IMAP */}
          <div className="space-y-3">
            <div className="text-sm font-bold text-gray-800">
              Recebimento (IMAP)
              {d && <span className="ml-2 text-[10px] font-normal text-gray-400">{origemLabel(d.imap.origem)}</span>}
            </div>
            {campo("imap-host", "Servidor", form.imapHost, (v) => set("imapHost", v), { placeholder: "imap.gmail.com" })}
            <div className="grid grid-cols-2 gap-3">
              {campo("imap-port", "Porta", form.imapPort, (v) => set("imapPort", v), { placeholder: "993" })}
              <div>
                <label htmlFor="imap-tls" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                  Conexão segura (TLS)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-2 cursor-pointer">
                  <input
                    id="imap-tls"
                    type="checkbox"
                    checked={form.imapTls}
                    onChange={(e) => set("imapTls", e.target.checked)}
                  />
                  Ativada (recomendado)
                </label>
              </div>
            </div>
            {campo("imap-user", "Usuário (e-mail)", form.imapUser, (v) => set("imapUser", v), { placeholder: "conta@empresa.com.br" })}
            {campo("imap-pass", "Senha", form.imapPassword, (v) => set("imapPassword", v), {
              type: "password",
              placeholder: d?.imap.hasPassword ? "•••••••• (deixe vazio para manter)" : "",
              hint: "Guardada criptografada. Deixe em branco para manter a senha atual.",
            })}
            {campo("imap-mailbox", "Pasta", form.imapMailbox, (v) => set("imapMailbox", v), { placeholder: "INBOX" })}
            <button
              type="button"
              onClick={() => testar.mutate({ tipo: "imap" })}
              disabled={testar.isPending}
              className="flex items-center gap-2 border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {testar.isPending ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
              Testar recebimento
            </button>
          </div>

          {/* SMTP */}
          <div className="space-y-3">
            <div className="text-sm font-bold text-gray-800">
              Envio (SMTP)
              {d && <span className="ml-2 text-[10px] font-normal text-gray-400">{origemLabel(d.smtp.origem)}</span>}
            </div>
            {campo("smtp-host", "Servidor", form.smtpHost, (v) => set("smtpHost", v), { placeholder: "smtp.gmail.com" })}
            <div className="grid grid-cols-2 gap-3">
              {campo("smtp-port", "Porta", form.smtpPort, (v) => set("smtpPort", v), { placeholder: "587" })}
              <div>
                <label htmlFor="smtp-secure" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                  Conexão segura direta
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-2 cursor-pointer">
                  <input
                    id="smtp-secure"
                    type="checkbox"
                    checked={form.smtpSecure}
                    onChange={(e) => set("smtpSecure", e.target.checked)}
                  />
                  Porta 465 (SSL)
                </label>
              </div>
            </div>
            {campo("smtp-user", "Usuário (e-mail)", form.smtpUser, (v) => set("smtpUser", v), { placeholder: "conta@empresa.com.br" })}
            {campo("smtp-pass", "Senha", form.smtpPassword, (v) => set("smtpPassword", v), {
              type: "password",
              placeholder: d?.smtp.hasPassword ? "•••••••• (deixe vazio para manter)" : "",
              hint: "Guardada criptografada. Deixe em branco para manter a senha atual.",
            })}
            {campo("smtp-from", "Remetente (De:)", form.smtpFrom, (v) => set("smtpFrom", v), {
              placeholder: "cotacoes@empresa.com.br",
              hint: "Endereço que aparece como remetente dos e-mails enviados.",
            })}
            <button
              type="button"
              onClick={() => testar.mutate({ tipo: "smtp" })}
              disabled={testar.isPending}
              className="flex items-center gap-2 border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {testar.isPending ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
              Testar envio
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-6">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvar.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-50"
        >
          <Save size={14} />
          {salvar.isPending ? "Salvando..." : "Salvar e-mail"}
        </button>
      </div>
    </div>
  );
}
