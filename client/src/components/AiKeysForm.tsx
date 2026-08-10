import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { KeyRound, Loader2, RotateCcw, Save } from "lucide-react";

/** Configuração de IA administrável diretamente no S2. */
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
    const data = configQuery.data;
    if (!data) return;
    setForm((previous) => ({
      ...previous,
      aiProvider: (data.aiProvider as "auto" | "anthropic" | "groq") ?? "auto",
      groqModel: data.groq.model,
      anthropicModel: data.anthropic.model,
    }));
  }, [configQuery.data]);

  const salvar = trpc.ai.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração de IA aplicada em runtime.");
      setForm((previous) => ({ ...previous, groqApiKey: "", anthropicApiKey: "" }));
      utils.ai.getConfig.invalidate();
      utils.ai.status.invalidate();
    },
    onError: (error) => toast.error("Não foi possível salvar.", { description: error.message }),
  });

  const resetar = trpc.ai.resetConfig.useMutation({
    onSuccess: () => {
      toast.success("Overrides de IA removidos; padrão da instalação restaurado.");
      setForm((previous) => ({ ...previous, groqApiKey: "", anthropicApiKey: "" }));
      utils.ai.getConfig.invalidate();
      utils.ai.status.invalidate();
    },
    onError: (error) => toast.error("Não foi possível restaurar o padrão.", { description: error.message }),
  });

  const data = configQuery.data;
  const origem = (value?: string) =>
    value === "interface"
      ? "override do S2"
      : value === "ambiente"
        ? "padrão da instalação"
        : "não configurada";

  return (
    <div className="border border-gray-200 p-4 mb-4 rounded-xl">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-blue-600" />
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Inteligência Artificial</div>
        </div>
        {data?.hasInterfaceOverride && (
          <button
            type="button"
            onClick={() => resetar.mutate()}
            disabled={resetar.isPending}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-blue-700 disabled:opacity-50"
          >
            {resetar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Restaurar padrão da instalação
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mb-4">
        O S2 usa um gateway único com adapter nativo para Anthropic Messages API e adapter OpenAI-compatible para Groq/Forge.
        Chaves ficam criptografadas; deixe o campo de chave vazio para manter o valor atual.
      </p>

      <div className="mb-4">
        <label htmlFor="ai-provider" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
          Provedor preferido
        </label>
        <select
          id="ai-provider"
          value={form.aiProvider}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              aiProvider: event.target.value as "auto" | "anthropic" | "groq",
            }))
          }
          className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
        >
          <option value="auto">Automático (fallback entre provedores configurados)</option>
          <option value="anthropic">Anthropic / Claude</option>
          <option value="groq">Groq</option>
        </select>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="text-sm font-bold text-gray-800">
            Anthropic (Claude)
            {data && <span className="ml-2 text-[10px] font-normal text-gray-400">{origem(data.anthropic.origem)}</span>}
          </div>
          <div>
            <label htmlFor="anthropic-key" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
              Chave da API
            </label>
            <input
              id="anthropic-key"
              type="password"
              value={form.anthropicApiKey}
              onChange={(event) => setForm((previous) => ({ ...previous, anthropicApiKey: event.target.value }))}
              placeholder={data?.anthropic.hasKey ? "•••••••• (deixe vazio para manter)" : "sk-ant-..."}
              className="w-full border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-900"
            />
          </div>
          <div>
            <label htmlFor="anthropic-model" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
              Modelo
            </label>
            <input
              id="anthropic-model"
              value={form.anthropicModel}
              onChange={(event) => setForm((previous) => ({ ...previous, anthropicModel: event.target.value }))}
              placeholder="claude-sonnet-4-20250514"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-bold text-gray-800">
            Groq
            {data && <span className="ml-2 text-[10px] font-normal text-gray-400">{origem(data.groq.origem)}</span>}
          </div>
          <div>
            <label htmlFor="groq-key" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
              Chave da API
            </label>
            <input
              id="groq-key"
              type="password"
              value={form.groqApiKey}
              onChange={(event) => setForm((previous) => ({ ...previous, groqApiKey: event.target.value }))}
              placeholder={data?.groq.hasKey ? "•••••••• (deixe vazio para manter)" : "gsk_..."}
              className="w-full border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-900"
            />
          </div>
          <div>
            <label htmlFor="groq-model" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
              Modelo
            </label>
            <input
              id="groq-model"
              value={form.groqModel}
              onChange={(event) => setForm((previous) => ({ ...previous, groqModel: event.target.value }))}
              placeholder="llama-3.3-70b-versatile"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-5">
        <button
          type="button"
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
          Salvar IA
        </button>
      </div>
    </div>
  );
}
