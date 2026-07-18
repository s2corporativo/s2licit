import { useState, useMemo } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CheckCircle,
  Clock,
  Download,
  Edit2,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/format";

type EntryType = "income" | "expense";
type IsPaid = "yes" | "no";
type ActiveTab = "entries" | "freight" | "reports";

const INCOME_CATEGORIES = [
  "Proposta Aprovada",
  "Entrega Realizada",
  "Adiantamento",
  "Outros",
];
const EXPENSE_CATEGORIES = [
  "Frete",
  "Fornecedor",
  "Impostos",
  "Operacional",
  "Marketing",
  "Outros",
];

const formatCurrency = formatBRL;

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="border border-gray-200 p-5 bg-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{formatCurrency(value)}</p>
          {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`${color} opacity-60`}>{icon}</div>
      </div>
    </div>
  );
}

function EntryModal({
  entry,
  onClose,
}: {
  entry?: any;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const isEdit = !!entry;
  const [form, setForm] = useState({
    type: (entry?.type ?? "income") as EntryType,
    category: entry?.category ?? "",
    description: entry?.description ?? "",
    amount: entry?.amount ? String(entry.amount) : "",
    isPaid: (entry?.isPaid ?? "no") as IsPaid,
    notes: entry?.notes ?? "",
  });

  const create = trpc.financial.create.useMutation({
    onSuccess: () => {
      utils.financial.list.invalidate();
      utils.financial.summary.invalidate();
      onClose();
    },
  });
  const update = trpc.financial.update.useMutation({
    onSuccess: () => {
      utils.financial.list.invalidate();
      utils.financial.summary.invalidate();
      onClose();
    },
  });

  const categories = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSubmit = () => {
    if (!form.description || !form.amount) return;
    if (isEdit) {
      update.mutate({ id: entry.id, ...form });
    } else {
      create.mutate(form);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-bold uppercase tracking-widest">
            {isEdit ? "Editar Lançamento" : "Novo Lançamento"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Tipo</label>
            <div className="flex gap-2">
              {(["income", "expense"] as EntryType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, type: t, category: "" }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-widest border transition-colors ${
                    form.type === t
                      ? t === "income"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-blue-800 text-white border-blue-800"
                      : "border-gray-200 text-gray-600 hover:border-gray-900"
                  }`}
                >
                  {t === "income" ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
                  {t === "income" ? "Receita" : "Despesa"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Categoria</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
            >
              <option value="">Selecionar categoria...</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
              Descrição <span className="text-blue-700">*</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              placeholder="Descrição do lançamento"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
              Valor (R$) <span className="text-blue-700">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900"
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Situação</label>
            <div className="flex gap-2">
              {(["no", "yes"] as IsPaid[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setForm((f) => ({ ...f, isPaid: v }))}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-widest border transition-colors ${
                    form.isPaid === v
                      ? "bg-gray-900 text-white border-gray-900"
                      : "border-gray-200 text-gray-600 hover:border-gray-900"
                  }`}
                >
                  {v === "yes" ? <CheckCircle size={12} /> : <Clock size={12} />}
                  {v === "yes" ? "Pago/Recebido" : "Pendente"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Observações</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-900 resize-none"
              rows={2}
              placeholder="Observações opcionais..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 hover:border-gray-900 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={create.isPending || update.isPending || !form.description || !form.amount}
            className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-blue-800 text-white hover:bg-blue-900 transition-colors disabled:opacity-50"
          >
            {create.isPending || update.isPending ? "Salvando..." : isEdit ? "Salvar" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryRow({ entry, onEdit }: { entry: any; onEdit: (e: any) => void }) {
  const utils = trpc.useUtils();
  const [confirm, setConfirm] = useState(false);
  const del = trpc.financial.delete.useMutation({
    onSuccess: () => {
      utils.financial.list.invalidate();
      utils.financial.summary.invalidate();
    },
  });
  const togglePaid = trpc.financial.update.useMutation({
    onSuccess: () => {
      utils.financial.list.invalidate();
      utils.financial.summary.invalidate();
    },
  });

  const isIncome = entry.type === "income";
  const isPaid = entry.isPaid === "yes";

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 group">
      <div className={`shrink-0 ${isIncome ? "text-green-600" : "text-blue-700"}`}>
        {isIncome ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 truncate">{entry.description}</p>
          {entry.category && (
            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5">{entry.category}</span>
          )}
        </div>
        <p className="text-[11px] text-gray-400">
          {new Date(entry.createdAt).toLocaleDateString("pt-BR")}
          {entry.notes ? ` · ${entry.notes}` : ""}
        </p>
      </div>
      <div className={`text-right shrink-0 w-28 font-bold text-sm ${isIncome ? "text-green-700" : "text-blue-800"}`}>
        {isIncome ? "+" : "-"}{formatCurrency(parseFloat(String(entry.amount ?? 0)))}
      </div>
      <button
        onClick={() => togglePaid.mutate({ id: entry.id, isPaid: isPaid ? "no" : "yes" })}
        title={isPaid ? "Marcar como pendente" : "Marcar como pago"}
        className={`shrink-0 transition-colors ${isPaid ? "text-green-600 hover:text-gray-400" : "text-gray-300 hover:text-green-600"}`}
      >
        <CheckCircle size={16} />
      </button>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onEdit(entry)} className="p-1 text-gray-400 hover:text-gray-900">
          <Edit2 size={12} />
        </button>
        {confirm ? (
          <div className="flex items-center gap-1">
            <button onClick={() => del.mutate({ id: entry.id })} className="text-[10px] text-blue-800 font-bold hover:text-blue-800">Sim</button>
            <button onClick={() => setConfirm(false)} className="text-[10px] text-gray-500 hover:text-gray-900">Não</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="p-1 text-gray-400 hover:text-blue-800">
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

type PeriodFilter = "all" | "month" | "quarter" | "year";

function getPeriodDates(period: PeriodFilter): { dateFrom?: Date; dateTo?: Date } {
  if (period === "all") return {};
  const now = new Date();
  const dateTo = new Date(now);
  dateTo.setHours(23, 59, 59, 999);
  let dateFrom = new Date(now);
  if (period === "month") {
    dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    dateFrom = new Date(now.getFullYear(), q * 3, 1);
  } else if (period === "year") {
    dateFrom = new Date(now.getFullYear(), 0, 1);
  }
  dateFrom.setHours(0, 0, 0, 0);
  return { dateFrom, dateTo };
}

// ─── Financial Reports Tab ──────────────────────────────────────────────────
type FinancialEntry = {
  id: number;
  type: string;
  amount: string | number | null;
  description: string;
  category: string | null;
  isPaid: string;
  createdAt: Date;
  notes?: string | null;
};

function FinancialReportsTab({ entries }: { entries: FinancialEntry[] }) {
  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  // Group by month
  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    for (const e of entries) {
      const d = new Date(e.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      if (!map.has(key)) map.set(key, { month: label, income: 0, expense: 0 });
      const val = parseFloat(String(e.amount ?? 0));
      const row = map.get(key)!;
      if (e.type === "income") row.income += val;
      else row.expense += val;
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([, v]) => v);
  }, [entries]);

  // Group by category
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries.filter((e) => e.type === "expense")) {
      const cat = e.category ?? "Outros";
      map.set(cat, (map.get(cat) ?? 0) + parseFloat(String(e.amount ?? 0)));
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }));
  }, [entries]);

  const COLORS = ["#DC2626", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

  const totalIncome = entries.filter((e) => e.type === "income").reduce((s, e) => s + parseFloat(String(e.amount ?? 0)), 0);
  const totalExpense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + parseFloat(String(e.amount ?? 0)), 0);

  const exportCSV = () => {
    const header = "Data,Tipo,Descrição,Categoria,Valor,Pago\n";
    const rows = entries
      .map((e) => [
        new Date(e.createdAt).toLocaleDateString("pt-BR"),
        e.type === "income" ? "Receita" : "Despesa",
        `"${e.description.replace(/"/g, '""')}"`,
        e.category ?? "",
        parseFloat(String(e.amount ?? 0)).toFixed(2).replace(".", ","),
        e.isPaid === "yes" ? "Sim" : "Não",
      ].join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-gray-200 p-4">
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Total Receitas</div>
          <div className="text-xl font-black text-green-700">{fmt(totalIncome)}</div>
        </div>
        <div className="border border-gray-200 p-4">
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Total Despesas</div>
          <div className="text-xl font-black text-blue-900">{fmt(totalExpense)}</div>
        </div>
        <div className={`border p-4 ${totalIncome - totalExpense >= 0 ? "border-green-300 bg-green-50" : "border-blue-300 bg-blue-50"}`}>
          <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Saldo</div>
          <div className={`text-xl font-black ${totalIncome - totalExpense >= 0 ? "text-green-700" : "text-blue-900"}`}>{fmt(totalIncome - totalExpense)}</div>
        </div>
      </div>

      {/* Receitas vs Despesas por mês */}
      <div className="border border-gray-200 p-5">
        <h3 className="text-xs font-bold tracking-widest uppercase text-gray-500 mb-4">Receitas vs Despesas por Mês</h3>
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 0 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="income" name="Receitas" stroke="#10B981" fill="url(#colorIncome)" strokeWidth={2} />
              <Area type="monotone" dataKey="expense" name="Despesas" stroke="#EF4444" fill="url(#colorExpense)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="py-10 text-center text-xs text-gray-400">Nenhum dado disponível</div>
        )}
      </div>

      {/* Despesas por categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-gray-200 p-5">
          <h3 className="text-xs font-bold tracking-widest uppercase text-gray-500 mb-4">Despesas por Categoria</h3>
          {categoryData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                    {categoryData.map((_, idx) => (
                      <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 0 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {categoryData.slice(0, 6).map((c, idx) => (
                  <div key={c.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-xs text-gray-600 truncate max-w-[100px]">{c.name}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-900">{fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-gray-400">Nenhuma despesa registrada</div>
          )}
        </div>

        {/* Exportação */}
        <div className="border border-gray-200 p-5">
          <h3 className="text-xs font-bold tracking-widest uppercase text-gray-500 mb-4">Exportar Dados</h3>
          <div className="space-y-3">
            <button
              onClick={exportCSV}
              className="w-full flex items-center gap-3 border border-gray-200 p-4 hover:border-gray-900 hover:bg-gray-50 transition-all text-left"
            >
              <Download size={16} className="text-green-600 flex-shrink-0" />
              <div>
                <div className="text-xs font-bold text-gray-900">Exportar para Excel/CSV</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{entries.length} lançamentos · Abre em Excel, Google Sheets</div>
              </div>
            </button>
            <div className="text-[10px] text-gray-400 p-3 bg-gray-50 border border-gray-100">
              <strong>Dica:</strong> Para exportar em PDF, use a função de impressão do navegador (Ctrl+P) e selecione "Salvar como PDF".
              Os gráficos acima serão incluídos na impressão.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Freight Report Tab ───────────────────────────────────────────────────────
function FreightReportTab() {
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const periodDates = useMemo(() => getPeriodDates(period), [period]);
  const { data: report, isLoading } = trpc.financial.freightReport.useQuery(periodDates);

  const PERIODS: { key: PeriodFilter; label: string }[] = [
    { key: "month", label: "Este mês" },
    { key: "quarter", label: "Este trimestre" },
    { key: "year", label: "Este ano" },
    { key: "all", label: "Todo período" },
  ];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex gap-0 border border-gray-200 w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 text-xs font-semibold border-r border-gray-200 last:border-r-0 transition-colors ${
              period === p.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="border border-gray-200 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Total de Fretes</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{formatCurrency(report?.total ?? 0)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{(report?.items ?? []).length} proposta{(report?.items ?? []).length !== 1 ? "s" : ""}</p>
        </div>
        <div className="border border-gray-200 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Fretes Pagos</p>
          <p className="text-2xl font-bold mt-1 text-blue-800">{formatCurrency(report?.totalPaid ?? 0)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {report?.total ? Math.round(((report.totalPaid ?? 0) / report.total) * 100) : 0}% do total
          </p>
        </div>
        <div className="border border-gray-200 p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">A Pagar</p>
          <p className="text-2xl font-bold mt-1 text-yellow-700">
            {formatCurrency((report?.total ?? 0) - (report?.totalPaid ?? 0))}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">Fretes pendentes</p>
        </div>
      </div>

      {/* By carrier table */}
      <div className="border border-gray-200">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Por Transportadora</p>
          <p className="text-[11px] text-gray-400">{(report?.byCarrier ?? []).length} transportadora{(report?.byCarrier ?? []).length !== 1 ? "s" : ""}</p>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-sm text-gray-500">Carregando...</div>
        ) : (report?.byCarrier ?? []).length === 0 ? (
          <div className="text-center py-12">
            <Truck size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-500">Nenhum frete registrado neste período.</p>
            <p className="text-xs text-gray-400 mt-1">Fretes são registrados ao editar uma proposta em Adm. Propostas.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100">
              <span className="col-span-2">Transportadora</span>
              <span className="text-right">Propostas</span>
              <span className="text-right">Total</span>
              <span className="text-right">Pago</span>
            </div>
            {(report?.byCarrier ?? []).map((c) => (
              <div key={c.carrier} className="grid grid-cols-5 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 items-center">
                <div className="col-span-2 flex items-center gap-2">
                  <Truck size={14} className="text-gray-400 shrink-0" />
                  <span className="text-sm font-semibold text-gray-900">{c.carrier}</span>
                </div>
                <span className="text-right text-sm text-gray-600">{c.count}</span>
                <span className="text-right text-sm font-bold text-gray-900">{formatCurrency(c.total)}</span>
                <span className="text-right text-sm text-green-700 font-semibold">{formatCurrency(c.paid)}</span>
              </div>
            ))}
            <div className="grid grid-cols-5 px-4 py-2 bg-gray-50 border-t border-gray-200 text-[11px] font-bold text-gray-700">
              <span className="col-span-2">TOTAL</span>
              <span className="text-right">{(report?.items ?? []).length}</span>
              <span className="text-right">{formatCurrency(report?.total ?? 0)}</span>
              <span className="text-right text-green-700">{formatCurrency(report?.totalPaid ?? 0)}</span>
            </div>
          </>
        )}
      </div>

      {/* Detailed list */}
      {(report?.items ?? []).length > 0 && (
        <div className="border border-gray-200">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Detalhamento por Proposta</p>
          </div>
          <div className="grid grid-cols-5 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100">
            <span className="col-span-2">Proposta</span>
            <span>Transportadora</span>
            <span>Rastreio</span>
            <span className="text-right">Frete</span>
          </div>
          {(report?.items ?? []).map((item) => (
            <div key={item.id} className="grid grid-cols-5 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 items-center gap-2">
              <div className="col-span-2 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.title}</p>
                {item.deliveredAt && (
                  <p className="text-[11px] text-gray-400">
                    Entregue: {new Date(item.deliveredAt).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
              <span className="text-xs text-gray-600 truncate">{item.freightCarrier ?? "—"}</span>
              <span className="text-xs text-gray-500 truncate font-mono">{item.freightTrackingCode ?? "—"}</span>
              <div className="text-right">
                <span className="text-sm font-bold text-blue-800">{formatCurrency(parseFloat(String(item.freightValue ?? 0)))}</span>
                {item.freightPaidAt && (
                  <p className="text-[10px] text-green-600">Pago</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ControleFinanceiro() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("entries");
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [paidFilter, setPaidFilter] = useState<"all" | "yes" | "no">("all");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editEntry, setEditEntry] = useState<any>(null);

  const periodDates = useMemo(() => getPeriodDates(period), [period]);
  const { data: entries, isLoading } = trpc.financial.list.useQuery(undefined);
  const { data: summary } = trpc.financial.summary.useQuery(periodDates);

  const filtered = useMemo(() => {
    if (!entries) return [];
    let result = entries;
    if (periodDates.dateFrom) {
      result = result.filter((e) => new Date(e.createdAt) >= periodDates.dateFrom!);
    }
    if (periodDates.dateTo) {
      result = result.filter((e) => new Date(e.createdAt) <= periodDates.dateTo!);
    }
    if (typeFilter !== "all") result = result.filter((e) => e.type === typeFilter);
    if (paidFilter !== "all") result = result.filter((e) => e.isPaid === paidFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          (e.category ?? "").toLowerCase().includes(q) ||
          (e.notes ?? "").toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [entries, periodDates, typeFilter, paidFilter, search]);

  const PERIODS: { key: PeriodFilter; label: string }[] = [
    { key: "month", label: "Este mês" },
    { key: "quarter", label: "Este trimestre" },
    { key: "year", label: "Este ano" },
    { key: "all", label: "Todo período" },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold uppercase tracking-widest text-gray-900">
              Controle Financeiro
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Receitas, despesas, saldo e relatório de fretes
            </p>
          </div>
          {activeTab === "entries" && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-blue-800 text-white px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-blue-900 transition-colors"
            >
              <Plus size={14} />
              Novo Lançamento
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 px-6">
        <div className="max-w-6xl mx-auto flex gap-0">
          {([
            { key: "entries" as ActiveTab, label: "Lançamentos", icon: <TrendingUp size={13} /> },
            { key: "freight" as ActiveTab, label: "Relatório de Frete", icon: <Truck size={13} /> },
            { key: "reports" as ActiveTab, label: "Gráficos & Exportação", icon: <BarChart3 size={13} /> },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-800 text-blue-800"
                  : "border-transparent text-gray-500 hover:text-gray-900"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {activeTab === "freight" ? (
          <FreightReportTab />
        ) : activeTab === "reports" ? (
          <FinancialReportsTab entries={entries ?? []} />
        ) : (
          <>
            {/* Period selector */}
            <div className="flex gap-0 border border-gray-200 w-fit">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-4 py-2 text-xs font-semibold border-r border-gray-200 last:border-r-0 transition-colors ${
                    period === p.key ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard
                title="Receitas"
                value={summary?.totalIncome ?? 0}
                subtitle={`R$ ${(summary?.paidIncome ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} recebido`}
                icon={<TrendingUp size={24} />}
                color="text-green-700"
              />
              <SummaryCard
                title="Despesas"
                value={summary?.totalExpense ?? 0}
                subtitle={`R$ ${(summary?.paidExpense ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pago`}
                icon={<TrendingDown size={24} />}
                color="text-blue-800"
              />
              <SummaryCard
                title="Saldo"
                value={summary?.balance ?? 0}
                subtitle="Receitas − Despesas"
                icon={(summary?.balance ?? 0) >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                color={(summary?.balance ?? 0) >= 0 ? "text-green-700" : "text-blue-800"}
              />
              <SummaryCard
                title="A Receber"
                value={summary?.pendingIncome ?? 0}
                subtitle={`A pagar: R$ ${(summary?.pendingExpense ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                icon={<Clock size={24} />}
                color="text-yellow-700"
              />
            </div>

            {/* Progress bar */}
            {(summary?.totalIncome ?? 0) > 0 && (
              <div className="border border-gray-200 p-4">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                  <span>Receitas recebidas</span>
                  <span>
                    {summary?.totalIncome
                      ? Math.round((summary.paidIncome / summary.totalIncome) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600 transition-all"
                    style={{
                      width: `${summary?.totalIncome ? Math.min(100, (summary.paidIncome / summary.totalIncome) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>{formatCurrency(summary?.paidIncome ?? 0)} recebido</span>
                  <span>{formatCurrency(summary?.pendingIncome ?? 0)} pendente</span>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 border border-gray-200 px-3 py-2 flex-1 min-w-48">
                <Search size={13} className="text-gray-400 shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar lançamento..."
                  className="flex-1 text-sm focus:outline-none"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-900">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex gap-0 border border-gray-200">
                {(["all", "income", "expense"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    className={`px-3 py-2 text-xs font-semibold border-r border-gray-200 last:border-r-0 transition-colors ${
                      typeFilter === t ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {t === "all" ? "Todos" : t === "income" ? "Receitas" : "Despesas"}
                  </button>
                ))}
              </div>
              <div className="flex gap-0 border border-gray-200">
                {(["all", "yes", "no"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setPaidFilter(v)}
                    className={`px-3 py-2 text-xs font-semibold border-r border-gray-200 last:border-r-0 transition-colors ${
                      paidFilter === v ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {v === "all" ? "Todos" : v === "yes" ? "Pagos" : "Pendentes"}
                  </button>
                ))}
              </div>
            </div>

            {/* Entries list */}
            <div className="border border-gray-200">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Lançamentos</p>
                <p className="text-[11px] text-gray-400">
                  {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
                </p>
              </div>
              {isLoading ? (
                <div className="text-center py-8 text-sm text-gray-500">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp size={32} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-sm text-gray-500">
                    {search || typeFilter !== "all" || paidFilter !== "all"
                      ? "Nenhum lançamento encontrado com os filtros aplicados."
                      : "Nenhum lançamento registrado neste período."}
                  </p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="mt-3 text-xs text-blue-800 underline"
                  >
                    Adicionar primeiro lançamento
                  </button>
                </div>
              ) : (
                filtered.map((e) => (
                  <EntryRow key={e.id} entry={e} onEdit={(entry) => { setEditEntry(entry); setShowModal(true); }} />
                ))
              )}
            </div>

            {/* Totals footer */}
            {filtered.length > 0 && (
              <div className="flex justify-end gap-6 text-sm border-t border-gray-200 pt-4">
                <span className="text-green-700 font-semibold">
                  + {formatCurrency(filtered.filter((e) => e.type === "income").reduce((s, e) => s + parseFloat(String(e.amount ?? 0)), 0))}
                </span>
                <span className="text-blue-800 font-semibold">
                  − {formatCurrency(filtered.filter((e) => e.type === "expense").reduce((s, e) => s + parseFloat(String(e.amount ?? 0)), 0))}
                </span>
                <span className="font-bold text-gray-900">
                  = {formatCurrency(
                    filtered.reduce((s, e) => s + (e.type === "income" ? 1 : -1) * parseFloat(String(e.amount ?? 0)), 0)
                  )}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <EntryModal
          entry={editEntry}
          onClose={() => { setShowModal(false); setEditEntry(null); }}
        />
      )}
    </div>
  );
}
