import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Mail, PlugZap, RotateCcw, Save } from "lucide-react";

type EmailForm = {
  imapHost: string;
  imapPort: string;
  imapUser: string;
  imapPassword: string;
  imapTls: boolean;
  imapMailbox: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  smtpFrom: string;
};

type EmailFormKey = keyof EmailForm;

const INITIAL_FORM: EmailForm = {
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
};

export function EmailConfigSection() {
  const configQuery = trpc.emailConfig.get.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<EmailForm>(INITIAL_FORM);
  const [dirtyKeys, setDirtyKeys] = useState<Set<EmailFormKey>>(() => new Set());

  useEffect(() => {
    const data = configQuery.data;
    if (!data) return;
    setForm((previous) => ({
      imapHost: dirtyKeys.has("imapHost") ? previous.imapHost : data.imap.host,
      imapPort: dirtyKeys.has("imapPort") ? previous.imapPort : String(data.imap.port || 993),
      imapUser: dirtyKeys.has("imapUser") ? previous.imapUser : data.imap.user,
      imapPassword: previous.imapPassword,
      imapTls: dirtyKeys.has("imapTls") ? previous.imapTls : data.imap.tls,
      imapMailbox: dirtyKeys.has("imapMailbox") ? previous.imapMailbox : data.imap.mailbox || "INBOX",
      smtpHost: dirtyKeys.has("smtpHost") ? previous.smtpHost : data.smtp.host,
      smtpPort: dirtyKeys.has("smtpPort") ? previous.smtpPort : String(data.smtp.port || 587),
      smtpUser: dirtyKeys.has("smtpUser") ? previous.smtpUser : data.smtp.user,
      smtpPassword: previous.smtpPassword,
      smtpSecure: dirtyKeys.has("smtpSecure") ? previous.smtpSecure : data.smtp.secure,
      smtpFrom: dirtyKeys.has("smtpFrom") ? previous.smtpFrom : data.smtp.from,
    }));
  }, [configQuery.data, dirtyKeys]);

  const salvar = trpc.emailConfig.save.useMutation({
    onSuccess: () => {
      toast.success("Configuração de e-mail aplicada em runtime.");
      setForm((previous) => ({ ...previous, imapPassword: "", smtpPassword: "" }));
      setDirtyKeys(new Set());
      void utils.emailConfig.get.invalidate();
      void utils.diagnostico.verificar.invalidate();
    },
    onError: (error) =>
      toast.error("Não foi possível salvar a configuração de e-mail.", { description: error.message }),
  });

  const resetar = trpc.emailConfig.reset.useMutation({
    onSuccess: () => {
      toast.success("Overrides de e-mail removidos; padrão da instalação restaurado.");
      setForm((previous) => ({ ...previous, imapPassword: "", smtpPassword: "" }));
      setDirtyKeys(new Set());
      void utils.emailConfig.get.invalidate();
      void utils.diagnostico.verificar.invalidate();
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

  const set = <K extends EmailFormKey>(key: K, value: EmailForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDirtyKeys((previous) => {
      const next = new Set(previous);
      next.add(key);
      return next;
    });
  };

  const parsePort = (value: string, label: string): number => {
    if (!/^\d+$/.test(value)) throw new Error(`${label}: informe uma porta numérica.`);
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
      throw new Error(`${label}: porta deve estar entre 1 e 65535.`);
    }
    return parsed;
  };

  const handleSalvar = () => {
    if (!dirtyKeys.size || salvar.isPending) return;
    try {
      const payload: {
        imapHost?: string;
        imapPort?: number;
        imapUser?: string;
        imapPassword?: string;
        imapTls?: boolean;
        imapMailbox?: string;
        smtpHost?: string;
        smtpPort?: number;
        smtpUser?: string;
        smtpPassword?: string;
        smtpSecure?: boolean;
        smtpFrom?: string;
      } = {};

      for (const key of dirtyKeys) {
        switch (key) {
          case "imapPort":
            payload.imapPort = parsePort(form.imapPort, "IMAP");
            break;
          case "smtpPort":
            payload.smtpPort = parsePort(form.smtpPort, "SMTP");
            break;
          case "imapTls":
            payload.imapTls = form.imapTls;
            break;
          case "smtpSecure":
            payload.smtpSecure = form.smtpSecure;
            break;
          case "imapPassword":
            if (form.imapPassword.trim()) payload.imapPassword = form.imapPassword;
            break;
          case "smtpPassword":
            if (form.smtpPassword.trim()) payload.smtpPassword = form.smtpPassword;
            break;
          case "imapHost":
          case "imapUser":
          case "imapMailbox":
          case "smtpHost":
          case "smtpUser":
          case "smtpFrom": {
            const value = form[key].trim();
            if (!value) throw new Error(`${key}: o campo alterado não pode ficar vazio. Use “Restaurar padrão” para remover overrides.`);
            payload[key] = value;
            break;
          }
        }
      }

      if (!Object.keys(payload).length) {
        toast.info("Nenhuma alteração preenchida para salvar.");
        return;
      }
      salvar.mutate(payload);
    } catch (error) {
      toast.error("Revise a configuração.", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
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
    key: EmailFormKey,
    value: string,
    options?: { type?: string; placeholder?: string; hint?: string },
  ) => (
    <div>
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
        {label}
        {dirtyKeys.has(key) && <span className="ml-2 normal-case text-amber-600">não salvo</span>}
      </label>
      <input
        id={id}
        type={options?.type ?? "text"}
        value={value}
        onChange={(event) => set(key, event.target.value as EmailForm[typeof key])}
        placeholder={options?.placeholder}
        className={`w-full border px-3 py-2 text-sm focus:outline-none transition-colors ${
          dirtyKeys.has(key) ? "border-amber-300 focus:border-amber-500" : "border-gray-200 focus:border-gray-900"
        }`}
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
            disabled={resetar.isPending || salvar.isPending}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-blue-700 disabled:opacity-50"
          >
            {resetar.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Restaurar padrão da instalação
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-5">
        Conta usada para receber pedidos de cotação e enviar propostas/alertas. IMAP e SMTP são persistidos como grupos credenciais coerentes; somente campos efetivamente alterados são enviados ao servidor.
      </p>

      {configQuery.isLoading ? (
        <div className="p-6 text-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : configQuery.isError ? (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
          Não foi possível carregar a configuração de e-mail: {configQuery.error.message}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-3 border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800">
              Recebimento (IMAP)
              {data && <span className="ml-2 text-[10px] font-normal text-gray-400">{origemLabel(data.imap.origem)}</span>}
            </div>
            {campo("imap-host", "Servidor", "imapHost", form.imapHost, { placeholder: "imap.gmail.com" })}
            <div className="grid grid-cols-2 gap-3">
              {campo("imap-port", "Porta", "imapPort", form.imapPort, { placeholder: "993" })}
              <div>
                <label htmlFor="imap-tls" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                  Conexão segura (TLS)
                  {dirtyKeys.has("imapTls") && <span className="ml-2 normal-case text-amber-600">não salvo</span>}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-2 cursor-pointer">
                  <input id="imap-tls" type="checkbox" checked={form.imapTls} onChange={(event) => set("imapTls", event.target.checked)} />
                  Ativada
                </label>
              </div>
            </div>
            {campo("imap-user", "Usuário (e-mail)", "imapUser", form.imapUser, { placeholder: "conta@empresa.com.br" })}
            {campo("imap-pass", "Senha", "imapPassword", form.imapPassword, {
              type: "password",
              placeholder: data?.imap.hasPassword ? "•••••••• (deixe vazio para manter)" : "",
              hint: "Ao criar o primeiro override, a senha efetiva atual é preservada com criptografia se não for alterada.",
            })}
            {campo("imap-mailbox", "Pasta", "imapMailbox", form.imapMailbox, { placeholder: "INBOX" })}
            <button
              type="button"
              onClick={() => testar.mutate({ tipo: "imap" })}
              disabled={testar.isPending || salvar.isPending}
              className="flex items-center gap-2 border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
            >
              {testar.isPending ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
              Testar configuração salva
            </button>
          </div>

          <div className="space-y-3 border border-gray-100 rounded-xl p-4">
            <div className="text-sm font-bold text-gray-800">
              Envio (SMTP)
              {data && <span className="ml-2 text-[10px] font-normal text-gray-400">{origemLabel(data.smtp.origem)}</span>}
            </div>
            {campo("smtp-host", "Servidor", "smtpHost", form.smtpHost, { placeholder: "smtp.gmail.com" })}
            <div className="grid grid-cols-2 gap-3">
              {campo("smtp-port", "Porta", "smtpPort", form.smtpPort, { placeholder: "587" })}
              <div>
                <label htmlFor="smtp-secure" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                  SSL direto
                  {dirtyKeys.has("smtpSecure") && <span className="ml-2 normal-case text-amber-600">não salvo</span>}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-2 cursor-pointer">
                  <input id="smtp-secure" type="checkbox" checked={form.smtpSecure} onChange={(event) => set("smtpSecure", event.target.checked)} />
                  Porta 465
                </label>
              </div>
            </div>
            {campo("smtp-user", "Usuário (e-mail)", "smtpUser", form.smtpUser, { placeholder: "conta@empresa.com.br" })}
            {campo("smtp-pass", "Senha", "smtpPassword", form.smtpPassword, {
              type: "password",
              placeholder: data?.smtp.hasPassword ? "•••••••• (deixe vazio para manter)" : "",
              hint: "Ao criar o primeiro override, a senha efetiva atual é preservada com criptografia se não for alterada.",
            })}
            {campo("smtp-from", "Remetente (De:)", "smtpFrom", form.smtpFrom, { placeholder: "cotacoes@empresa.com.br" })}
            <button
              type="button"
              onClick={() => testar.mutate({ tipo: "smtp" })}
              disabled={testar.isPending || salvar.isPending}
              className="flex items-center gap-2 border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
            >
              {testar.isPending ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
              Testar configuração salva
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-6">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvar.isPending || dirtyKeys.size === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white text-sm font-bold hover:bg-blue-800 transition-colors disabled:opacity-50 rounded-lg"
        >
          {salvar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {salvar.isPending ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}
