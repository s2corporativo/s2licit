import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Bot, Play, CheckCircle2, XCircle, Loader2, Eye, EyeOff,
  Clock, Send, Shield, AlertTriangle, FileText, Globe,
  ChevronDown, ChevronUp, ImageIcon, Zap,
} from "lucide-react";

type PortalType = "comprasnet" | "comprasmg" | "fundep" | "agrega" | "generico";
type Modo = "salvar_rascunho" | "enviar_direto";

const STATUS_LABEL: Record<string, { label: string; cor: string; icon: any }> = {
  running:               { label: "Executando",        cor: "text-blue-600 bg-blue-50",   icon: Loader2 },
  done:                  { label: "Concluído",          cor: "text-green-700 bg-green-50", icon: CheckCircle2 },
  error:                 { label: "Erro",               cor: "text-red-700 bg-red-50",     icon: XCircle },
  aguardando_aprovacao:  { label: "Aguard. aprovação",  cor: "text-amber-700 bg-amber-50", icon: Clock },
  not_found:             { label: "Não encontrado",     cor: "text-gray-500 bg-gray-50",   icon: XCircle },
};

// ─── Painel de Log ────────────────────────────────────────────────────────────
function PainelLog({ log, erros }: { log: string[]; erros: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" }); }, [log]);

  return (
    <div ref={ref} className="bg-gray-950 rounded-xl p-4 h-56 overflow-y-auto font-mono text-xs space-y-0.5">
      {log.map((l, i) => (
        <div key={i} className={
          l.includes("❌") ? "text-red-400" :
          l.includes("✅") ? "text-emerald-400" :
          l.includes("⏸️") ? "text-amber-400" :
          l.includes("🚀") ? "text-blue-400" :
          "text-gray-400"
        }>{l}</div>
      ))}
      {erros.map((e, i) => (
        <div key={`e${i}`} className="text-red-400">⚠ {e}</div>
      ))}
      {log.length === 0 && erros.length === 0 && (
        <div className="text-gray-600 italic">Aguardando início...</div>
      )}
    </div>
  );
}

// ─── Card de Job ──────────────────────────────────────────────────────────────
function CardJob({ job }: { job: any }) {
  const [verScreenshots, setVerScreenshots] = useState(false);
  const [expandLog, setExpandLog] = useState(false);

  const { data: shots } = trpc.propostaAgent.screenshots.useQuery(
    { jobId: job.jobId },
    { enabled: verScreenshots }
  );

  const st = STATUS_LABEL[job.status] ?? STATUS_LABEL.not_found;
  const Icon = st.icon;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold ${st.cor}`}>
            <Icon size={12} className={job.status === "running" ? "animate-spin" : ""} />
            {st.label}
          </span>
          <div>
            <div className="font-bold text-sm text-gray-900">{job.processo || "Processo não identificado"}</div>
            <div className="text-[10px] text-gray-400">{new Date(job.criadoEm).toLocaleString("pt-BR")}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold text-gray-900">
            R$ {(job.totalProposta || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-gray-400">{job.itensPreenchidos}/{job.itensTentados} itens</div>
        </div>
      </div>

      <div className="flex gap-2 px-5 pb-4">
        <button
          onClick={() => setExpandLog(v => !v)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 border border-gray-100 rounded-lg px-3 py-1.5"
        >
          {expandLog ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Log
        </button>
        <button
          onClick={() => setVerScreenshots(v => !v)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 border border-gray-100 rounded-lg px-3 py-1.5"
        >
          <ImageIcon size={11} /> Screenshots
        </button>
      </div>

      {verScreenshots && shots?.screenshots && shots.screenshots.length > 0 && (
        <div className="px-5 pb-4 grid grid-cols-2 gap-2">
          {shots.screenshots.map((s: string, i: number) => (
            <img key={i} src={`data:image/png;base64,${s}`} alt={`Tela ${i + 1}`}
              className="rounded-lg border border-gray-200 w-full object-contain" />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function AgenteProposta() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({
    propostaId: "",
    portalType: "comprasnet" as PortalType,
    email: "",
    password: "",
    cpf: "",
    cnpj: "",
    loginUrl: "",
    urlLicitacao: "",
    modoAprovacao: "salvar_rascunho" as Modo,
    validadeDias: "60",
  });

  const { data: portais = [] } = trpc.propostaAgent.portaisDisponiveis.useQuery();
  const { data: propostas = [] } = trpc.proposals.list.useQuery();
  const { data: historico = [], refetch: refetchHistorico } = trpc.propostaAgent.historicoJobs.useQuery();

  const { data: statusJob, refetch: refetchStatus } = trpc.propostaAgent.status.useQuery(
    { jobId: jobId! },
    { enabled: !!jobId, refetchInterval: jobId ? 2500 : false }
  );

  // Para de refazer quando job concluir
  useEffect(() => {
    if (statusJob?.status && ["done", "error", "aguardando_aprovacao"].includes(statusJob.status)) {
      refetchHistorico();
    }
  }, [statusJob?.status]);

  const iniciar = trpc.propostaAgent.iniciar.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success("Agente iniciado! Acompanhe o log abaixo.");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const confirmarEnvio = trpc.propostaAgent.confirmarEnvio.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success("Envio iniciado!");
    },
    onError: (e) => toast.error(e.message),
  });

  const portalAtual = portais.find((p: any) => p.tipo === form.portalType);
  const isRunning = statusJob?.status === "running";
  const aguardandoAprovacao = statusJob?.status === "aguardando_aprovacao";

  const handleIniciar = () => {
    if (!form.propostaId) return toast.error("Selecione uma proposta");
    if (!form.email || !form.password) return toast.error("Informe e-mail e senha do portal");

    iniciar.mutate({
      propostaId: parseInt(form.propostaId),
      portalType: form.portalType,
      credencial: {
        email: form.email, password: form.password,
        cpf: form.cpf || undefined, cnpj: form.cnpj || undefined,
        loginUrl: form.loginUrl || undefined,
      },
      urlLicitacao: form.urlLicitacao || undefined,
      modoAprovacao: form.modoAprovacao,
      validadeDias: parseInt(form.validadeDias),
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center shadow-lg">
          <Zap size={22} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-gray-900">Agente de Preenchimento de Propostas</h1>
          <p className="text-sm text-gray-500">Preenche automaticamente a proposta no portal do governo com os preços do sistema S2</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Formulário — col 3 */}
        <div className="col-span-3 space-y-5">

          {/* Proposta */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-bold text-sm text-gray-900 mb-4 flex items-center gap-2">
              <FileText size={14} /> Proposta S2
            </h2>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              value={form.propostaId}
              onChange={e => setForm(f => ({ ...f, propostaId: e.target.value }))}
            >
              <option value="">Selecione a proposta...</option>
              {propostas.map((p: any) => (
                <option key={p.id} value={p.id}>
                  #{p.id} — {p.title} {p.processNumber ? `(${p.processNumber})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Portal */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-bold text-sm text-gray-900 mb-4 flex items-center gap-2">
              <Globe size={14} /> Portal de Licitação
            </h2>
            <div className="space-y-3">
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                value={form.portalType}
                onChange={e => setForm(f => ({ ...f, portalType: e.target.value as PortalType }))}
              >
                {portais.map((p: any) => (
                  <option key={p.tipo} value={p.tipo}>{p.nome}</option>
                ))}
              </select>

              {form.portalType === "generico" && (
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">URL de Login do Portal</label>
                  <input type="url" placeholder="https://portal.orgao.gov.br/login"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={form.loginUrl} onChange={e => setForm(f => ({ ...f, loginUrl: e.target.value }))} />
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">URL direta da licitação (opcional)</label>
                <input type="url" placeholder="https://..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  value={form.urlLicitacao} onChange={e => setForm(f => ({ ...f, urlLicitacao: e.target.value }))} />
                <p className="text-[10px] text-gray-400 mt-1">Se informada, o agente acessa diretamente sem precisar buscar</p>
              </div>
            </div>
          </div>

          {/* Credenciais */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-bold text-sm text-gray-900 mb-4 flex items-center gap-2">
              <Shield size={14} /> Credenciais do Portal
              <span className="text-[10px] font-normal text-gray-400 ml-auto flex items-center gap-1">
                <Shield size={9} className="text-emerald-500" /> AES-256 em memória
              </span>
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">E-mail / Usuário</label>
                  <input type="email" placeholder="seu@email.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Senha</label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} placeholder="••••••••"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">CPF (se necessário)</label>
                  <input type="text" placeholder="000.000.000-00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">CNPJ da Empresa</label>
                  <input type="text" placeholder="00.000.000/0001-00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* Modo e validade */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-bold text-sm text-gray-900 mb-4">Configurações de Envio</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 mb-2 block">Modo de operação</label>
                <div className="space-y-2">
                  {[
                    { value: "salvar_rascunho", label: "Salvar rascunho", desc: "Preenche e salva — você revisa antes de enviar", icon: Clock },
                    { value: "enviar_direto", label: "Enviar diretamente", desc: "Preenche e envia sem intervenção", icon: Send },
                  ].map(op => (
                    <label key={op.value} className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition ${
                      form.modoAprovacao === op.value ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:bg-gray-50"
                    }`}>
                      <input type="radio" name="modo" value={op.value}
                        checked={form.modoAprovacao === op.value}
                        onChange={e => setForm(f => ({ ...f, modoAprovacao: e.target.value as Modo }))}
                        className="mt-0.5" />
                      <div>
                        <div className="font-semibold text-xs text-gray-900">{op.label}</div>
                        <div className="text-[10px] text-gray-500">{op.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-500 mb-2 block">Validade da proposta</label>
                <div className="relative">
                  <input type="number" min={1} max={365}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={form.validadeDias}
                    onChange={e => setForm(f => ({ ...f, validadeDias: e.target.value }))} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">dias</span>
                </div>
              </div>
            </div>
          </div>

          {/* Botões de ação */}
          <div className="flex gap-3">
            <button
              onClick={handleIniciar}
              disabled={isRunning || iniciar.isPending}
              className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-xl py-3 font-bold text-sm hover:bg-gray-700 disabled:opacity-40 transition"
            >
              {isRunning || iniciar.isPending
                ? <><Loader2 size={16} className="animate-spin" /> Executando...</>
                : <><Play size={16} /> Iniciar Agente</>
              }
            </button>

            {aguardandoAprovacao && (
              <button
                onClick={() => confirmarEnvio.mutate({
                  jobId: jobId!,
                  propostaId: parseInt(form.propostaId),
                  portalType: form.portalType,
                  credencial: { email: form.email, password: form.password, cpf: form.cpf || undefined, cnpj: form.cnpj || undefined },
                  urlLicitacao: form.urlLicitacao || undefined,
                })}
                disabled={confirmarEnvio.isPending}
                className="flex items-center gap-2 bg-emerald-600 text-white rounded-xl px-5 py-3 font-bold text-sm hover:bg-emerald-700 transition animate-pulse"
              >
                <Send size={16} /> Confirmar Envio
              </button>
            )}
          </div>
        </div>

        {/* Painel de status — col 2 */}
        <div className="col-span-2 space-y-4">

          {/* Status atual */}
          {jobId && statusJob && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="font-bold text-xs text-gray-900">Status do Agente</span>
                {statusJob.status === "aguardando_aprovacao" && (
                  <span className="text-[10px] text-amber-600 font-bold animate-pulse flex items-center gap-1">
                    <AlertTriangle size={9} /> Aguarda sua aprovação
                  </span>
                )}
              </div>

              {statusJob.resultado && (
                <div className="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100">
                  {[
                    { label: "Tentados", value: statusJob.resultado.itensTentados },
                    { label: "Preenchidos", value: statusJob.resultado.itensPreenchidos },
                  ].map(({ label, value }) => (
                    <div key={label} className="px-4 py-3 text-center">
                      <div className="text-lg font-black text-gray-900">{value}</div>
                      <div className="text-[10px] text-gray-400 uppercase">{label}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3">
                <PainelLog
                  log={statusJob.resultado?.log ?? []}
                  erros={statusJob.resultado?.erros ?? []}
                />
              </div>
            </div>
          )}

          {!jobId && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center text-gray-400">
              <Bot size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Configure e inicie o agente.<br />O log aparecerá aqui.</p>
            </div>
          )}

          {/* Aviso de segurança */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-xs text-amber-800 mb-1">Use o modo "Rascunho"</div>
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  Recomendamos sempre salvar como rascunho primeiro. Verifique os preços preenchidos e os screenshots antes de confirmar o envio.
                </p>
              </div>
            </div>
          </div>

          {/* Histórico */}
          {historico.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="font-bold text-xs text-gray-900">Execuções Recentes</span>
              </div>
              <div className="divide-y divide-gray-50">
                {historico.slice(0, 5).map((job: any) => {
                  const st = STATUS_LABEL[job.status] ?? STATUS_LABEL.not_found;
                  const Icon = st.icon;
                  return (
                    <div key={job.jobId} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${st.cor}`}>
                          <Icon size={9} /> {st.label}
                        </span>
                        <span className="text-[10px] text-gray-500">{job.processo || "—"}</span>
                      </div>
                      <span className="text-[10px] text-gray-400">{job.itensPreenchidos}/{job.itensTentados}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
