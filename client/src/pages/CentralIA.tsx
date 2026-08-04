import { formatBRL } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AiKeysForm } from "@/components/AiKeysForm";
import { usePermission } from "@/components/RequireAuth";
import { Brain, CheckCircle2, XCircle, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

const PROVIDER_LABELS: Record<string, { nome: string; nota: string }> = {
  anthropic: { nome: "Anthropic (Claude)", nota: "Mais preciso — recomendado para extração crítica" },
  groq: { nome: "Groq", nota: "Rápido e com tier gratuito — bom padrão" },
  forge: { nome: "Forge (legado)", nota: "Endpoint legado da plataforma" },
};

const formatBrl = formatBRL;

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
