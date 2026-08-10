import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Mail, PlugZap, RotateCcw, Save } from "lucide-react";

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
    const data = configQuery.data;
    if (!data) return;
    setForm((previous) => ({
      ...previous,
      imapHost: data.imap.host,
      imapPort: String(data.imap.port || 993),
      imapUser: data.imap.user,
      imapTls: data.imap.tls,
      imapMailbox: data.imap.mailbox || "INBOX",
      smtpHost: data.smtp.host,
      smtpPort: String(data.smtp.port || 587),
      smtpUser: data.smtp.user,
      smtpSecure: data.smtp.secure,
      smtpFrom: data.smtp.from,
    }));
  }, [configQuery.data]);

  const salvar = trpc.emailConfig.save.useMutation({
    onSuccess: () => {
      toast.success("Configuração de e-mail aplicada em runtime.");
      setForm((previous) => ({ ...previous, imapPassword: "", smtpPassword: "" }));
      utils.emailConfig.get.invalidate();
      utils.diagnostico.verificar.invalidate();
    },
    onError: (error) =>
      toast.error("Não foi possível salvar a configuração de e-mail.", { description: error.message }),
  });

  const resetar = trpc.emailConfig.reset.useMutation({
    onSuccess: () => {
      toast.success("Overrides de e-mail removidos; padrão da instalação restaurado.");
      setForm((previous) => ({ ...previous, imapPassword: "", smtpPassword: "" }));
      utils.emailConfig.get.invalidate();
      utils.diagnostico.verificar.invalidate();
    },
    onError: (error) => toast.error("Não foi possível restaurar o padrão.", { description: error.message }),
  });

  const testar = trpc.emailConfig.testar.useMutation({
    onSuccess: (response, variables) => {
      const name = variables.tipo === "imap" ? "recebimento (IMAP)" : "envio (SMTP)";
      if (response.ok) toast.success(`Conexão de ${name} funcionando.`, { description: response.detalhe });
      else toast.error(`Conexão de ${name} falhou.`, { description: response.detalhe });
    },
    onError: (error) => toast.error("Falha ao testar a conexão.", { description: error.message }),
  });

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const handleSalvar = () => {
    salvar.mutate({
      imapHost: form.imapHost || null,
      imapPort: form.imapPort ? Number.parseInt(form.imapPort, 10) : null,
      imapUser: form.imapUser || null,
      imapPassword: form.imapPassword || null,
      imapTls: form.imapTls,
      imapMailbox: form.imapMailbox || null,
      smtpHost: form.smtpHost || null,
      smtpPort: form.smtpPort ? Number.parseInt(form.smtpPort, 10) : null,
      smtpUser: form.smtpUser || null,
      smtpPassword: form.smtpPassword || null,
      smtpSecure: form.smtpSecure,
      smtpFrom: form.smtpFrom || null,
    });
  };

  const origemLabel = (origin: string) =>
    origin === "interface"
      ? "override do S2"
      : origin === "ambiente"
        ? "padrão da instalação"
        : "não configurado";

  const data = configQuery.data;
  const campo = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    options?: { type?: string; placeholder?: string; hint?: string },
  ) => (
    <div>
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </label>
      <input
        id={id}
        type={options?.type ?? "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={options?.placeholder}
        className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 transition-colors"
      />
      {options?.hint && <div className="text-[10px] text-gray-400 mt-0.5">{options.hint}</div>}
    </div>
  );

  return (
    <div className="mt-10 border-t border-gray-100 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-blue-600" />
          <h2 className="text-base font-bold text-gray-900">E-mail do sistema</h2>
        </div>
        {data?.hasInterfaceOverride && (
          <button
            type="button"
            onClick={() => resetar.mutate()}
            disabled={resetar.isPending}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-blue-700 disabled:opacity-50"
          >
            {resetar.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Restaurar padrão da instalação
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-5">
        Conta usada para receber pedidos de cotação e enviar propostas/alertas. O override salvo aqui
        entra em vigor sem reiniciar o servidor. Senhas permanecem criptografadas no banco.
      </p>

      {configQuery.isLoading ? (
        <div className="p-6 text-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-3 border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800">
              Recebimento (IMAP)
              {data && <span className="ml-2 text-[10px] font-normal text-gray-400">{origemLabel(data.imap.origem)}</span>}
            </div>
            {campo("imap-host", "Servidor", form.imapHost, (value) => set("imapHost", value), { placeholder: "imap.gmail.com" })}
            <div className="grid grid-cols-2 gap-3">
              {campo("imap-port", "Porta", form.imapPort, (value) => set("imapPort", value), { placeholder: "993" })}
              <div>
                <label htmlFor="imap-tls" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">Conexão segura (TLS)</label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-2 cursor-pointer">
                  <input id="imap-tls" type="checkbox" checked={form.imapTls} onChange={(event) => set("imapTls", event.target.checked)} />
                  Ativada
                </label>
              </div>
            </div>
            {campo("imap-user", "Usuário (e-mail)", form.imapUser, (value) => set("imapUser", value), { placeholder: "conta@empresa.com.br" })}
            {campo("imap-pass", "Senha", form.imapPassword, (value) => set("imapPassword", value), {
              type: "password",
              placeholder: data?.imap.hasPassword ? "•••••••• (deixe vazio para manter)" : "",
              hint: "Deixe em branco para manter a senha efetiva atual.",
            })}
            {campo("imap-mailbox", "Pasta", form.imapMailbox, (value) => set("imapMailbox", value), { placeholder: "INBOX" })}
            <button
              type="button"
              onClick={() => testar.mutate({ tipo: "imap" })}
              disabled={testar.isPending}
              className="flex items-center gap-2 border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
            >
              {testar.isPending ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
              Testar recebimento
            </button>
          </div>

          <div className="space-y-3 border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800">
              Envio (SMTP)
              {data && <span className="ml-2 text-[10px] font-normal text-gray-400">{origemLabel(data.smtp.origem)}</span>}
            </div>
            {campo("smtp-host", "Servidor", form.smtpHost, (value) => set("smtpHost", value), { placeholder: "smtp.gmail.com" })}
            <div className="grid grid-cols-2 gap-3">
              {campo("smtp-port", "Porta", form.smtpPort, (value) => set("smtpPort", value), { placeholder: "587" })}
              <div>
                <label htmlFor="smtp-secure" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">SSL direto</label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-2 cursor-pointer">
                  <input id="smtp-secure" type="checkbox" checked={form.smtpSecure} onChange={(event) => set("smtpSecure", event.target.checked)} />
                  Porta 465
                </label>
              </div>
            </div>
            {campo("smtp-user", "Usuário (e-mail)", form.smtpUser, (value) => set("smtpUser", value), { placeholder: "conta@empresa.com.br" })}
            {campo("smtp-pass", "Senha", form.smtpPassword, (value) => set("smtpPassword", value), {
              type: "password",
              placeholder: data?.smtp.hasPassword ? "•••••••• (deixe vazio para manter)" : "",
              hint: "Deixe em branco para manter a senha efetiva atual.",
            })}
            {campo("smtp-from", "Remetente (De:)", form.smtpFrom, (value) => set("smtpFrom", value), { placeholder: "cotacoes@empresa.com.br" })}
            <button
              type="button"
              onClick={() => testar.mutate({ tipo: "smtp" })}
              disabled={testar.isPending}
              className="flex items-center gap-2 border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
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
          className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-50 rounded-lg"
        >
          {salvar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {salvar.isPending ? "Salvando..." : "Salvar e-mail"}
        </button>
      </div>
    </div>
  );
}
