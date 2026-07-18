import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { KeyRound, Loader2, Save } from "lucide-react";

/** Formulário de chaves de IA (admin) — permite colar a chave Groq/Anthropic
 *  direto na tela em vez de mexer em variável de ambiente na VPS. */
export function AiKeysForm() {
  const configQuery = trpc.ai.getConfig.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    aiProvider: "auto" as "auto" | "anthropic" | "groq",
    groqApiKey: "",
    groqModel: "",
    anthropicApiKey: "",
    anthropicModel: "",
  });

  useEffect(() => {
    const d = configQuery.data;
    if (!d) return;
    setForm((p) => ({
      ...p,
      aiProvider: (d.aiProvider as "auto" | "anthropic" | "groq") ?? "auto",
      groqModel: d.groq.model,
      anthropicModel: d.anthropic.model,
    }));
  }, [configQuery.data]);

  const salvar = trpc.ai.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração de IA salva. Já vale sem reiniciar o servidor.");
      setForm((p) => ({ ...p, groqApiKey: "", anthropicApiKey: "" }));
      utils.ai.getConfig.invalidate();
      utils.ai.status.invalidate();
    },
    onError: (e) => toast.error("Não foi possível salvar.", { description: e.message }),
  });

  const d = configQuery.data;
  const origem = (o?: string) =>
    o === "interface" ? "configurada nesta tela" : o === "ambiente" ? "configurada na instalação (.env)" : "não configurada";

  return (
    <div className="border border-gray-200 p-4 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-blue-600" />
        <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Chaves de IA</div>
      </div>
      <p className="text-[11px] text-gray-400 mb-4">
        Cole aqui a chave do provedor. Fica guardada criptografada e passa a valer imediatamente.
        Deixe o campo de chave em branco para manter a chave já salva.
      </p>

      <div className="mb-4">
        <label htmlFor="ai-provider" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
          Provedor preferido
        </label>
        <select
          id="ai-provider"
          value={form.aiProvider}
          onChange={(e) => setForm((p) => ({ ...p, aiProvider: e.target.value as "auto" | "anthropic" | "groq" }))}
          className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
        >
          <option value="auto">Automático (usa o que estiver configurado)</option>
          <option value="groq">Groq (rápido, tier gratuito)</option>
          <option value="anthropic">Anthropic / Claude (mais preciso)</option>
        </select>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="text-sm font-bold text-gray-800">
            Groq
            {d && <span className="ml-2 text-[10px] font-normal text-gray-400">{origem(d.groq.origem)}</span>}
          </div>
          <div>
            <label htmlFor="groq-key" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
              Chave da API (GROQ_API_KEY)
            </label>
            <input
              id="groq-key"
              type="password"
              value={form.groqApiKey}
              onChange={(e) => setForm((p) => ({ ...p, groqApiKey: e.target.value }))}
              placeholder={d?.groq.hasKey ? "•••••••• (deixe vazio para manter)" : "gsk_..."}
              className="w-full border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-900"
            />
            <div className="text-[10px] text-gray-400 mt-0.5">Gere em console.groq.com → API Keys.</div>
          </div>
          <div>
            <label htmlFor="groq-model" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
              Modelo
            </label>
            <input
              id="groq-model"
              value={form.groqModel}
              onChange={(e) => setForm((p) => ({ ...p, groqModel: e.target.value }))}
              placeholder="llama-3.3-70b-versatile"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-bold text-gray-800">
            Anthropic (Claude)
            {d && <span className="ml-2 text-[10px] font-normal text-gray-400">{origem(d.anthropic.origem)}</span>}
          </div>
          <div>
            <label htmlFor="anthropic-key" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
              Chave da API (ANTHROPIC_API_KEY)
            </label>
            <input
              id="anthropic-key"
              type="password"
              value={form.anthropicApiKey}
              onChange={(e) => setForm((p) => ({ ...p, anthropicApiKey: e.target.value }))}
              placeholder={d?.anthropic.hasKey ? "•••••••• (deixe vazio para manter)" : "sk-ant-..."}
              className="w-full border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-900"
            />
            <div className="text-[10px] text-gray-400 mt-0.5">Gere em console.anthropic.com.</div>
          </div>
          <div>
            <label htmlFor="anthropic-model" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
              Modelo
            </label>
            <input
              id="anthropic-model"
              value={form.anthropicModel}
              onChange={(e) => setForm((p) => ({ ...p, anthropicModel: e.target.value }))}
              placeholder="claude-sonnet-5"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-5">
        <button
          onClick={() =>
            salvar.mutate({
              aiProvider: form.aiProvider,
              groqApiKey: form.groqApiKey || null,
              groqModel: form.groqModel || null,
              anthropicApiKey: form.anthropicApiKey || null,
              anthropicModel: form.anthropicModel || null,
            })
          }
          disabled={salvar.isPending}
          className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50"
        >
          {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar chaves
        </button>
      </div>
    </div>
  );
}
