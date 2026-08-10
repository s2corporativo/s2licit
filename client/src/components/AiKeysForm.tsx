import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { KeyRound, Loader2, RotateCcw, Save } from "lucide-react";

type AiForm = {
  aiProvider: "auto" | "anthropic" | "groq";
  groqApiKey: string;
  groqModel: string;
  anthropicApiKey: string;
  anthropicModel: string;
};

type AiFormKey = keyof AiForm;

const INITIAL_FORM: AiForm = {
  aiProvider: "auto",
  groqApiKey: "",
  groqModel: "",
  anthropicApiKey: "",
  anthropicModel: "",
};

/** Configuração de IA administrável diretamente no S2. */
export function AiKeysForm() {
  const configQuery = trpc.ai.getConfig.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState<AiForm>(INITIAL_FORM);
  const [dirtyKeys, setDirtyKeys] = useState<Set<AiFormKey>>(() => new Set());

  useEffect(() => {
    const data = configQuery.data;
    if (!data) return;
    setForm((previous) => ({
      aiProvider: dirtyKeys.has("aiProvider")
        ? previous.aiProvider
        : data.aiProvider === "anthropic" || data.aiProvider === "groq"
          ? data.aiProvider
          : "auto",
      groqApiKey: previous.groqApiKey,
      groqModel: dirtyKeys.has("groqModel") ? previous.groqModel : data.groq.model,
      anthropicApiKey: previous.anthropicApiKey,
      anthropicModel: dirtyKeys.has("anthropicModel") ? previous.anthropicModel : data.anthropic.model,
    }));
  }, [configQuery.data, dirtyKeys]);

  const salvar = trpc.ai.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração de IA aplicada em runtime.");
      setForm((previous) => ({ ...previous, groqApiKey: "", anthropicApiKey: "" }));
      setDirtyKeys(new Set());
      void utils.ai.getConfig.invalidate();
      void utils.ai.status.invalidate();
      void utils.diagnostico.verificar.invalidate();
    },
    onError: (error) => toast.error("Não foi possível salvar.", { description: error.message }),
  });

  const resetar = trpc.ai.resetConfig.useMutation({
    onSuccess: () => {
      toast.success("Overrides de IA removidos; padrão da instalação restaurado.");
      setForm((previous) => ({ ...previous, groqApiKey: "", anthropicApiKey: "" }));
      setDirtyKeys(new Set());
      void utils.ai.getConfig.invalidate();
      void utils.ai.status.invalidate();
      void utils.diagnostico.verificar.invalidate();
    },
    onError: (error) => toast.error("Não foi possível restaurar o padrão.", { description: error.message }),
  });

  const set = <K extends AiFormKey>(key: K, value: AiForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDirtyKeys((previous) => {
      const next = new Set(previous);
      next.add(key);
      return next;
    });
  };

  const handleSalvar = () => {
    if (!dirtyKeys.size || salvar.isPending) return;
    const payload: {
      aiProvider?: "auto" | "anthropic" | "groq";
      groqApiKey?: string;
      groqModel?: string;
      anthropicApiKey?: string;
      anthropicModel?: string;
    } = {};

    for (const key of dirtyKeys) {
      switch (key) {
        case "aiProvider":
          payload.aiProvider = form.aiProvider;
          break;
        case "groqApiKey":
          if (form.groqApiKey.trim()) payload.groqApiKey = form.groqApiKey.trim();
          break;
        case "anthropicApiKey":
          if (form.anthropicApiKey.trim()) payload.anthropicApiKey = form.anthropicApiKey.trim();
          break;
        case "groqModel": {
          const value = form.groqModel.trim();
          if (!value) {
            toast.error("Modelo Groq não pode ficar vazio. Use “Restaurar padrão” para remover overrides.");
            return;
          }
          payload.groqModel = value;
          break;
        }
        case "anthropicModel": {
          const value = form.anthropicModel.trim();
          if (!value) {
            toast.error("Modelo Anthropic não pode ficar vazio. Use “Restaurar padrão” para remover overrides.");
            return;
          }
          payload.anthropicModel = value;
          break;
        }
      }
    }

    if (!Object.keys(payload).length) {
      toast.info("Nenhuma alteração preenchida para salvar.");
      return;
    }
    salvar.mutate(payload);
  };

  const data = configQuery.data;
  const origem = (value?: string) =>
    value === "interface"
      ? "override do S2"
      : value === "ambiente"
        ? "padrão da instalação"
        : "não configurada";

  const dirtyLabel = (key: AiFormKey) =>
    dirtyKeys.has(key) ? <span className="ml-2 normal-case text-amber-600">não salvo</span> : null;

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
            disabled={resetar.isPending || salvar.isPending}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-blue-700 disabled:opacity-50"
          >
            {resetar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Restaurar padrão da instalação
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mb-4">
        O S2 usa um gateway único com adapter nativo para Anthropic e adapter OpenAI-compatible para Groq/Forge.
        Em modo automático o gateway pode fazer fallback entre provedores; ao selecionar Anthropic ou Groq explicitamente, o conteúdo permanece nesse provedor.
      </p>

      {configQuery.isError ? (
        <div className="mb-4 p-3 border border-red-200 bg-red-50 rounded-lg text-sm text-red-700">
          Não foi possível carregar a configuração de IA: {configQuery.error.message}
        </div>
      ) : null}

      <div className="mb-4">
        <label htmlFor="ai-provider" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
          Provedor preferido {dirtyLabel("aiProvider")}
        </label>
        <select
          id="ai-provider"
          value={form.aiProvider}
          onChange={(event) => set("aiProvider", event.target.value as AiForm["aiProvider"])}
          disabled={configQuery.isLoading}
          className={`w-full border px-3 py-2 text-sm focus:outline-none ${
            dirtyKeys.has("aiProvider") ? "border-amber-300 focus:border-amber-500" : "border-gray-200 focus:border-gray-900"
          }`}
        >
          <option value="auto">Automático (fallback entre provedores configurados)</option>
          <option value="anthropic">Anthropic / Claude (sem fallback cruzado)</option>
          <option value="groq">Groq (sem fallback cruzado)</option>
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
              Chave da API {dirtyLabel("anthropicApiKey")}
            </label>
            <input
              id="anthropic-key"
              type="password"
              value={form.anthropicApiKey}
              onChange={(event) => set("anthropicApiKey", event.target.value)}
              placeholder={data?.anthropic.hasKey ? "•••••••• (deixe vazio para manter)" : "sk-ant-..."}
              className={`w-full border px-3 py-2 text-sm font-mono focus:outline-none ${
                dirtyKeys.has("anthropicApiKey") ? "border-amber-300 focus:border-amber-500" : "border-gray-200 focus:border-gray-900"
              }`}
            />
          </div>
          <div>
            <label htmlFor="anthropic-model" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
              Modelo {dirtyLabel("anthropicModel")}
            </label>
            <input
              id="anthropic-model"
              value={form.anthropicModel}
              onChange={(event) => set("anthropicModel", event.target.value)}
              placeholder="claude-sonnet-4-20250514"
              className={`w-full border px-3 py-2 text-sm focus:outline-none ${
                dirtyKeys.has("anthropicModel") ? "border-amber-300 focus:border-amber-500" : "border-gray-200 focus:border-gray-900"
              }`}
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
              Chave da API {dirtyLabel("groqApiKey")}
            </label>
            <input
              id="groq-key"
              type="password"
              value={form.groqApiKey}
              onChange={(event) => set("groqApiKey", event.target.value)}
              placeholder={data?.groq.hasKey ? "•••••••• (deixe vazio para manter)" : "gsk_..."}
              className={`w-full border px-3 py-2 text-sm font-mono focus:outline-none ${
                dirtyKeys.has("groqApiKey") ? "border-amber-300 focus:border-amber-500" : "border-gray-200 focus:border-gray-900"
              }`}
            />
          </div>
          <div>
            <label htmlFor="groq-model" className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">
              Modelo {dirtyLabel("groqModel")}
            </label>
            <input
              id="groq-model"
              value={form.groqModel}
              onChange={(event) => set("groqModel", event.target.value)}
              placeholder="llama-3.3-70b-versatile"
              className={`w-full border px-3 py-2 text-sm focus:outline-none ${
                dirtyKeys.has("groqModel") ? "border-amber-300 focus:border-amber-500" : "border-gray-200 focus:border-gray-900"
              }`}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-5">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvar.isPending || dirtyKeys.size === 0}
          className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 text-sm font-bold hover:bg-blue-800 disabled:opacity-50"
        >
          {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar alterações
        </button>
      </div>
    </div>
  );
}
