import { useEffect, useState } from "react";
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
            Configure APIs, comunicação e automações diretamente no S2. As alterações passam a valer
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

  useEffect(() => {
    const data = configQuery.data;
    if (!data) return;
    const next: Record<string, string> = {};
    for (const item of data) {
      if (!item.secreta && item.valor != null) next[item.chave] = item.valor;
    }
    setForm((prev) => ({ ...next, ...prev }));
  }, [configQuery.data]);

  const salvar = trpc.integrations.save.useMutation({
    onSuccess: () => {
      toast.success("Integrações atualizadas e agendamentos recarregados.");
      setForm((prev) => {
        const next = { ...prev };
        for (const item of configQuery.data ?? []) {
          if (item.secreta) delete next[item.chave];
        }
        return next;
      });
      utils.integrations.get.invalidate();
    },
    onError: (error) => toast.error("Não foi possível salvar.", { description: error.message }),
  });

  const remover = trpc.integrations.remove.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Override removido; configuração padrão restaurada.");
      setForm((prev) => {
        const next = { ...prev };
        delete next[variables.chave];
        return next;
      });
      utils.integrations.get.invalidate();
    },
    onError: (error) => toast.error("Não foi possível restaurar o padrão.", { description: error.message }),
  });

  const testar = trpc.integrations.testarWhatsapp.useMutation({
    onSuccess: (res) => {
      if (res.ok) toast.success("WhatsApp funcionando.", { description: res.detalhe });
      else toast.error("Teste do WhatsApp falhou.", { description: res.detalhe });
    },
    onError: (error) => toast.error("Falha ao testar.", { description: error.message }),
  });

  const data = configQuery.data;
  const grupoWhatsapp = (data ?? []).filter((item) => item.grupo === "whatsapp");
  const grupoGeral = (data ?? []).filter((item) => item.grupo === "geral");
  const grupoAutomacao = (data ?? []).filter((item) => item.grupo === "automacao");

  const origemLabel = (origem: string) =>
    origem === "interface"
      ? "override do S2"
      : origem === "ambiente"
        ? "padrão da instalação"
        : "não configurado";

  const campo = (item: NonNullable<typeof data>[number]) => (
    <div key={item.chave} className="rounded-lg border border-gray-100 p-3 bg-white">
      <div className="flex items-start justify-between gap-2 mb-1">
        <label
          htmlFor={`int-${item.chave}`}
          className="block text-[11px] font-bold uppercase tracking-wide text-gray-500"
        >
          {item.label}
          <span className="ml-2 font-normal normal-case text-gray-400">{origemLabel(item.origem)}</span>
        </label>
        {item.origem === "interface" && (
          <button
            type="button"
            onClick={() => remover.mutate({ chave: item.chave })}
            disabled={remover.isPending}
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
        onChange={(event) => setForm((prev) => ({ ...prev, [item.chave]: event.target.value }))}
        placeholder={item.secreta && item.temValor ? "•••••••• (deixe vazio para manter)" : ""}
        className={`w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 ${item.secreta ? "font-mono" : ""}`}
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
          WhatsApp pode operar por Meta Cloud API ou webhook próprio. Parâmetros gerais são usados
          por custos e fontes auxiliares.
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
            className="flex items-center gap-2 border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {testar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            Testar WhatsApp
          </button>
          <button
            type="button"
            onClick={() => salvar.mutate(form)}
            disabled={salvar.isPending}
            className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50"
          >
            {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>

      <div className="border border-gray-200 p-4 mb-4 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <Clock3 className="w-4 h-4 text-blue-600" />
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Automação e agendamentos
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mb-4">
          Controle e reagende sincronizações, radar, scrapers, alertas e backup diretamente no S2.
          Ao salvar, o scheduler é recarregado em runtime; não é necessário redeploy.
        </p>
        <div className="grid md:grid-cols-2 gap-3">{grupoAutomacao.map(campo)}</div>
        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={() => salvar.mutate(form)}
            disabled={salvar.isPending}
            className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50"
          >
            {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Aplicar agendamentos
          </button>
        </div>
      </div>
    </>
  );
}
