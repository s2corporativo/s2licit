import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/hooks/useConfirm";
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

/**
 * Normaliza o nome do fornecedor para a chave do preset em FORNECEDOR_CONFIGS
 * (sem acentos nem espaços) — ex.: "Basso Pancotte" → "bassopancotte". Permite
 * sugerir o tipo de scraper automaticamente ao escolher o fornecedor.
 */
function slugFornecedor(nome: string): string {
  return nome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// ─── Modal de Recadastro em Lote (Camada 1 — §recadastro-lote) ──────────────
function ModalRecadastroLote({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  // Cartões: configuração falhada (senha cifrada com chave antiga) ou sem senha gravada.
  const { data: configs = [] } = trpc.scraperAgent.listar.useQuery();
  const [falhadas] = useState(() => (configs as any[]).filter(
    (c: any) => c.lastRunStatus === "failed" || !c.lastRunAt
  ));
  // itens: id, email (mostrado), senha nova (em claro, enviada via HTTPS), termos
  const [itens, setItens] = useState<Record<number, { email: string; password: string; tos: boolean }>>({});
  const [testando, setTestando] = useState<number | null>(null);
  const [testados, setTestados] = useState<Record<number, boolean>>({});
  const [senhaVisivel, setSenhaVisivel] = useState<Record<number, boolean>>({});

  const recarregar = trpc.scraperAgent.recarregarCredenciais.useMutation({
    onSuccess: (r) => {
      if (r.falhos.length) toast.error(`${r.falhos.length} fornecedor(es) falharam ao recadastrar`);
      toast.success(`${r.ok.length} credencial(is) recadastrada(s) com a chave atual`);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });
  const testarConexao = trpc.scraperAgent.testarConexao.useMutation({
    onSuccess: (r, vars) => {
      setTestados(v => ({ ...v, [vars.scraperConfigId ?? 0]: r.success }));
      r.success ? toast.success(`${r.message}`) : toast.error(`${r.message}`);
      setTestando(null);
    },
    onError: (e, vars) => {
      setTestados(v => ({ ...v, [vars.scraperConfigId ?? 0]: false }));
      toast.error(e.message);
      setTestando(null);
    },
  });

  function setSenha(id: number, email: string, password: string) {
    setItens(prev => ({
      ...prev,
      [id]: { email, password, tos: prev[id]?.tos ?? false },
    }));
  }

  function setTos(id: number, tos: boolean) {
    setItens(prev => ({ ...prev, [id]: { ...prev[id], tos } }));
  }

  function temAlteracoes(): boolean {
    return Object.values(itens).some(i => i.password.length >= 4 || i.tos);
  }

  function handleSalvar() {
    const payload = Object.entries(itens)
      .map(([id, item]) => ({ id: parseInt(id), email: item.email || undefined, password: item.password || undefined, tosAprovado: item.tos }))
      .filter(i => i.password || i.tosAprovado);
    if (payload.length === 0) { toast.error("Preencha ao menos uma senha nova ou aprove os termos de um fornecedor"); return; }
    recarregar.mutate({ itens: payload });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[88vh] flex flex-col">
        <div className="bg-gray-900 px-6 py-4 flex items-center gap-3 flex-shrink-0">
          <Key size={20} className="text-emerald-400" />
          <div>
            <h2 className="text-white font-bold text-sm">Recadastrar credenciais dos fornecedores falhados</h2>
            <p className="text-gray-400 text-[10px] mt-0.5">
              A senha nova é criptografada com a chave atual (AES-256) — resolve o erro de descriptografia. Os termos de uso devem ser revisados item a item.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {falhadas.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">Não há fornecedores com falha registrada. Todos os cadastros estão operando normalmente.</p>
          )}
          {falhadas.map((cfg: any) => {
            const item = itens[cfg.id] ?? { email: "", password: "", tos: false };
            return (
              <div key={cfg.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm text-gray-900 capitalize">{cfg.scraperType}</div>
                    <div className="text-[10px] text-gray-400">ID {cfg.id} • {cfg.lastRunStatus === "failed" ? "Última falha: " + (cfg.lastRunAt ? new Date(cfg.lastRunAt).toLocaleString("pt-BR") : "nunca executado") : "Aguardando primeira execução"}</div>
                  </div>
                  <StatusBadge status={cfg.lastRunStatus} />
                </div>
                {cfg.lastRunErrorMessage && (
                  <div className="p-2 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-700 flex gap-1">
                    <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" />{cfg.lastRunErrorMessage}
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">E-mail / usuário do portal (em branco mantém o atual)</label>
                  <input
                    type="email"
                    value={item.email}
                    onChange={e => setSenha(cfg.id, e.target.value, item.password)}
                    placeholder="email@fornecedor.com.br"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">Senha nova do portal</label>
                  <div className="relative">
                    <input
                      type={senhaVisivel[cfg.id] ? "text" : "password"}
                      value={item.password}
                      onChange={e => setSenha(cfg.id, item.email, e.target.value)}
                      placeholder="•••••••• (digite a senha nova para re-cifrar com a chave atual)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <button type="button" onClick={() => setSenhaVisivel(v => ({ ...v, [cfg.id]: !v[cfg.id] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {senhaVisivel[cfg.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {testados[cfg.id] === true && <span className="text-emerald-600 font-semibold">✓ Conexão testada com sucesso</span>}
                    {testados[cfg.id] === false && <span className="text-red-600 font-semibold">✗ Conexão falhou — revise credenciais</span>}
                    {testados[cfg.id] === undefined && <span>Teste a conexão antes de salvar (recomendado)</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!item.password || item.password.length < 4) { toast.error("Digite a senha nova para testar"); return; }
                      setTestando(cfg.id);
                      setTestados(v => ({ ...v, [cfg.id]: false }));
                      testarConexao.mutate({ scraperConfigId: cfg.id, email: item.email, password: item.password });
                    }}
                    disabled={testando === cfg.id || item.password.length < 4}
                    className="flex items-center gap-2 border border-gray-300 px-3 py-2 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {testando === cfg.id ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
                    Testar Conexão
                  </button>
                  <label className="flex items-center gap-2 ml-auto border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={item.tos} onChange={e => setTos(cfg.id, e.target.checked)} className="accent-gray-900 w-4 h-4" />
                    <span className="text-[11px] font-semibold text-gray-700">Revisei os termos de uso</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex items-center gap-3 bg-gray-50 flex-shrink-0">
          <span className="text-[10px] text-gray-500">A senha fica criptografada (AES-256) e nunca é exibida na tela após salvar.</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-white">Cancelar</button>
            <button
              onClick={handleSalvar}
              disabled={recarregar.isPending || !temAlteracoes()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2"
            >
              {recarregar.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Recadastrar ({Object.keys(itens).filter(k => itens[parseInt(k)].password || itens[parseInt(k)].tos).length} item(ns))
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [tosAprovado, setTosAprovado] = useState(false);
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
    if (!tosAprovado) {
      toast.error("Confirme que os termos de uso do site do fornecedor foram revisados e a coleta está autorizada.");
      return;
    }
    if (personalizado) {
      if (!customNome.trim()) { toast.error("Informe um nome para o fornecedor personalizado"); return; }
      const montado = montarCustomSelectors(sel, categoryUrlsRaw);
      if ("erro" in montado) { toast.error(montado.erro); return; }
      cadastrar.mutate({
        supplierId: parseInt(form.supplierId), scraperType, email: form.email, password: form.password,
        scheduleTime: form.scheduleTime, customSelectors: montado.customSelectors as any,
        tosAprovado,
      });
    } else {
      cadastrar.mutate({ ...form, supplierId: parseInt(form.supplierId), tosAprovado });
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
              onChange={e => {
                const supplierId = e.target.value;
                // Ao escolher um fornecedor cujo nome bate com um preset pronto
                // (Tambasa, Bartofil, Basso Pancotte, Magazine Médica, Utilidades
                // Clínicas), já seleciona o tipo de scraper correspondente.
                const sup = suppliers.find((s: any) => String(s.id) === supplierId);
                const slug = sup ? slugFornecedor(sup.name) : "";
                const temPreset = tipos.some((t: any) => t.tipo === slug);
                if (temPreset) setPersonalizado(false);
                setForm(f => ({ ...f, supplierId, scraperType: temPreset ? slug : f.scraperType }));
              }}
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
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-relaxed font-semibold">
                  Configuração avançada — normalmente feita uma única vez com apoio técnico.
                  Se o seu fornecedor está na lista de modelos prontos acima, use o modelo e ignore esta parte.
                </p>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  Para cadastrar um site que não tem modelo pronto, é preciso indicar onde ficam o
                  nome, o preço e o login dentro da página do fornecedor (os chamados "seletores").
                  Isso exige conhecimento técnico: peça a quem der suporte ao sistema para preencher
                  estes campos uma vez — depois a captura roda sozinha todos os dias.
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

        <div className="px-6 pb-4">
          <label htmlFor="tos-aprovado" className="flex items-start gap-2 text-[12px] text-gray-600 cursor-pointer">
            <input
              id="tos-aprovado"
              type="checkbox"
              checked={tosAprovado}
              onChange={(e) => setTosAprovado(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Confirmo que os <strong>termos de uso</strong> do site deste fornecedor foram
              revisados e que a coleta automática de preços está autorizada (somos cliente
              cadastrado). Sem esta confirmação a captura não roda.
            </span>
          </label>
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

// ─── Diálogo de confirmação de login (pedido a cada atualização) ─────────────
function LoginDialog({
  config,
  onClose,
  onConfirm,
  pending,
}: {
  config: any;
  onClose: () => void;
  onConfirm: (creds: { email?: string; password?: string; usarSenhaSalva: boolean }) => void;
  pending: boolean;
}) {
  const { data: emailData } = trpc.scraperAgent.verEmail.useQuery({ id: config.id });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usarSalva, setUsarSalva] = useState(true);
  const [showPass, setShowPass] = useState(false);

  const emailAtual = email || emailData?.email || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-violet-600">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Key size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Confirmar login do fornecedor</h3>
              <p className="text-indigo-100 text-[11px]">
                {config.scraperType.charAt(0).toUpperCase() + config.scraperType.slice(1)} — a
                atualização acessa o portal com estas credenciais
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              E-mail / usuário do portal
            </label>
            <input
              type="email"
              value={emailAtual}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@fornecedor.com.br"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
            />
          </div>

          <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 py-3 cursor-pointer hover:bg-slate-50 transition">
            <input
              type="checkbox"
              checked={usarSalva}
              onChange={(e) => setUsarSalva(e.target.checked)}
              className="accent-indigo-600 w-4 h-4"
            />
            <div>
              <div className="text-xs font-semibold text-slate-700">Usar a senha salva no cofre</div>
              <div className="text-[10px] text-slate-400">
                Criptografada com AES-256 — desmarque para digitar outra
              </div>
            </div>
          </label>

          {!usarSalva && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Senha do portal
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pr-10 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              disabled={pending || (!usarSalva && password.length < 4)}
              onClick={() =>
                onConfirm({
                  email: email || undefined,
                  password: usarSalva ? undefined : password,
                  usarSenhaSalva: usarSalva,
                })
              }
              className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40 transition flex items-center justify-center gap-2"
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Entrar e atualizar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card de Fornecedor ───────────────────────────────────────────────────────
function CardFornecedor({ config, onRefresh }: { config: any; onRefresh: () => void }) {
  const { confirm: confirmAction, confirmDialog } = useConfirm();
  const [showLog, setShowLog] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  const aprovarTos = trpc.scraperAgent.atualizarCredenciais.useMutation({
    onSuccess: () => {
      toast.success("Termos de uso registrados como aprovados para este fornecedor.");
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const executar = trpc.scraperAgent.executar.useMutation({
    onSuccess: () => {
      toast.success("Login confirmado — captura iniciada!");
      setShowLogin(false);
      setTimeout(onRefresh, 2000);
    },
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

      {/* Governança: sem termos aprovados a captura não roda */}
      {!config.tosAprovado && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-2">
          <span className="text-[11px] text-amber-800">
            Termos de uso do site ainda não revisados — a captura está bloqueada.
          </span>
          <button
            onClick={async () => {
              const ok = await confirmAction({
                title: "Aprovar termos de uso deste fornecedor?",
                description:
                  "Confirme que os termos de uso do site foram revisados e que a coleta automática de preços está autorizada (empresa é cliente cadastrado do fornecedor).",
                confirmLabel: "Aprovar",
                destructive: false,
              });
              if (ok) aprovarTos.mutate({ id: config.id, tosAprovado: true });
            }}
            className="text-[11px] font-semibold text-amber-900 underline whitespace-nowrap"
          >
            Revisei e aprovo
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        {[
          { label: "Raspados", value: config.productsScrapedCount ?? 0 },
          { label: "Atualizados", value: config.productsUpdatedCount ?? 0 },
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
          onClick={() => setShowLogin(true)}
          disabled={isRunning || executar.isPending}
          className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-lg py-2 text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
        >
          {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {isRunning ? "Executando..." : "Atualizar Agora"}
        </button>
        {showLogin && (
          <LoginDialog
            config={config}
            onClose={() => setShowLogin(false)}
            pending={executar.isPending}
            onConfirm={(creds) => executar.mutate({ scraperConfigId: config.id, ...creds })}
          />
        )}
        <button
          onClick={async () => {
            const ok = await confirmAction({
              title: `Remover a configuração de "${config.scraperType}"?`,
              description: "A configuração de scraping, as credenciais salvas e o histórico de agendamento deste fornecedor serão apagados. Esta ação não pode ser desfeita.",
              confirmLabel: "Remover",
            });
            if (ok) deletar.mutate({ id: config.id });
          }}
          disabled={isRunning || deletar.isPending}
          title="Remover fornecedor"
          className="flex items-center justify-center gap-2 border border-red-200 text-red-600 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-red-50 disabled:opacity-40 transition"
        >
          {deletar.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        </button>
      </div>
      {confirmDialog}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ScraperFornecedores() {
  const [showModal, setShowModal] = useState(false);

  const [showRecadastro, setShowRecadastro] = useState(false);

  const { data: configs = [], refetch, isLoading } = trpc.scraperAgent.listar.useQuery();
  const executarTodos = trpc.scraperAgent.executarTodos.useMutation({
    onSuccess: (r) => { toast.success(r.message); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  // Banner + botão de recadastro quando há fornecedor falhado
  const temFalha = (configs as any[]).some((c: any) => c.lastRunStatus === "failed" || !c.lastRunAt);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
              <Bot size={20} className="text-emerald-400" />
            </div>
            <h1 className="text-xl font-black text-gray-900">Agente de Captura de Catálogo</h1>
          </div>
          <p className="text-sm text-gray-500 ml-13">
            Acessa o site do fornecedor com login, varre o catálogo completo e cadastra
            automaticamente todos os produtos — características, fotos e preços
          </p>
        </div>
        <div className="flex gap-2">
          {temFalha && (
            <button
              onClick={() => setShowRecadastro(true)}
              className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amber-600"
              title="Recadastrar senhas cifradas com a chave antiga e reaprovar termos"
            >
              <Key size={14} /> Recadastrar Credenciais
            </button>
          )}
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
              { icon: Key, title: "1. Login confirmado", desc: "A cada atualização o sistema pede a confirmação do login do fornecedor. A senha fica no cofre com AES-256." },
              { icon: Bot, title: "2. Acesso automático", desc: "O agente entra no site do fornecedor com um navegador real e navega como um operador." },
              { icon: Globe, title: "3. Varredura total", desc: "Percorre todas as páginas do catálogo (10 mil+ produtos), extraindo nome, código, EAN, foto e preço." },
              { icon: RefreshCw, title: "4. Cadastro e atualização", desc: "Produtos já conhecidos têm o preço atualizado; produtos novos são cadastrados automaticamente no catálogo." },
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

      {temFalha && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center gap-3">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-800">
            Há fornecedor(es) com falha registrada — as senhas foram gravadas com a chave de criptografia antiga
            ou os seletores de login precisam de revisão. Clique em <strong>Recadastrar Credenciais</strong> para re-cifrar
            com a chave atual e reaprovar os termos de uso em lote.
          </p>
        </div>
      )}

      {showModal && <ModalCadastro onClose={() => setShowModal(false)} onSaved={refetch} />}
      {showRecadastro && <ModalRecadastroLote onClose={() => setShowRecadastro(false)} onSaved={refetch} />}
    </div>
  );
}
