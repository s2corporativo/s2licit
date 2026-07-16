import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  Bot, Play, RefreshCw, Plus, CheckCircle2,
  XCircle, Clock, AlertTriangle, Eye, EyeOff, Loader2,
  Globe, Key, Calendar, BarChart3, Shield, Zap, Wand2, PlugZap, ChevronDown, Trash2,
} from "lucide-react";

// ─── Seletores personalizados (fornecedor sem config embutida) ────────────────
const CAMPOS_OBRIGATORIOS = {
  loginEmail: "Seletor do campo de e-mail/usuário no formulário de login",
  loginPassword: "Seletor do campo de senha no formulário de login",
  loginSubmit: "Seletor do botão de entrar/login",
  productItem: "Seletor de cada card/item de produto na listagem",
  productName: "Seletor do nome do produto (dentro do card)",
  productPrice: "Seletor do preço (dentro do card)",
} as const;

const CAMPOS_OPCIONAIS = {
  loginUrl: "URL da página de login (em branco = página inicial do site)",
  loginTrigger: "Seletor de um botão/link que abre o login (se for um modal)",
  loginSuccessSelector: "Seletor que só aparece quando o login deu certo",
  productCode: "Seletor do código do produto no fornecedor",
  productEan: "Seletor do EAN/código de barras",
  productImage: "Seletor da imagem (tag <img>)",
  productLink: "Seletor do link do produto",
  nextPage: "Seletor do botão/link \"próxima página\"",
} as const;

type SeletoresForm = Record<keyof typeof CAMPOS_OBRIGATORIOS | keyof typeof CAMPOS_OPCIONAIS, string>;

const SELETORES_VAZIOS: SeletoresForm = {
  loginEmail: "", loginPassword: "", loginSubmit: "",
  productItem: "", productName: "", productPrice: "",
  loginUrl: "", loginTrigger: "", loginSuccessSelector: "",
  productCode: "", productEan: "", productImage: "", productLink: "", nextPage: "",
};

/** Monta o objeto customSelectors a partir do form, ou null se algo obrigatório faltar. */
function montarCustomSelectors(sel: SeletoresForm, categoryUrlsRaw: string) {
  const categoryUrls = categoryUrlsRaw.split("\n").map(s => s.trim()).filter(Boolean);
  const faltando = Object.keys(CAMPOS_OBRIGATORIOS).filter(k => !sel[k as keyof typeof CAMPOS_OBRIGATORIOS]?.trim());
  if (categoryUrls.length === 0) faltando.push("categoryUrls");
  if (faltando.length > 0) return { erro: `Preencha os campos obrigatórios: ${faltando.join(", ")}` };

  const out: Record<string, any> = { categoryUrls };
  for (const [k, v] of Object.entries(sel)) {
    if (v && v.trim()) out[k] = v.trim();
  }
  return { customSelectors: out };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === "pending")
    return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-semibold"><Clock size={9} />Aguardando</span>;
  if (status === "success")
    return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold"><CheckCircle2 size={9} />Sucesso</span>;
  if (status === "running")
    return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold animate-pulse"><Loader2 size={9} className="animate-spin" />Executando</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold"><XCircle size={9} />Falhou</span>;
}

// ─── Modal de Cadastro ────────────────────────────────────────────────────────
function ModalCadastro({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ supplierId: "", scraperType: "tambasa", email: "", password: "", scheduleTime: "02:00" });
  const [showPass, setShowPass] = useState(false);
  const [personalizado, setPersonalizado] = useState(false);
  const [customNome, setCustomNome] = useState("");
  const [categoryUrlsRaw, setCategoryUrlsRaw] = useState("");
  const [sel, setSel] = useState<SeletoresForm>(SELETORES_VAZIOS);
  const [showAvancado, setShowAvancado] = useState(false);
  const [testeResultado, setTesteResultado] = useState<{ success: boolean; message: string; log: string[] } | null>(null);

  const { data: suppliers = [] } = trpc.suppliers.list.useQuery();
  const { data: tipos = [] } = trpc.scraperAgent.tiposDisponiveis.useQuery();
  const cadastrar = trpc.scraperAgent.cadastrar.useMutation({
    onSuccess: () => { toast.success("Fornecedor configurado!"); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const testarConexao = trpc.scraperAgent.testarConexao.useMutation({
    onSuccess: (r) => { setTesteResultado(r); r.success ? toast.success(r.message) : toast.error(r.message); },
    onError: (e) => toast.error(e.message),
  });

  const scraperType = personalizado
    ? (customNome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "personalizado")
    : form.scraperType;

  function handleTestar() {
    setTesteResultado(null);
    if (!form.email || !form.password) { toast.error("Preencha e-mail e senha para testar"); return; }
    if (personalizado) {
      const montado = montarCustomSelectors(sel, categoryUrlsRaw);
      if ("erro" in montado) { toast.error(montado.erro); return; }
      testarConexao.mutate({ scraperType, email: form.email, password: form.password, customSelectors: montado.customSelectors as any });
    } else {
      testarConexao.mutate({ scraperType, email: form.email, password: form.password });
    }
  }

  function handleSalvar() {
    if (!form.supplierId || !form.email || !form.password) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (personalizado) {
      if (!customNome.trim()) { toast.error("Informe um nome para o fornecedor personalizado"); return; }
      const montado = montarCustomSelectors(sel, categoryUrlsRaw);
      if ("erro" in montado) { toast.error(montado.erro); return; }
      cadastrar.mutate({
        supplierId: parseInt(form.supplierId), scraperType, email: form.email, password: form.password,
        scheduleTime: form.scheduleTime, customSelectors: montado.customSelectors as any,
      });
    } else {
      cadastrar.mutate({ ...form, supplierId: parseInt(form.supplierId) });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-900 px-6 py-4 flex items-center gap-3">
          <Bot size={20} className="text-emerald-400" />
          <h2 className="text-white font-bold text-sm">Configurar Fornecedor para Scraping</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Fornecedor</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              value={form.supplierId}
              onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
            >
              <option value="">Selecione...</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-bold uppercase text-gray-500 block">Tipo de Scraper</label>
              <button
                type="button"
                onClick={() => { setPersonalizado(v => !v); setTesteResultado(null); }}
                className={`text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full ${personalizado ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"}`}
              >
                <Wand2 size={9} /> Fornecedor personalizado
              </button>
            </div>

            {!personalizado ? (
              <>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  value={form.scraperType}
                  onChange={e => setForm(f => ({ ...f, scraperType: e.target.value }))}
                >
                  {tipos.map((t: any) => (
                    <option key={t.tipo} value={t.tipo}>{t.tipo.charAt(0).toUpperCase() + t.tipo.slice(1)}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  {tipos.find((t: any) => t.tipo === form.scraperType)?.categorias?.length ?? 0} categorias configuradas
                </p>
              </>
            ) : (
              <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  Cadastre qualquer site de fornecedor informando a URL e os seletores CSS dos campos
                  (nome, preço, login). Se não souber onde achar os seletores, peça ajuda a alguém que
                  consiga inspecionar o site do fornecedor (botão direito → Inspecionar).
                </p>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Nome do fornecedor (ex: Vetnil)"
                  value={customNome}
                  onChange={e => setCustomNome(e.target.value)}
                />
                <div>
                  <label className="text-[10px] font-bold text-gray-500 mb-1 block">URLs das páginas de produtos (uma por linha)</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                    rows={2}
                    placeholder={"https://fornecedor.com/categoria/produtos"}
                    value={categoryUrlsRaw}
                    onChange={e => setCategoryUrlsRaw(e.target.value)}
                  />
                </div>
                {(Object.keys(CAMPOS_OBRIGATORIOS) as (keyof typeof CAMPOS_OBRIGATORIOS)[]).map(campo => (
                  <div key={campo}>
                    <label className="text-[10px] font-bold text-gray-500 mb-1 block">{CAMPOS_OBRIGATORIOS[campo]}</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                      placeholder="seletor CSS"
                      value={sel[campo]}
                      onChange={e => setSel(s => ({ ...s, [campo]: e.target.value }))}
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setShowAvancado(v => !v)}
                  className="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <ChevronDown size={10} className={`transition-transform ${showAvancado ? "rotate-180" : ""}`} />
                  Campos avançados (opcionais)
                </button>
                {showAvancado && (
                  <div className="space-y-3 pt-1">
                    {(Object.keys(CAMPOS_OPCIONAIS) as (keyof typeof CAMPOS_OPCIONAIS)[]).map(campo => (
                      <div key={campo}>
                        <label className="text-[10px] font-bold text-gray-500 mb-1 block">{CAMPOS_OPCIONAIS[campo]}</label>
                        <input
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
                          placeholder="seletor CSS ou URL"
                          value={sel[campo]}
                          onChange={e => setSel(s => ({ ...s, [campo]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">E-mail de Acesso</label>
            <input
              type="email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="seu@email.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Senha</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Senha do portal do fornecedor"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPass(v => !v)}
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
              <Shield size={9} className="text-emerald-500" />
              Armazenada com criptografia AES-256
            </p>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Horário de Atualização Automática</label>
            <input
              type="time"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              value={form.scheduleTime}
              onChange={e => setForm(f => ({ ...f, scheduleTime: e.target.value }))}
            />
            <p className="text-[10px] text-gray-400 mt-1">O sistema atualizará os preços automaticamente neste horário</p>
          </div>

          {testeResultado && (
            <div className={`p-3 rounded-lg border text-[11px] ${testeResultado.success ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
              <div className="flex items-center gap-1 font-semibold">
                {testeResultado.success ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                {testeResultado.message}
              </div>
              {testeResultado.log.length > 0 && (
                <div className="mt-2 bg-gray-900 rounded-lg p-2 font-mono text-[10px] text-emerald-400 max-h-24 overflow-y-auto">
                  {testeResultado.log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleTestar}
            disabled={testarConexao.isPending}
            className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            {testarConexao.isPending ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
            Testar Conexão
          </button>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-semibold hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={cadastrar.isPending}
            className="flex-1 bg-gray-900 text-white rounded-lg py-2 text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {cadastrar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card de Fornecedor ───────────────────────────────────────────────────────
function CardFornecedor({ config, onRefresh }: { config: any; onRefresh: () => void }) {
  const [showLog, setShowLog] = useState(false);

  const executar = trpc.scraperAgent.executar.useMutation({
    onSuccess: () => { toast.success("Scraping iniciado!"); setTimeout(onRefresh, 2000); },
    onError: (e) => toast.error(e.message),
  });

  const deletar = trpc.scraperAgent.deletar.useMutation({
    onSuccess: () => { toast.success("Configuração removida"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });

  const { data: statusJob } = trpc.scraperAgent.status.useQuery(
    { scraperConfigId: config.id },
    { refetchInterval: config.lastRunStatus === "running" ? 3000 : false }
  );

  const { data: historico = [] } = trpc.scraperAgent.historico.useQuery({ scraperConfigId: config.id, limit: 5 });
  const isRunning = statusJob?.status === "running";

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center">
            <Globe size={16} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-sm text-gray-900">{config.scraperType.charAt(0).toUpperCase() + config.scraperType.slice(1)}</div>
            <div className="text-[10px] text-gray-400">Fornecedor #{config.supplierId}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={isRunning ? "running" : config.lastRunStatus} />
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${config.enabled === "yes" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
            {config.enabled === "yes" ? "Ativo" : "Inativo"}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
        {[
          { label: "Raspados", value: config.productsScrapedCount ?? 0 },
          { label: "Atualizados", value: config.productsUpdatedCount ?? 0 },
          { label: "Novos", value: config.productsCreatedCount ?? 0 },
          { label: "Horário", value: config.scheduleTime ?? "--:--" },
        ].map(({ label, value }) => (
          <div key={label} className="px-4 py-3 text-center">
            <div className="text-sm font-bold text-gray-900">{value}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
          </div>
        ))}
      </div>

      {/* Última execução */}
      {config.lastRunAt && (
        <div className="px-5 py-2 bg-gray-50 text-[10px] text-gray-500 flex items-center gap-1">
          <Calendar size={9} />
          Última execução: {new Date(config.lastRunAt).toLocaleString("pt-BR")}
        </div>
      )}

      {/* Erro */}
      {config.lastRunStatus === "failed" && config.lastRunErrorMessage && (
        <div className="mx-5 my-2 p-2 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-700 flex gap-1">
          <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" />
          {config.lastRunErrorMessage}
        </div>
      )}

      {/* Log em tempo real */}
      {isRunning && statusJob?.log && statusJob.log.length > 0 && (
        <div className="mx-5 my-2 p-3 bg-gray-900 rounded-lg font-mono text-[10px] text-emerald-400 max-h-32 overflow-y-auto">
          {statusJob.log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {/* Histórico colapsável */}
      {historico.length > 0 && (
        <div className="px-5 pb-3">
          <button
            onClick={() => setShowLog(v => !v)}
            className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 mt-2"
          >
            <BarChart3 size={9} /> {showLog ? "Ocultar" : "Ver"} histórico ({historico.length} execuções)
          </button>
          {showLog && (
            <div className="mt-2 space-y-1">
              {historico.map((h: any) => (
                <div key={h.id} className="flex items-center gap-2 text-[10px] text-gray-500">
                  <StatusBadge status={h.status} />
                  <span>{new Date(h.startedAt).toLocaleString("pt-BR")}</span>
                  <span className="text-gray-400">• {h.productsScraped ?? 0} produtos • {Math.round((h.durationMs ?? 0) / 1000)}s</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-2 px-5 pb-4 pt-2">
        <button
          onClick={() => executar.mutate({ scraperConfigId: config.id })}
          disabled={isRunning || executar.isPending}
          className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-lg py-2 text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {isRunning ? "Executando..." : "Atualizar Agora"}
        </button>
        <button
          onClick={() => {
            if (confirm(`Remover a configuração de scraping de "${config.scraperType}"? As credenciais salvas serão apagadas.`)) {
              deletar.mutate({ id: config.id });
            }
          }}
          disabled={isRunning || deletar.isPending}
          title="Remover fornecedor"
          className="flex items-center justify-center gap-2 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-red-50 disabled:opacity-40 transition"
        >
          {deletar.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ScraperFornecedores() {
  const [showModal, setShowModal] = useState(false);

  const { data: configs = [], refetch, isLoading } = trpc.scraperAgent.listar.useQuery();
  const executarTodos = trpc.scraperAgent.executarTodos.useMutation({
    onSuccess: (r) => { toast.success(r.message); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
              <Bot size={20} className="text-emerald-400" />
            </div>
            <h1 className="text-xl font-black text-gray-900">Agente de Preços e Importação</h1>
          </div>
          <p className="text-sm text-gray-500 ml-13">
            Acessa os sites dos fornecedores com seu login, atualiza preços dos produtos já cadastrados e importa para o catálogo qualquer produto novo encontrado
          </p>
        </div>
        <div className="flex gap-2">
          {configs.length > 0 && (
            <button
              onClick={() => executarTodos.mutate()}
              disabled={executarTodos.isPending}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {executarTodos.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Atualizar Todos
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700"
          >
            <Plus size={14} /> Adicionar Fornecedor
          </button>
        </div>
      </div>

      {/* Como funciona */}
      {configs.length === 0 && !isLoading && (
        <div className="mb-8 bg-gray-50 border border-gray-200 rounded-xl p-6">
          <h2 className="font-bold text-sm text-gray-900 mb-4">Como funciona</h2>
          <div className="grid grid-cols-4 gap-4">
            {[
              { icon: Key, title: "1. Credenciais", desc: "Você cadastra o e-mail e senha do portal do fornecedor. São armazenados com criptografia AES-256." },
              { icon: Bot, title: "2. Login automático", desc: "O agente acessa o site do fornecedor com um navegador real e faz login automaticamente." },
              { icon: Globe, title: "3. Varredura", desc: "Navega pelas categorias de produtos, extraindo nomes, preços, códigos e imagens." },
              { icon: RefreshCw, title: "4. Importação", desc: "Produtos já cadastrados têm o preço atualizado; produtos ainda não cadastrados são importados como novos itens no catálogo." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="text-center">
                <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Icon size={16} className="text-white" />
                </div>
                <div className="font-bold text-xs text-gray-900 mb-1">{title}</div>
                <p className="text-[10px] text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fornecedores configurados */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Carregando configurações...
        </div>
      ) : configs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Bot size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-gray-600">Nenhum fornecedor configurado ainda</p>
          <p className="text-sm mt-1">Clique em "Adicionar Fornecedor" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configs.map((cfg: any) => (
            <CardFornecedor key={cfg.id} config={cfg} onRefresh={refetch} />
          ))}
        </div>
      )}

      {showModal && <ModalCadastro onClose={() => setShowModal(false)} onSaved={refetch} />}
    </div>
  );
}
