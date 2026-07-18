import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import { Brain, CheckCircle2, XCircle, Loader2, Zap, KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const PROVIDER_LABELS: Record<string, { nome: string; nota: string }> = {
  anthropic: { nome: "Anthropic (Claude)", nota: "Mais preciso — recomendado para extração crítica" },
  groq: { nome: "Groq", nota: "Rápido e com tier gratuito — bom padrão" },
  forge: { nome: "Forge (legado)", nota: "Endpoint legado da plataforma" },
};

const formatBrl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** Formulário de chaves de IA (admin) — permite colar a chave Groq/Anthropic
 *  direto na tela em vez de mexer em variável de ambiente na VPS. */
function AiKeysForm() {
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

export default function CentralIA() {
  const isAdmin = usePermission("admin");
  const statusQuery = trpc.ai.status.useQuery();
  const consumoQuery = trpc.ai.consumo.useQuery();
  const testarMutation = trpc.ai.testar.useMutation({
    onSuccess: (res) => {
      if (res.ok) toast.success(`${res.provedor} respondeu: ${res.resposta}`);
      else toast.error(res.erro ?? "Falha no teste.");
    },
    onError: (e) => toast.error(e.message),
  });

  const s = statusQuery.data;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Brain className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Central de IA</h1>
          <p className="text-sm text-gray-500">Provedores de inteligência artificial do sistema</p>
        </div>
      </div>

      {statusQuery.isLoading ? (
        <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : s ? (
        <>
          <div className="border border-gray-200 p-4 mb-4">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Provedor ativo</div>
            {s.ativo ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-gray-900">{PROVIDER_LABELS[s.ativo.kind]?.nome ?? s.ativo.kind}</span>
                <span className="text-sm text-gray-500">· modelo {s.ativo.model}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-700">
                <XCircle className="w-5 h-5" />
                Nenhum provedor configurado. Defina <code className="mx-1">ANTHROPIC_API_KEY</code> ou <code className="mx-1">GROQ_API_KEY</code>.
              </div>
            )}
            <div className="text-xs text-gray-400 mt-2">
              Preferência (<code>AI_PROVIDER</code>): <strong>{s.preferido}</strong>
            </div>
          </div>

          {isAdmin && <AiKeysForm />}

          <div className="border border-gray-200 p-4 mb-4">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Provedores configurados</div>
            {s.configurados.length > 0 ? (
              <ul className="space-y-2">
                {s.configurados.map((p) => (
                  <li key={p.kind} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-gray-800">{PROVIDER_LABELS[p.kind]?.nome ?? p.kind}</span>
                      <span className="text-xs text-gray-400">{p.model}</span>
                    </div>
                    <span className="text-xs text-gray-500">{PROVIDER_LABELS[p.kind]?.nota}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-400">Nenhum provedor configurado no servidor.</div>
            )}
          </div>

          <div className="border border-gray-200 p-4 mb-4">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Consumo de IA acumulado
            </div>
            {consumoQuery.data?.totais && consumoQuery.data.totais.chamadas > 0 ? (
              <>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-xl font-black text-gray-900">
                      {consumoQuery.data.totais.chamadas.toLocaleString("pt-BR")}
                    </div>
                    <div className="text-[11px] text-gray-500">chamadas à IA</div>
                  </div>
                  <div>
                    <div className="text-xl font-black text-gray-900">
                      {consumoQuery.data.totais.promptTokens.toLocaleString("pt-BR")}
                    </div>
                    <div className="text-[11px] text-gray-500">tokens enviados</div>
                  </div>
                  <div>
                    <div className="text-xl font-black text-gray-900">
                      {consumoQuery.data.totais.completionTokens.toLocaleString("pt-BR")}
                    </div>
                    <div className="text-[11px] text-gray-500">tokens recebidos</div>
                  </div>
                  <div>
                    <div className="text-xl font-black text-gray-900">
                      {formatBrl(consumoQuery.data.totais.custoBrl)}
                    </div>
                    <div className="text-[11px] text-gray-500">custo estimado</div>
                  </div>
                </div>
                {consumoQuery.data.porProvedor.length > 0 && (
                  <table className="w-full mt-4 text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-100">
                        <th className="py-1 font-medium">Provedor / modelo</th>
                        <th className="py-1 font-medium text-right">Chamadas</th>
                        <th className="py-1 font-medium text-right">Tokens</th>
                        <th className="py-1 font-medium text-right">Custo estimado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consumoQuery.data.porProvedor.map((p) => (
                        <tr key={`${p.provider}-${p.model}`} className="border-b border-gray-50">
                          <td className="py-1 text-gray-700">
                            {PROVIDER_LABELS[p.provider]?.nome ?? p.provider}
                            <span className="text-gray-400"> · {p.model}</span>
                          </td>
                          <td className="py-1 text-right text-gray-700">{p.chamadas.toLocaleString("pt-BR")}</td>
                          <td className="py-1 text-right text-gray-700">
                            {(p.promptTokens + p.completionTokens).toLocaleString("pt-BR")}
                          </td>
                          <td className="py-1 text-right text-gray-700">{formatBrl(p.custoBrl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-400">Nenhuma chamada de IA registrada ainda.</div>
            )}
            <div className="text-[11px] text-gray-400 mt-3">
              Tokens são a unidade de cobrança dos provedores de IA (aprox. 3–4 letras por token).
              O custo em reais é uma estimativa pela tabela de preços de cada provedor convertida
              a US$ {consumoQuery.data?.cotacaoUsdBrl.toLocaleString("pt-BR") ?? "5,5"} — ajuste a
              cotação em <code>USD_BRL_RATE</code>. Modelos de tier gratuito aparecem com custo zero.
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={() => testarMutation.mutate({})}
              disabled={testarMutation.isPending || !s.algumConfigurado}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {testarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              Testar conexão com a IA
            </button>
          )}

          <div className="mt-6 text-xs text-gray-400 leading-relaxed border-t border-gray-100 pt-4">
            A IA é usada para enriquecer produtos, classificar categorias, extrair itens de
            cotações/editais (PDF/DOCX) e nos agentes. Sem provedor configurado, esses recursos
            degradam para operação manual — o restante do sistema funciona normalmente.
          </div>
        </>
      ) : null}
    </div>
  );
}
