import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, TrendingDown, TrendingUp, BarChart3 } from "lucide-react";
import { formatBRL } from "@/lib/format";
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
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

export function AnalisePrecosV2() {
  const [selectedPeriod, setSelectedPeriod] = useState(30);
  const [selectedSupplier, setSelectedSupplier] = useState<number | undefined>();

  // Queries
  const { data: variations, isLoading: variationsLoading } =
    trpc.priceAnalysis.getVariationsBySupplier.useQuery({});

  const { data: history, isLoading: historyLoading } =
    trpc.priceAnalysis.getPriceHistory.useQuery({
      supplierId: selectedSupplier,
      daysBack: selectedPeriod,
    });

  const { data: comparison, isLoading: comparisonLoading } =
    trpc.priceAnalysis.getSupplierComparison.useQuery();

  const { data: topVariations, isLoading: topVariationsLoading } =
    trpc.priceAnalysis.getTopVariations.useQuery({ limit: 10 });

  // Preparar dados para gráficos
  const chartData = history?.map((point) => ({
    date: point.date,
    price: point.averagePrice,
    products: point.productCount,
  })) || [];

  const competitivenessData =
    comparison?.map((c) => ({
      name: c.supplierName,
      value: c.totalProducts,
      competitiveness: c.competitiveness,
    })) || [];

  const getCompetitivenessColor = (competitiveness: string) => {
    switch (competitiveness) {
      case "very_competitive":
        return "#10b981";
      case "competitive":
        return "#3b82f6";
      case "average":
        return "#f59e0b";
      case "expensive":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Análise de Preços</h1>
            <p className="text-muted-foreground">
              Visualize tendências de preços e identifique oportunidades de otimização
            </p>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              <div>
                <label className="text-sm font-medium text-foreground">Período</label>
                <div className="flex gap-2 mt-2">
                  {[7, 30, 90, 180].map((days) => (
                    <Button
                      key={days}
                      variant={selectedPeriod === days ? "default" : "outline"}
                      onClick={() => setSelectedPeriod(days)}
                      size="sm"
                    >
                      {days}d
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Fornecedor</label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Button
                    variant={selectedSupplier === undefined ? "default" : "outline"}
                    onClick={() => setSelectedSupplier(undefined)}
                    size="sm"
                  >
                    Todos
                  </Button>
                  {variations?.slice(0, 5).map((v) => (
                    <Button
                      key={v.supplierId}
                      variant={selectedSupplier === v.supplierId ? "default" : "outline"}
                      onClick={() => setSelectedSupplier(v.supplierId)}
                      size="sm"
                    >
                      {v.supplierName}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de Série Temporal */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Histórico de Preços
            </CardTitle>
            <CardDescription>Variação de preço médio nos últimos dias</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                Carregando...
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#3b82f6"
                    name="Preço Médio (R$)"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <span>Ainda não há histórico de preços para mostrar.</span>
                <span className="max-w-md text-xs">
                  O histórico é construído com o tempo, a cada importação de planilha/NF-e e a
                  cada captura automática de fornecedores. Importe preços regularmente e este
                  gráfico passa a mostrar a evolução.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grid de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {variations?.slice(0, 4).map((v) => (
            <Card key={v.supplierId}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {v.supplierName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {formatBRL(v.averagePrice)}
                    </p>
                    <p className="text-xs text-muted-foreground">Preço Médio</p>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Produtos: {v.productCount}</span>
                    <span className="text-muted-foreground">
                      Var: {v.variationPercent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Comparação de Competitividade */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Competitividade */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Competitividade por Fornecedor
              </CardTitle>
              <CardDescription>Posicionamento de preços</CardDescription>
            </CardHeader>
            <CardContent>
              {comparisonLoading ? (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  Carregando...
                </div>
              ) : comparison && comparison.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparison}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="supplierName" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="averagePrice" fill="#3b82f6" name="Preço Médio (R$)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  Sem dados ainda — importe preços ou rode a captura automática para alimentar esta análise
                </div>
              )}
            </CardContent>
          </Card>

          {/* Distribuição de Produtos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5" />
                Distribuição de Produtos
              </CardTitle>
              <CardDescription>Quantidade por fornecedor</CardDescription>
            </CardHeader>
            <CardContent>
              {comparisonLoading ? (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  Carregando...
                </div>
              ) : competitivenessData && competitivenessData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={competitivenessData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {competitivenessData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={getCompetitivenessColor(entry.competitiveness)}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-80 flex items-center justify-center text-muted-foreground">
                  Sem dados ainda — importe preços ou rode a captura automática para alimentar esta análise
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Produtos com Maior Variação */}
        <Card>
          <CardHeader>
            <CardTitle>Produtos com Maior Variação de Preço</CardTitle>
            <CardDescription>Top 10 produtos com maior flutuação</CardDescription>
          </CardHeader>
          <CardContent>
            {topVariationsLoading ? (
              <div className="text-center text-muted-foreground py-8">Carregando...</div>
            ) : topVariations && topVariations.length > 0 ? (
              <div className="space-y-4">
                {topVariations.map((product, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-3">
                    <div>
                      <p className="font-medium text-foreground">{product.productName}</p>
                      <p className="text-sm text-muted-foreground">{product.supplierName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-foreground">
                        {formatBRL(product.price)}
                      </p>
                      <p className="text-sm text-orange-500">
                        Var: {product.variation.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Sem dados ainda — os números aparecem conforme os preços dos fornecedores são importados
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
