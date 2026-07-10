import { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  LineChart as LineChartIcon,
  Download,
  Filter,
  Calendar,
  DollarSign,
  Zap,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
  AreaChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Tipos ───────────────────────────────────────────────────────────────

interface PriceHistory {
  date: string;
  product: string;
  supplier: string;
  price: number;
  quantity: number;
}

interface SupplierComparison {
  product: string;
  suppliers: {
    name: string;
    price: number;
    variation: number;
    lastUpdate: string;
  }[];
  bestPrice: number;
  worstPrice: number;
  avgPrice: number;
}

interface PriceAlert {
  id: string;
  product: string;
  supplier: string;
  currentPrice: number;
  threshold: number;
  type: "above" | "below";
  severity: "low" | "medium" | "high";
}

// ─── Dados Mock ───────────────────────────────────────────────────────────

const MOCK_PRICE_HISTORY: PriceHistory[] = [
  { date: "2026-04-01", product: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.80, quantity: 1000 },
  { date: "2026-04-02", product: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.82, quantity: 1000 },
  { date: "2026-04-03", product: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.81, quantity: 1000 },
  { date: "2026-04-04", product: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.85, quantity: 1000 },
  { date: "2026-04-05", product: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.85, quantity: 1000 },
  { date: "2026-04-06", product: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.87, quantity: 1000 },
  { date: "2026-04-07", product: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.86, quantity: 1000 },
  { date: "2026-04-08", product: "Amoxicilina 500mg", supplier: "Cristalia", price: 0.85, quantity: 1000 },
];

const MOCK_SUPPLIER_COMPARISON: SupplierComparison[] = [
  {
    product: "Amoxicilina 500mg",
    suppliers: [
      { name: "Cristalia", price: 0.85, variation: 6.25, lastUpdate: "2026-04-08 14:30" },
      { name: "Ourofino", price: 0.82, variation: 2.5, lastUpdate: "2026-04-08 15:00" },
      { name: "Tambasa", price: 0.88, variation: -3.4, lastUpdate: "2026-04-08 13:45" },
      { name: "DrogaVet", price: 0.80, variation: 0, lastUpdate: "2026-04-08 16:15" },
    ],
    bestPrice: 0.80,
    worstPrice: 0.88,
    avgPrice: 0.84,
  },
  {
    product: "Dipirona 500mg",
    suppliers: [
      { name: "Cristalia", price: 0.45, variation: 0, lastUpdate: "2026-04-08 14:30" },
      { name: "Ourofino", price: 0.48, variation: 6.67, lastUpdate: "2026-04-08 15:00" },
      { name: "Tambasa", price: 0.46, variation: 2.22, lastUpdate: "2026-04-08 13:45" },
      { name: "DrogaVet", price: 0.47, variation: 4.44, lastUpdate: "2026-04-08 16:15" },
    ],
    bestPrice: 0.45,
    worstPrice: 0.48,
    avgPrice: 0.465,
  },
];

const MOCK_PRICE_ALERTS: PriceAlert[] = [
  {
    id: "1",
    product: "Amoxicilina 500mg",
    supplier: "Cristalia",
    currentPrice: 0.85,
    threshold: 0.80,
    type: "above",
    severity: "high",
  },
  {
    id: "2",
    product: "Dipirona 500mg",
    supplier: "Ourofino",
    currentPrice: 0.48,
    threshold: 0.45,
    type: "above",
    severity: "medium",
  },
  {
    id: "3",
    product: "Vitamina A",
    supplier: "Tambasa",
    currentPrice: 1.15,
    threshold: 1.30,
    type: "below",
    severity: "low",
  },
];

// ─── Componentes ─────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const config = {
    high: { bg: "bg-red-100", text: "text-red-800" },
    medium: { bg: "bg-amber-100", text: "text-amber-800" },
    low: { bg: "bg-blue-100", text: "text-blue-800" },
  };
  const cfg = config[severity as keyof typeof config] || config.low;
  return (
    <Badge className={`${cfg.bg} ${cfg.text}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </Badge>
  );
}

function TrendBadge({ variation }: { variation: number }) {
  if (variation > 0) {
    return (
      <span className="flex items-center gap-1 text-red-600 font-semibold">
        <TrendingUp className="w-4 h-4" />
        +{variation.toFixed(2)}%
      </span>
    );
  }
  if (variation < 0) {
    return (
      <span className="flex items-center gap-1 text-green-600 font-semibold">
        <TrendingDown className="w-4 h-4" />
        {variation.toFixed(2)}%
      </span>
    );
  }
  return <span className="text-gray-600 font-semibold">Estável</span>;
}

// ─── Página Principal ─────────────────────────────────────────────────────

export default function PriceAnalyticsDashboard() {
  const [selectedProduct, setSelectedProduct] = useState<string>("Amoxicilina 500mg");
  const [dateRange, setDateRange] = useState<string>("7d");

  const priceData = useMemo(() => {
    return MOCK_PRICE_HISTORY.filter(h => h.product === selectedProduct).map(h => ({
      date: h.date,
      price: h.price,
      supplier: h.supplier,
    }));
  }, [selectedProduct]);

  const comparisonData = useMemo(() => {
    return MOCK_SUPPLIER_COMPARISON.find(c => c.product === selectedProduct);
  }, [selectedProduct]);

  const chartData = useMemo(() => {
    if (!comparisonData) return [];
    return comparisonData.suppliers.map(s => ({
      supplier: s.name,
      price: s.price,
      variation: s.variation,
    }));
  }, [comparisonData]);

  const statistics = useMemo(() => {
    if (!comparisonData) return null;
    const prices = comparisonData.suppliers.map(s => s.price);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceRange = maxPrice - minPrice;
    const priceRangePercent = (priceRange / avgPrice) * 100;

    return {
      avgPrice,
      maxPrice,
      minPrice,
      priceRange,
      priceRangePercent,
    };
  }, [comparisonData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Análise de Preços</h1>
            <p className="text-slate-600 mt-1">Histórico, comparações e alertas de variação de preços</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-4 items-center bg-white p-4 rounded-lg border border-slate-200">
          <div className="flex-1">
            <label className="text-sm font-medium text-slate-700 mb-2 block">Produto</label>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Amoxicilina 500mg">Amoxicilina 500mg</SelectItem>
                <SelectItem value="Dipirona 500mg">Dipirona 500mg</SelectItem>
                <SelectItem value="Vitamina A">Vitamina A</SelectItem>
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
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPIs */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Preço Médio</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">R$ {statistics.avgPrice.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Preço Mínimo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">R$ {statistics.minPrice.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Preço Máximo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">R$ {statistics.maxPrice.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Variação</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">R$ {statistics.priceRange.toFixed(2)}</div>
                <p className="text-xs text-slate-500 mt-1">{statistics.priceRangePercent.toFixed(1)}% de variação</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Fornecedores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">{comparisonData?.suppliers.length || 0}</div>
                <p className="text-xs text-slate-500 mt-1">Monitorados</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="history" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="comparison">Comparação</TabsTrigger>
            <TabsTrigger value="alerts">Alertas</TabsTrigger>
          </TabsList>

          {/* Histórico */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChartIcon className="w-5 h-5" />
                  Evolução de Preço - {selectedProduct}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={priceData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => `R$ ${typeof value === 'number' ? value.toFixed(2) : value}`} />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#3B82F6"
                      fillOpacity={1}
                      fill="url(#colorPrice)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Comparação */}
          <TabsContent value="comparison" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Comparação de Preços por Fornecedor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="supplier" />
                    <YAxis />
                    <Tooltip formatter={(value) => `R$ ${typeof value === 'number' ? value.toFixed(2) : value}`} />
                    <Bar dataKey="price" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {comparisonData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {comparisonData.suppliers.map(supplier => (
                  <Card key={supplier.name}>
                    <CardHeader>
                      <CardTitle className="text-lg">{supplier.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Preço</span>
                        <span className="text-2xl font-bold text-slate-900">R$ {supplier.price.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Variação</span>
                        <TrendBadge variation={supplier.variation} />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Última Atualização</span>
                        <span className="text-sm text-slate-500">{supplier.lastUpdate}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-200">
                        {supplier.price === comparisonData.bestPrice && (
                          <Badge className="bg-green-100 text-green-800">Melhor Preço</Badge>
                        )}
                        {supplier.price === comparisonData.worstPrice && (
                          <Badge className="bg-red-100 text-red-800">Preço Mais Alto</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Alertas */}
          <TabsContent value="alerts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Alertas de Variação de Preço
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {MOCK_PRICE_ALERTS.map(alert => (
                    <div
                      key={alert.id}
                      className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{alert.product}</h3>
                          <p className="text-sm text-slate-500">{alert.supplier}</p>
                        </div>
                        <SeverityBadge severity={alert.severity} />
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-slate-600">Preço Atual</p>
                          <p className="font-semibold text-slate-900">R$ {alert.currentPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">Limite</p>
                          <p className="font-semibold text-slate-900">R$ {alert.threshold.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-slate-600">Status</p>
                          <p className={`font-semibold ${alert.type === "above" ? "text-red-600" : "text-green-600"}`}>
                            {alert.type === "above" ? "Acima do Limite" : "Abaixo do Limite"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
