import { trpc } from "@/lib/trpc";
import { usePermission } from "@/components/RequireAuth";
import { Brain, CheckCircle2, XCircle, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";

const PROVIDER_LABELS: Record<string, { nome: string; nota: string }> = {
  anthropic: { nome: "Anthropic (Claude)", nota: "Mais preciso — recomendado para extração crítica" },
  groq: { nome: "Groq", nota: "Rápido e com tier gratuito — bom padrão" },
  forge: { nome: "Forge (legado)", nota: "Endpoint legado da plataforma" },
};

export default function CentralIA() {
  const isAdmin = usePermission("admin");
  const statusQuery = trpc.ai.status.useQuery();
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
