import { useEffect, useState, useMemo } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  GitMerge,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Zap,
  XCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Tipos ───────────────────────────────────────────────────────────────

interface ScraperExecution {
  id: string;
  supplier: string;
  startTime: Date;
  endTime: Date;
  status: "success" | "failed" | "running" | "pending";
  itemsCollected: number;
  itemsProcessed: number;
  pricesUpdated: number;
  errors: string[];
  duration: number;
}

interface PriceAnalysis {
  product: string;
  supplier: string;
  currentPrice: number;
  previousPrice: number;
  variation: number;
  variationPercent: number;
  trend: "up" | "down" | "stable";
}

interface ProductConsolidation {
  originalCount: number;
  consolidatedCount: number;
  duplicatesFound: number;
  consolidationRate: number;
}

interface SupplierStats {
  supplier: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  averageDuration: number;
  itemsCollected: number;
  lastExecution: Date;
}

// ─── Dados Mock ───────────────────────────────────────────────────────────

const MOCK_EXECUTIONS: ScraperExecution[] = [
  {
    id: "1",
    supplier: "Cristalia",
    startTime: new Date(Date.now() - 3600000),
    endTime: new Date(Date.now() - 3540000),
    status: "success",
    itemsCollected: 1250,
    itemsProcessed: 1250,
    pricesUpdated: 1200,
    errors: [],
    duration: 60,
  },
  {
    id: "2",
    supplier: "Ourofino",
    startTime: new Date(Date.now() - 7200000),
    endTime: new Date(Date.now() - 7080000),
    status: "success",
    itemsCollected: 980,
    itemsProcessed: 980,
    pricesUpdated: 950,
    errors: [],
    duration: 120,
  },
  {
    id: "3",
    supplier: "Tambasa",
    startTime: new Date(Date.now() - 10800000),
    endTime: new Date(Date.now() - 10620000),
    status: "failed",
    itemsCollected: 450,
    itemsProcessed: 450,
    pricesUpdated: 0,
    errors: ["Timeout na conexão", "Falha ao processar 50 itens"],
    duration: 180,
  },
  {
    id: "4",
    supplier: "DrogaVet",
    startTime: new Date(Date.now() - 14400000),
    endTime: new Date(Date.now() - 14160000),
    status: "success",
    itemsCollected: 750,
    itemsProcessed: 750,
    pricesUpdated: 720,
    errors: [],
    duration: 240,
  },
];

const MOCK_PRICE_CHANGES: PriceAnalysis[] = [
  {
    product: "Amoxicilina 500mg",
    supplier: "Cristalia",
    currentPrice: 0.85,
    previousPrice: 0.82,
    variation: 0.03,
    variationPercent: 3.66,
    trend: "up",
  },
  {
    product: "Dipirona 500mg",
    supplier: "Ourofino",
    currentPrice: 0.45,
    previousPrice: 0.48,
    variation: -0.03,
    variationPercent: -6.25,
    trend: "down",
  },
  {
    product: "Vitamina A",
    supplier: "Tambasa",
    currentPrice: 1.20,
    previousPrice: 1.20,
    variation: 0,
    variationPercent: 0,
    trend: "stable",
  },
];

const MOCK_CONSOLIDATION: ProductConsolidation = {
  originalCount: 2500,
  consolidatedCount: 2180,
  duplicatesFound: 320,
  consolidationRate: 87.2,
};

const MOCK_SUPPLIER_STATS: SupplierStats[] = [
  {
    supplier: "Cristalia",
    totalExecutions: 45,
    successfulExecutions: 43,
    failedExecutions: 2,
    successRate: 95.56,
    averageDuration: 65,
    itemsCollected: 54750,
    lastExecution: new Date(Date.now() - 3600000),
  },
  {
    supplier: "Ourofino",
    totalExecutions: 42,
    successfulExecutions: 40,
    failedExecutions: 2,
    successRate: 95.24,
    averageDuration: 115,
    itemsCollected: 41160,
    lastExecution: new Date(Date.now() - 7200000),
  },
  {
    supplier: "Tambasa",
    totalExecutions: 40,
    successfulExecutions: 35,
    failedExecutions: 5,
    successRate: 87.5,
    averageDuration: 180,
    itemsCollected: 30000,
    lastExecution: new Date(Date.now() - 10800000),
  },
  {
    supplier: "DrogaVet",
    totalExecutions: 38,
    successfulExecutions: 36,
    failedExecutions: 2,
    successRate: 94.74,
    averageDuration: 240,
    itemsCollected: 28500,
    lastExecution: new Date(Date.now() - 14400000),
  },
];

// ─── Componentes ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config = {
    success: { bg: "bg-emerald-100", text: "text-emerald-800", icon: CheckCircle2 },
    failed: { bg: "bg-red-100", text: "text-red-800", icon: XCircle },
    running: { bg: "bg-blue-100", text: "text-blue-800", icon: Loader2 },
    pending: { bg: "bg-amber-100", text: "text-amber-800", icon: Clock },
  };
  const cfg = config[status as keyof typeof config] || config.pending;
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.bg} ${cfg.text} gap-1`}>
      <Icon className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function TrendIndicator({ trend, value }: { trend: "up" | "down" | "stable"; value: number }) {
  if (trend === "up") {
    return <span className="text-red-600 flex items-center gap-1"><TrendingUp className="w-4 h-4" />{value.toFixed(2)}%</span>;
  }
  if (trend === "down") {
    return <span className="text-green-600 flex items-center gap-1"><TrendingDown className="w-4 h-4" />{value.toFixed(2)}%</span>;
  }
  return <span className="text-gray-600">Estável</span>;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ─── Página Principal ─────────────────────────────────────────────────────

export default function MonitoringDashboard() {
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7d");
  const [showDetails, setShowDetails] = useState(false);

  const filteredExecutions = useMemo(() => {
    return selectedSupplier === "all"
      ? MOCK_EXECUTIONS
      : MOCK_EXECUTIONS.filter(e => e.supplier === selectedSupplier);
  }, [selectedSupplier]);

  const executionStats = useMemo(() => {
    const total = filteredExecutions.length;
    const successful = filteredExecutions.filter(e => e.status === "success").length;
    const failed = filteredExecutions.filter(e => e.status === "failed").length;
    const totalItems = filteredExecutions.reduce((sum, e) => sum + e.itemsCollected, 0);
    const totalUpdated = filteredExecutions.reduce((sum, e) => sum + e.pricesUpdated, 0);

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) : 0,
      totalItems,
      totalUpdated,
    };
  }, [filteredExecutions]);

  const priceChangeStats = useMemo(() => {
    const up = MOCK_PRICE_CHANGES.filter(p => p.trend === "up").length;
    const down = MOCK_PRICE_CHANGES.filter(p => p.trend === "down").length;
    const stable = MOCK_PRICE_CHANGES.filter(p => p.trend === "stable").length;
    return [
      { name: "Aumento", value: up, fill: "#EF4444" },
      { name: "Redução", value: down, fill: "#10B981" },
      { name: "Estável", value: stable, fill: "#6B7280" },
    ];
  }, []);

  const chartData = useMemo(() => {
    return MOCK_SUPPLIER_STATS.map(s => ({
      supplier: s.supplier,
      successRate: s.successRate,
      averageDuration: s.averageDuration,
      itemsCollected: s.itemsCollected / 1000,
    }));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard de Monitoramento</h1>
            <p className="text-slate-600 mt-1">Acompanhe scrapers, preços e consolidação de produtos em tempo real</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Exportar
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-4 items-center bg-white p-4 rounded-lg border border-slate-200">
          <div className="flex-1">
            <label className="text-sm font-medium text-slate-700 mb-2 block">Fornecedor</label>
            <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Fornecedores</SelectItem>
                <SelectItem value="Cristalia">Cristalia</SelectItem>
                <SelectItem value="Ourofino">Ourofino</SelectItem>
                <SelectItem value="Tambasa">Tambasa</SelectItem>
                <SelectItem value="DrogaVet">DrogaVet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium text-slate-700 mb-2 block">Período</label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Execuções</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{executionStats.total}</div>
              <p className="text-xs text-slate-500 mt-1">
                <span className="text-green-600 font-semibold">{executionStats.successful}</span> sucesso
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Taxa de Sucesso</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{executionStats.successRate}%</div>
              <p className="text-xs text-slate-500 mt-1">
                <span className="text-red-600 font-semibold">{executionStats.failed}</span> falhas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Itens Coletados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{executionStats.totalItems.toLocaleString()}</div>
              <p className="text-xs text-slate-500 mt-1">
                <span className="text-blue-600 font-semibold">{executionStats.totalUpdated}</span> preços atualizados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Consolidação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{MOCK_CONSOLIDATION.consolidationRate.toFixed(1)}%</div>
              <p className="text-xs text-slate-500 mt-1">
                <span className="text-amber-600 font-semibold">{MOCK_CONSOLIDATION.duplicatesFound}</span> duplicatas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Variações de Preço</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{MOCK_PRICE_CHANGES.length}</div>
              <p className="text-xs text-slate-500 mt-1">
                <span className="text-red-600 font-semibold">
                  {MOCK_PRICE_CHANGES.filter(p => p.trend === "up").length}
                </span> aumentos
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="executions" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="executions">Execuções</TabsTrigger>
            <TabsTrigger value="prices">Preços</TabsTrigger>
            <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
            <TabsTrigger value="consolidation">Consolidação</TabsTrigger>
          </TabsList>

          {/* Execuções */}
          <TabsContent value="executions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Histórico de Execuções
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredExecutions.map(exec => (
                    <div key={exec.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{exec.supplier}</h3>
                          <p className="text-sm text-slate-500">{formatDate(exec.startTime)}</p>
                        </div>
                        <StatusBadge status={exec.status} />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-slate-600">Duração</p>
                          <p className="font-semibold text-slate-900">{formatDuration(exec.duration)}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">Itens Coletados</p>
                          <p className="font-semibold text-slate-900">{exec.itemsCollected}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">Processados</p>
                          <p className="font-semibold text-slate-900">{exec.itemsProcessed}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">Preços Atualizados</p>
                          <p className="font-semibold text-slate-900">{exec.pricesUpdated}</p>
                        </div>
                      </div>
                      {exec.errors.length > 0 && (
                        <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                          <p className="font-semibold flex items-center gap-1 mb-1">
                            <AlertCircle className="w-4 h-4" />
                            Erros ({exec.errors.length})
                          </p>
                          <ul className="list-disc list-inside space-y-1">
                            {exec.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preços */}
          <TabsContent value="prices" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Variações de Preço
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {MOCK_PRICE_CHANGES.map((change, i) => (
                      <div key={i} className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-slate-900">{change.product}</p>
                            <p className="text-xs text-slate-500">{change.supplier}</p>
                          </div>
                          <TrendIndicator trend={change.trend} value={Math.abs(change.variationPercent)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-slate-600">Preço Anterior</p>
                            <p className="font-semibold">R$ {change.previousPrice.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-slate-600">Preço Atual</p>
                            <p className="font-semibold">R$ {change.currentPrice.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={priceChangeStats}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, value }) => `${name}: ${value}`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {priceChangeStats.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fornecedores */}
          <TabsContent value="suppliers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Desempenho de Fornecedores
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="supplier" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="successRate" fill="#10B981" name="Taxa de Sucesso (%)" />
                      <Bar dataKey="itemsCollected" fill="#3B82F6" name="Itens Coletados (K)" />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {MOCK_SUPPLIER_STATS.map(stat => (
                      <div key={stat.supplier} className="border border-slate-200 rounded-lg p-4">
                        <h3 className="font-semibold text-slate-900 mb-3">{stat.supplier}</h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Taxa de Sucesso</span>
                            <span className="font-semibold text-green-600">{stat.successRate.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Execuções</span>
                            <span className="font-semibold">{stat.totalExecutions}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Duração Média</span>
                            <span className="font-semibold">{formatDuration(stat.averageDuration)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Itens Coletados</span>
                            <span className="font-semibold">{stat.itemsCollected.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Última Execução</span>
                            <span className="font-semibold text-blue-600">{formatDate(stat.lastExecution)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Consolidação */}
          <TabsContent value="consolidation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitMerge className="w-5 h-5" />
                  Status de Consolidação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="border border-slate-200 rounded-lg p-4">
                      <p className="text-sm text-slate-600 mb-2">Produtos Originais</p>
                      <p className="text-3xl font-bold text-slate-900">{MOCK_CONSOLIDATION.originalCount}</p>
                    </div>
                    <div className="border border-slate-200 rounded-lg p-4">
                      <p className="text-sm text-slate-600 mb-2">Produtos Consolidados</p>
                      <p className="text-3xl font-bold text-green-600">{MOCK_CONSOLIDATION.consolidatedCount}</p>
                    </div>
                    <div className="border border-slate-200 rounded-lg p-4">
                      <p className="text-sm text-slate-600 mb-2">Duplicatas Encontradas</p>
                      <p className="text-3xl font-bold text-amber-600">{MOCK_CONSOLIDATION.duplicatesFound}</p>
                    </div>
                    <div className="border border-slate-200 rounded-lg p-4 bg-emerald-50">
                      <p className="text-sm text-slate-600 mb-2">Taxa de Consolidação</p>
                      <p className="text-3xl font-bold text-emerald-600">{MOCK_CONSOLIDATION.consolidationRate.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-32 h-32 rounded-full border-8 border-emerald-200 flex items-center justify-center mx-auto mb-4">
                        <div className="text-center">
                          <p className="text-3xl font-bold text-emerald-600">{MOCK_CONSOLIDATION.consolidationRate.toFixed(0)}%</p>
                          <p className="text-xs text-slate-600">Consolidado</p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600">
                        {MOCK_CONSOLIDATION.originalCount - MOCK_CONSOLIDATION.consolidatedCount} produtos removidos como duplicatas
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
