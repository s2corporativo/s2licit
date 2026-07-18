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
} from "lucide-react";

/**
 * Central de integrações: UMA tela para digitar chaves, senhas, logins e APIs.
 * Tudo fica criptografado no banco e é aplicado ao sistema inteiro na hora
 * (sem reiniciar). Credenciais por-fornecedor e por-portal têm telas próprias
 * (cada uma com seu cofre) — os atalhos levam até elas.
 */
export default function Integracoes() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <PlugZap className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Integrações e credenciais</h1>
          <p className="text-sm text-gray-500">
            Digite aqui as chaves, senhas e APIs do sistema. Ficam guardadas criptografadas e passam
            a valer imediatamente em todo o sistema — sem reiniciar nada.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-gray-400 mb-6">
        <ShieldCheck className="w-3.5 h-3.5" />
        Valores sensíveis são criptografados (AES-256) e nunca voltam para o navegador — a tela só
        mostra se há chave salva e a origem.
      </div>

      {/* IA */}
      <AiKeysForm />

      {/* WhatsApp + parâmetros gerais */}
      <WhatsappSection />

      {/* E-mail */}
      <EmailConfigSection />

      {/* Atalhos para credenciais específicas */}
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

function WhatsappSection() {
  const configQuery = trpc.integrations.get.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    const d = configQuery.data;
    if (!d) return;
    // Pré-preenche só os campos NÃO sensíveis que já têm valor
    const next: Record<string, string> = {};
    for (const item of d) {
      if (!item.secreta && item.valor != null) next[item.chave] = item.valor;
    }
    setForm((prev) => ({ ...next, ...prev }));
  }, [configQuery.data]);

  const salvar = trpc.integrations.save.useMutation({
    onSuccess: () => {
      toast.success("Credenciais de integração salvas. Já valem em todo o sistema.");
      // Limpa só os campos secretos digitados
      setForm((prev) => {
        const next = { ...prev };
        for (const item of configQuery.data ?? []) {
          if (item.secreta) delete next[item.chave];
        }
        return next;
      });
      utils.integrations.get.invalidate();
    },
    onError: (e) => toast.error("Não foi possível salvar.", { description: e.message }),
  });

  const testar = trpc.integrations.testarWhatsapp.useMutation({
    onSuccess: (res) => {
      if (res.ok) toast.success("WhatsApp funcionando.", { description: res.detalhe });
      else toast.error("Teste do WhatsApp falhou.", { description: res.detalhe });
    },
    onError: (e) => toast.error("Falha ao testar.", { description: e.message }),
  });

  const d = configQuery.data;
  const grupoWhatsapp = (d ?? []).filter((i) => i.grupo === "whatsapp");
  const grupoGeral = (d ?? []).filter((i) => i.grupo === "geral");

  const origemLabel = (o: string) =>
    o === "interface" ? "salvo nesta tela" : o === "ambiente" ? "configurado na instalação (.env)" : "não configurado";

  const campo = (item: NonNullable<typeof d>[number]) => (
    <div key={item.chave}>
      <label
        htmlFor={`int-${item.chave}`}
        className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1"
      >
        {item.label}
        <span className="ml-2 font-normal normal-case text-gray-400">{origemLabel(item.origem)}</span>
      </label>
      <input
        id={`int-${item.chave}`}
        type={item.secreta ? "password" : "text"}
        value={form[item.chave] ?? ""}
        onChange={(e) => setForm((p) => ({ ...p, [item.chave]: e.target.value }))}
        placeholder={item.secreta && item.temValor ? "•••••••• (deixe vazio para manter)" : ""}
        className={`w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 ${item.secreta ? "font-mono" : ""}`}
      />
    </div>
  );

  return (
    <div className="border border-gray-200 p-4 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle className="w-4 h-4 text-emerald-600" />
        <div className="text-xs font-bold uppercase tracking-wider text-gray-500">
          WhatsApp (alertas do sistema)
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mb-4">
        Usado para alertas diários, falhas de captura/backup e avisos. Preencha OU a Meta Cloud API
        (ID do telefone + token) OU um webhook próprio (Z-API, Twilio, n8n) — sempre com o número de
        destino.
      </p>

      {configQuery.isLoading ? (
        <div className="p-4 text-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4">{grupoWhatsapp.map(campo)}</div>
          {grupoGeral.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">
                Parâmetros gerais
              </div>
              <div className="grid md:grid-cols-2 gap-4">{grupoGeral.map(campo)}</div>
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
              Enviar mensagem de teste
            </button>
            <button
              type="button"
              onClick={() => salvar.mutate(form)}
              disabled={salvar.isPending}
              className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50"
            >
              {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar integrações
            </button>
          </div>
        </>
      )}
    </div>
  );
}
