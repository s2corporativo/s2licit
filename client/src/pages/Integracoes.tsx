import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AiKeysForm } from "@/components/AiKeysForm";
import { EmailConfigSection } from "@/components/EmailConfigSection";
import {
  PlugZap,
  MessageCircle,
  Loader2,
  Save,
  Bot,
  Landmark,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
  Clock3,
  SlidersHorizontal,
  Globe2,
} from "lucide-react";

/**
 * Central de Integrações: credenciais e parâmetros operacionais administráveis
 * sem editar secrets no GitHub e sem reiniciar o servidor. Segredos ficam
 * criptografados e nunca retornam ao navegador.
 */
export default function Integracoes() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <PlugZap className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Central de Integrações</h1>
          <p className="text-sm text-gray-500">
            Configure APIs, comunicação, fontes públicas e automações diretamente no S2. As alterações passam a valer
            em runtime, sem editar o repositório nem reiniciar o servidor.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-gray-400 mb-6">
        <ShieldCheck className="w-3.5 h-3.5" />
        Valores sensíveis são criptografados (AES-256-GCM) e nunca retornam ao navegador.
        “Restaurar padrão” remove apenas o override da interface e volta à configuração da instalação.
      </div>

      <AiKeysForm />
      <RuntimeIntegrationsSection />
      <EmailConfigSection />

      <div className="mt-10 border-t border-gray-100 pt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500 mb-3">
          Credenciais específicas
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          <Link
            href="/scraper-fornecedores"
            className="flex items-center justify-between border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-sm font-semibold text-gray-800">Logins de fornecedores</div>
                <div className="text-[11px] text-gray-400">
                  E-mail e senha de cada portal de fornecedor (captura de preços)
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
          <Link
            href="/portais-licitacao"
            className="flex items-center justify-between border border-gray-200 rounded-xl p-4 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Landmark className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-sm font-semibold text-gray-800">Portais de licitação</div>
                <div className="text-[11px] text-gray-400">
                  Logins de ComprasNet, PNCP, Licitações-e e afins
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function RuntimeIntegrationsSection() {
  const configQuery = trpc.integrations.get.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<Record<string, string>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const data = configQuery.data;
    if (!data) return;
    setForm((previous) => {
      const next = { ...previous };
      for (const item of data) {
        if (dirtyKeys.has(item.chave)) continue;
        if (item.secreta) {
          delete next[item.chave];
          continue;
        }
        if (item.valor == null) delete next[item.chave];
        else next[item.chave] = item.valor;
      }
      return next;
    });
  }, [configQuery.data, dirtyKeys]);

  const showWarnings = (warnings: string[]) => {
    for (const warning of warnings) toast.warning("Configuração aplicada com aviso.", { description: warning });
  };

  const salvar = trpc.integrations.save.useMutation({
    onSuccess: (result, variables) => {
      const persistedKeys = Object.keys(variables);
      toast.success(
        result.applied === 1
          ? "1 configuração atualizada."
          : `${result.applied} configurações atualizadas.`,
      );
      showWarnings(result.warnings);
      setDirtyKeys((previous) => {
        const next = new Set(previous);
        for (const key of persistedKeys) next.delete(key);
        return next;
      });
      setForm((previous) => {
        const next = { ...previous };
        for (const item of configQuery.data ?? []) {
          if (item.secreta && persistedKeys.includes(item.chave)) delete next[item.chave];
        }
        return next;
      });
      void utils.integrations.get.invalidate();
      void utils.diagnostico.verificar.invalidate();
    },
    onError: (error) => toast.error("Não foi possível salvar.", { description: error.message }),
  });

  const remover = trpc.integrations.remove.useMutation({
    onSuccess: (result, variables) => {
      toast.success("Override removido; configuração padrão restaurada.");
      showWarnings(result.warnings);
      setDirtyKeys((previous) => {
        const next = new Set(previous);
        next.delete(variables.chave);
        return next;
      });
      setForm((previous) => {
        const next = { ...previous };
        delete next[variables.chave];
        return next;
      });
      void utils.integrations.get.invalidate();
      void utils.diagnostico.verificar.invalidate();
    },
    onError: (error) => toast.error("Não foi possível restaurar o padrão.", { description: error.message }),
  });

  const testar = trpc.integrations.testarWhatsapp.useMutation({
    onSuccess: (result) => {
      if (result.ok) toast.success("WhatsApp funcionando.", { description: result.detalhe });
      else toast.error("Teste do WhatsApp falhou.", { description: result.detalhe });
    },
    onError: (error) => toast.error("Falha ao testar.", { description: error.message }),
  });

  const data = configQuery.data;
  const grupoWhatsapp = useMemo(() => (data ?? []).filter((item) => item.grupo === "whatsapp"), [data]);
  const grupoGeral = useMemo(() => (data ?? []).filter((item) => item.grupo === "geral"), [data]);
  const grupoFontes = useMemo(() => (data ?? []).filter((item) => item.grupo === "fontes"), [data]);
  const grupoAutomacao = useMemo(() => (data ?? []).filter((item) => item.grupo === "automacao"), [data]);

  const origemLabel = (origem: string) =>
    origem === "interface"
      ? "override do S2"
      : origem === "ambiente"
        ? "padrão da instalação"
        : "padrão interno";

  const updateField = (key: string, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDirtyKeys((previous) => {
      const next = new Set(previous);
      next.add(key);
      return next;
    });
  };

  const groupKeys = (items: NonNullable<typeof data>) => items.map((item) => item.chave);
  const hasDirty = (keys: string[]) => keys.some((key) => dirtyKeys.has(key));

  const saveKeys = (keys: string[]) => {
    if (salvar.isPending) return;
    const payload: Record<string, string> = {};
    for (const key of keys) {
      if (!dirtyKeys.has(key)) continue;
      const value = form[key]?.trim() ?? "";
      if (value) payload[key] = value;
    }
    if (!Object.keys(payload).length) {
      toast.info("Nenhuma alteração preenchida para salvar.");
      return;
    }
    salvar.mutate(payload);
  };

  const campo = (item: NonNullable<typeof data>[number]) => (
    <div key={item.chave} className="rounded-lg border border-gray-100 p-3 bg-white">
      <div className="flex items-start justify-between gap-2 mb-1">
        <label
          htmlFor={`int-${item.chave}`}
          className="block text-[11px] font-bold uppercase tracking-wide text-gray-500"
        >
          {item.label}
          <span className="ml-2 font-normal normal-case text-gray-400">{origemLabel(item.origem)}</span>
          {dirtyKeys.has(item.chave) && (
            <span className="ml-2 font-semibold normal-case text-amber-600">não salvo</span>
          )}
        </label>
        {item.origem === "interface" && (
          <button
            type="button"
            onClick={() => remover.mutate({ chave: item.chave })}
            disabled={remover.isPending || salvar.isPending}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-blue-700 disabled:opacity-50"
            title="Remove o valor salvo no S2 e volta ao padrão da instalação"
          >
            <RotateCcw className="w-3 h-3" />
            Restaurar padrão
          </button>
        )}
      </div>
      <input
        id={`int-${item.chave}`}
        type={item.secreta ? "password" : "text"}
        value={form[item.chave] ?? ""}
        onChange={(event) => updateField(item.chave, event.target.value)}
        placeholder={item.secreta && item.temValor ? "•••••••• (deixe vazio para manter)" : ""}
        className={`w-full border px-3 py-2 text-sm focus:outline-none ${
          dirtyKeys.has(item.chave) ? "border-amber-300 focus:border-amber-500" : "border-gray-200 focus:border-gray-900"
        } ${item.secreta ? "font-mono" : ""}`}
      />
      <div className="mt-1 text-[10px] font-mono text-gray-300">{item.chave}</div>
    </div>
  );

  if (configQuery.isLoading) {
    return (
      <div className="border border-gray-200 p-4 mb-4 text-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <div className="border border-red-200 bg-red-50 p-4 mb-4 rounded-xl text-sm text-red-700">
        Não foi possível carregar a configuração de integrações: {configQuery.error.message}
      </div>
    );
  }

  const communicationKeys = groupKeys([...grupoWhatsapp, ...grupoGeral]);
  const sourceKeys = groupKeys(grupoFontes);
  const automationKeys = groupKeys(grupoAutomacao);

  return (
    <>
      <div className="border border-gray-200 p-4 mb-4 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Comunicação e parâmetros gerais
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mb-4">
          WhatsApp pode operar por Meta Cloud API ou webhook próprio. Somente campos efetivamente alterados são gravados como override.
        </p>
        <div className="grid md:grid-cols-2 gap-3">{grupoWhatsapp.map(campo)}</div>
        {grupoGeral.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Parâmetros gerais
            </div>
            <div className="grid md:grid-cols-2 gap-3">{grupoGeral.map(campo)}</div>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button
            type="button"
            onClick={() => testar.mutate()}
            disabled={testar.isPending}
            className="flex items-center gap-2 border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 rounded-lg"
          >
            {testar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            Testar WhatsApp
          </button>
          <button
            type="button"
            onClick={() => saveKeys(communicationKeys)}
            disabled={salvar.isPending || !hasDirty(communicationKeys)}
            className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50 rounded-lg"
          >
            {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar alterações
          </button>
        </div>
      </div>

      {grupoFontes.length > 0 && (
        <div className="border border-gray-200 p-4 mb-4 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <Globe2 className="w-4 h-4 text-indigo-600" />
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Fontes públicas institucionais
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mb-4">
            Uma única URL por fonte é reutilizada pelo Radar manual e pela captura automática. Altere apenas se o portal oficial mudar de endereço.
          </p>
          <div className="grid md:grid-cols-2 gap-3">{grupoFontes.map(campo)}</div>
          <div className="flex justify-end mt-5">
            <button
              type="button"
              onClick={() => saveKeys(sourceKeys)}
              disabled={salvar.isPending || !hasDirty(sourceKeys)}
              className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50 rounded-lg"
            >
              {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Aplicar fontes
            </button>
          </div>
        </div>
      )}

      <div className="border border-gray-200 p-4 mb-4 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <Clock3 className="w-4 h-4 text-blue-600" />
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Automação e agendamentos
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mb-4">
          Controle e reagende sincronizações, radar, scrapers, alertas e backup diretamente no S2.
          O novo plano é validado antes de substituir os agendamentos ativos.
        </p>
        <div className="grid md:grid-cols-2 gap-3">{grupoAutomacao.map(campo)}</div>
        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={() => saveKeys(automationKeys)}
            disabled={salvar.isPending || !hasDirty(automationKeys)}
            className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50 rounded-lg"
          >
            {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Aplicar agendamentos
          </button>
        </div>
      </div>
    </>
  );
}
