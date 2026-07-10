import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileDown,
  FlaskConical,
  GitMerge,
  Loader2,
  Plus,
  Search,
  Trash2,
  XCircle,
  AlertTriangle,
  ClipboardList,
  RefreshCw,
  Eye,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; icon: React.ReactNode }> = {
    APROVADO: { cls: "bg-green-100 text-green-800 border-green-200", label: "Aprovado", icon: <CheckCircle2 size={10} /> },
    REPROVADO: { cls: "bg-red-100 text-red-700 border-red-200", label: "Reprovado", icon: <XCircle size={10} /> },
    REVISAO: { cls: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Revisão", icon: <AlertTriangle size={10} /> },
  };
  const s = map[status] ?? map["REVISAO"];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold border ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-bold ${pct >= 80 ? "text-green-700" : pct >= 60 ? "text-yellow-600" : "text-red-600"}`}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Painel de detalhes da sessão ─────────────────────────────────────────────
function SessionDetail({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.equivalencia.getSession.useQuery({ sessionId });
  const generatePdf = trpc.equivalencia.generatePdf.useMutation({
    onSuccess: (result) => {
      if (result?.url) {
        window.open(result.url, "_blank");
        toast.success("Relatório PDF gerado com sucesso!");
      } else {
        toast.error("Erro ao gerar o PDF.");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao gerar o PDF."),
  });

  const runComparison = trpc.equivalencia.runComparison.useMutation({
    onSuccess: () => {
      utils.equivalencia.getSession.invalidate({ sessionId });
      toast.success("Comparação executada com sucesso!");
    },
    onError: (e: any) => toast.error("Erro ao executar comparação: " + e?.message),
  });
  const updateResult = trpc.equivalencia.updateResult.useMutation({
    onSuccess: () => utils.equivalencia.getSession.invalidate({ sessionId }),
    onError: (e: any) => toast.error("Erro ao atualizar resultado: " + e?.message),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={24} className="animate-spin text-gray-400" />
    </div>
  );
  if (!data) return null;

  const { session, results, profile } = data;
  const approved = results.filter((r: any) => r.result.status === "APROVADO").length;
  const rejected = results.filter((r: any) => r.result.status === "REPROVADO").length;
  const review = results.filter((r: any) => r.result.status === "REVISAO").length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-white w-full max-w-4xl mx-4 shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical size={16} className="text-teal-700" />
              <h2 className="text-base font-black text-gray-900">{session.title}</h2>
            </div>
            {session.processNumber && (
              <p className="text-xs text-gray-500">Processo: {session.processNumber}</p>
            )}
            {session.referenceDescription && (
              <p className="text-xs text-gray-500 mt-0.5 max-w-xl truncate">Ref.: {session.referenceDescription}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 font-bold">{approved} Aprovados</span>
              <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 font-bold">{rejected} Reprovados</span>
              <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 font-bold">{review} Em Revisão</span>
              {profile && <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 font-bold">Perfil: {profile.name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => generatePdf.mutate({ sessionId })}
              disabled={generatePdf.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 text-white text-xs font-bold hover:bg-indigo-800 disabled:opacity-50"
            >
              {generatePdf.isPending ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
              Relatório PDF
            </button>
            <button
              onClick={() => runComparison.mutate({ sessionId })}
              disabled={runComparison.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 disabled:opacity-50"
            >
              {runComparison.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Executar Comparação
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-900 p-1">
              <XCircle size={18} />
            </button>
          </div>
        </div>

        {/* Tabela de resultados */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Produto Candidato</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Fabricante</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">MAPA/ANVISA</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Score</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Status</th>
                <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-gray-400">
                    Nenhum candidato nesta sessão. Execute a comparação para ver os resultados.
                  </td>
                </tr>
              ) : results.map((r: any) => (
                <tr key={r.result.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <p className="text-xs font-semibold text-gray-900">{r.productName ?? `Produto #${r.result.candidateProductId}`}</p>
                    {r.result.reviewNotes && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{r.result.reviewNotes}</p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">{r.productManufacturer ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 font-mono">{r.productMapa ?? "—"}</td>
                  <td className="px-4 py-2">
                    <ScoreBar score={r.result.score ?? 0} />
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.result.status ?? "REVISAO"} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateResult.mutate({ resultId: r.result.id, status: "APROVADO" })}
                        disabled={r.result.status === "APROVADO" || updateResult.isPending}
                        className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-40 font-bold"
                        title="Aprovar"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => updateResult.mutate({ resultId: r.result.id, status: "REPROVADO" })}
                        disabled={r.result.status === "REPROVADO" || updateResult.isPending}
                        className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-40 font-bold"
                        title="Reprovar"
                      >
                        ✗
                      </button>
                      <button
                        onClick={() => updateResult.mutate({ resultId: r.result.id, status: "REVISAO" })}
                        disabled={r.result.status === "REVISAO" || updateResult.isPending}
                        className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-800 hover:bg-yellow-200 disabled:opacity-40 font-bold"
                        title="Revisão"
                      >
                        ?
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Nova Sessão ───────────────────────────────────────────────────────
function NovaSessionModal({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [processNumber, setProcessNumber] = useState("");
  const [referenceDescription, setReferenceDescription] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<{ id: number; name: string }[]>([]);

  const { data: searchResults = [] } = trpc.products.quickSearch.useQuery(
    { query: candidateSearch, limit: 10 },
    { enabled: candidateSearch.trim().length >= 2 }
  );

  const { data: profiles = [] } = (trpc.equivalencia as any).listProfiles?.useQuery?.() ?? { data: [] };
  const [profileId, setProfileId] = useState<number | undefined>(undefined);

  const createSession = (trpc.equivalencia as any).createSession?.useMutation?.({
    onSuccess: (data) => {
      utils.equivalencia.listSessions.invalidate();
      toast.success("Sessão criada com sucesso!");
      onClose();
    },
    onError: (e: any) => toast.error("Erro ao criar sessão: " + e?.message),
  });

  const handleSubmit = () => {
    if (!title.trim()) return toast.error("Informe o título da sessão.");
    if (selectedCandidates.length === 0) return toast.error("Adicione ao menos um produto candidato.");
    createSession.mutate({
      title: title.trim(),
      processNumber: processNumber.trim() || undefined,
      referenceDescription: referenceDescription.trim() || undefined,
      profileId,
      candidateProductIds: selectedCandidates.map((c) => c.id),
    });
  };

  const addCandidate = (p: { id: number; name: string }) => {
    if (selectedCandidates.some((c) => c.id === p.id)) return;
    setSelectedCandidates((prev) => [...prev, p]);
    setCandidateSearch("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FlaskConical size={15} className="text-teal-700" />
            <h2 className="text-sm font-black text-gray-900">Nova Sessão de Comparação</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900"><XCircle size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Comparação Ivermectina 1% — Pregão 12/2025"
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Número do Processo</label>
            <input
              type="text"
              value={processNumber}
              onChange={(e) => setProcessNumber(e.target.value)}
              placeholder="Ex: 2025/001234"
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Descrição de Referência (Edital)</label>
            <textarea
              value={referenceDescription}
              onChange={(e) => setReferenceDescription(e.target.value)}
              placeholder="Cole aqui a descrição do item conforme o Termo de Referência ou Edital..."
              rows={3}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Perfil de Equivalência</label>
            <select
              value={profileId ?? ""}
              onChange={(e) => setProfileId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 bg-white"
            >
              <option value="">— Sem perfil (comparação genérica) —</option>
              {(profiles as any[]).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Produtos Candidatos *</label>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
                placeholder="Buscar produto no catálogo..."
                className="w-full border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              />
            </div>
            {candidateSearch.trim().length >= 2 && (searchResults as any[]).length > 0 && (
              <div className="border border-gray-200 mt-1 max-h-40 overflow-y-auto">
                {(searchResults as any[]).map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => addCandidate(p)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <span className="font-semibold">{p.name}</span>
                    {p.manufacturer && <span className="text-gray-400 ml-2">{p.manufacturer}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedCandidates.length > 0 && (
              <div className="mt-2 space-y-1">
                {selectedCandidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-teal-50 border border-teal-100 px-2 py-1">
                    <span className="text-xs text-teal-900 font-semibold">{c.name}</span>
                    <button
                      onClick={() => setSelectedCandidates((prev) => prev.filter((x) => x.id !== c.id))}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <XCircle size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-xs text-gray-600 hover:text-gray-900 border border-gray-200">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={createSession.isPending}
            className="px-4 py-2 text-xs bg-teal-700 text-white font-bold hover:bg-teal-800 disabled:opacity-50 flex items-center gap-1.5"
          >
            {createSession.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Criar Sessão
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Busca por Ficha Técnica ──────────────────────────────────────────────────
function BuscaFichaTecnica() {
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedProductName, setSelectedProductName] = useState("");
  const [onlyWithPrice, setOnlyWithPrice] = useState(false);

  const { data: searchResults = [] } = trpc.products.quickSearch.useQuery(
    { query: productSearch, limit: 10 },
    { enabled: productSearch.trim().length >= 2 }
  );

  const { data: equivData, isLoading } = trpc.products.suggestEquivalentsByFichaTecnica.useQuery(
    { productId: selectedProductId!, limit: 30, onlyWithPrice },
    { enabled: !!selectedProductId }
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Produto de Referência</label>
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={productSearch}
            onChange={(e) => { setProductSearch(e.target.value); setSelectedProductId(null); }}
            placeholder="Buscar produto no catálogo..."
            className="w-full border border-gray-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-gray-900"
          />
        </div>
        {productSearch.trim().length >= 2 && !selectedProductId && (searchResults as any[]).length > 0 && (
          <div className="border border-gray-200 mt-1 max-h-40 overflow-y-auto">
            {(searchResults as any[]).map((p: any) => (
              <button
                key={p.id}
                onClick={() => { setSelectedProductId(p.id); setSelectedProductName(p.name); setProductSearch(p.name); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 border-b border-gray-50 last:border-0"
              >
                <span className="font-semibold">{p.name}</span>
                {p.manufacturer && <span className="text-gray-400 ml-2">{p.manufacturer}</span>}
                {p.activeIngredient && <span className="text-gray-400 ml-2">P.A.: {p.activeIngredient}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedProductId && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyWithPrice}
              onChange={(e) => setOnlyWithPrice(e.target.checked)}
              className="w-3 h-3"
            />
            Apenas com preço cadastrado
          </label>
        </div>
      )}

      {selectedProductId && equivData && (
        <>
          {/* Ficha técnica do produto de referência */}
          <div className="p-3 bg-teal-50 border border-teal-200">
            <p className="text-[10px] font-bold uppercase tracking-widest text-teal-700 mb-1.5">Ficha Técnica — {selectedProductName}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-700">
              {equivData.fichaRef?.principioAtivo && <span><b>P.A.:</b> {equivData.fichaRef.principioAtivo}</span>}
              {equivData.fichaRef?.concentracao && <span><b>Conc.:</b> {equivData.fichaRef.concentracao}</span>}
              {equivData.fichaRef?.formaFarmaceutica && <span><b>Forma:</b> {equivData.fichaRef.formaFarmaceutica}</span>}
              {equivData.fichaRef?.classeTerapeutica && <span><b>Classe:</b> {equivData.fichaRef.classeTerapeutica}</span>}
              {equivData.fichaRef?.especieAlvo && <span><b>Espécie:</b> {equivData.fichaRef.especieAlvo}</span>}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {equivData.totalFound} equivalente(s) encontrado(s) no catálogo
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 size={16} className="animate-spin text-gray-400" />
              <span className="text-xs text-gray-400">Buscando equivalentes...</span>
            </div>
          ) : equivData.equivalents.length === 0 ? (
            <p className="text-xs text-gray-400 py-4">Nenhum equivalente encontrado para este produto.</p>
          ) : (
            <div className="overflow-x-auto border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Produto</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Fabricante</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Ficha Técnica</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Score</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Status</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Preço</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">Fornecedor</th>
                  </tr>
                </thead>
                <tbody>
                  {equivData.equivalents.map((e: any) => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <p className="text-xs font-semibold text-gray-900">{e.name}</p>
                        {e.mapa && <p className="text-[10px] text-gray-400 font-mono">MAPA: {e.mapa}</p>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">{e.manufacturer ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="text-[10px] text-gray-500 space-y-0.5">
                          {e.fichaParsed?.principioAtivo && <div><b>P.A.:</b> {e.fichaParsed.principioAtivo}</div>}
                          {e.fichaParsed?.concentracao && <div><b>Conc.:</b> {e.fichaParsed.concentracao}</div>}
                          {e.fichaParsed?.formaFarmaceutica && <div><b>Forma:</b> {e.fichaParsed.formaFarmaceutica}</div>}
                          {e.fichaParsed?.classeTerapeutica && <div><b>Classe:</b> {e.fichaParsed.classeTerapeutica}</div>}
                          {e.fichaParsed?.especieAlvo && <div><b>Espécie:</b> {e.fichaParsed.especieAlvo}</div>}
                        </div>
                        {/* Detalhes de compatibilidade */}
                        {e.matchDetails && e.matchDetails.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {e.matchDetails.map((m: any) => (
                              <span key={m.field} className={`text-[9px] px-1 ${m.match ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                                {m.match ? "✓" : "✗"} {m.field}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2"><ScoreBar score={e.score ?? 0} /></td>
                      <td className="px-3 py-2"><StatusBadge status={e.status ?? "REVISAO"} /></td>
                      <td className="px-3 py-2">
                        {e.price ? (
                          <div>
                            <span className="text-xs font-bold text-gray-900">R$ {parseFloat(String(e.price)).toFixed(2)}</span>
                            {e.economia && (
                              <div className="text-[10px] text-green-700 font-bold">-{e.economia}%</div>
                            )}
                          </div>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-blue-700">{e.supplierName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function MotorEquivalencia() {
  const [activeTab, setActiveTab] = useState<"busca" | "sessoes">("busca");
  const [showNovaSession, setShowNovaSession] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: sessionsData, isLoading: loadingSessions } = trpc.equivalencia.listSessions.useQuery(
    { limit: 50, offset: 0 }
  );

  const deleteSession = (trpc.equivalencia as any).deleteSession?.useMutation?.({
    onSuccess: () => {
      utils.equivalencia.listSessions.invalidate();
      toast.success("Sessão excluída.");
    },
    onError: (e: any) => toast.error("Erro: " + e?.message),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Cabeçalho */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical size={20} className="text-teal-700" />
            <div>
              <h1 className="text-lg font-black text-gray-900">Motor de Equivalência Técnica</h1>
              <p className="text-xs text-gray-500">Compare produtos por ficha técnica estruturada — princípio ativo, concentração, forma farmacêutica, classe terapêutica</p>
            </div>
          </div>
          {activeTab === "sessoes" && (
            <button
              onClick={() => setShowNovaSession(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white text-xs font-bold hover:bg-teal-800"
            >
              <Plus size={12} /> Nova Sessão
            </button>
          )}
        </div>
        {/* Abas */}
        <div className="flex gap-0 mt-4 border-b border-gray-100 -mb-4">
          {[
            { key: "busca", label: "Busca por Ficha Técnica", icon: <Search size={12} /> },
            { key: "sessoes", label: "Sessões de Comparação", icon: <ClipboardList size={12} /> },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-teal-700 text-teal-800"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-6">
        {activeTab === "busca" && (
          <div className="bg-white border border-gray-100 p-5">
            <BuscaFichaTecnica />
          </div>
        )}

        {activeTab === "sessoes" && (
          <div className="space-y-3">
            {loadingSessions ? (
              <div className="flex items-center gap-2 py-8">
                <Loader2 size={16} className="animate-spin text-gray-400" />
                <span className="text-xs text-gray-400">Carregando sessões...</span>
              </div>
            ) : !sessionsData?.sessions.length ? (
              <div className="bg-white border border-gray-100 p-12 text-center">
                <FlaskConical size={32} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-bold text-gray-400">Nenhuma sessão de comparação criada</p>
                <p className="text-xs text-gray-400 mt-1">Crie uma sessão para comparar produtos candidatos com um item de referência do edital</p>
                <button
                  onClick={() => setShowNovaSession(true)}
                  className="mt-4 px-4 py-2 bg-teal-700 text-white text-xs font-bold hover:bg-teal-800"
                >
                  <Plus size={12} className="inline mr-1" /> Criar Primeira Sessão
                </button>
              </div>
            ) : (
              sessionsData.sessions.map((s: any) => (
                <div key={s.id} className="bg-white border border-gray-100 p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FlaskConical size={13} className="text-teal-700 flex-shrink-0" />
                      <p className="text-sm font-bold text-gray-900 truncate">{s.title}</p>
                    </div>
                    {s.processNumber && (
                      <p className="text-xs text-gray-500 font-mono mb-1">Processo: {s.processNumber}</p>
                    )}
                    {s.referenceDescription && (
                      <p className="text-xs text-gray-400 truncate max-w-lg mb-1">Ref.: {s.referenceDescription}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 font-bold">{s.counts?.approved ?? 0} Aprovados</span>
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 font-bold">{s.counts?.rejected ?? 0} Reprovados</span>
                      <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 font-bold">{s.counts?.review ?? 0} Revisão</span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(s.createdAt).toLocaleDateString("pt-BR")} — por {s.createdBy}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setSelectedSessionId(s.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-teal-700 text-white font-bold hover:bg-teal-800"
                    >
                      <Eye size={11} /> Ver
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Excluir esta sessão?")) deleteSession.mutate({ sessionId: s.id });
                      }}
                      className="p-1.5 text-gray-300 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modais */}
      {showNovaSession && <NovaSessionModal onClose={() => setShowNovaSession(false)} />}
      {selectedSessionId !== null && (
        <SessionDetail sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
      )}
    </div>
  );
}
