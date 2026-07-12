import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

export function CaptureAnalytics() {
  const [periodDays, setPeriodDays] = useState(7);

  // Queries
  const { data: stats } = trpc.captureAnalytics.getStats.useQuery({});
  const { data: supplierMetrics } =
    trpc.captureAnalytics.getSupplierMetrics.useQuery({ limit: 10 });
  const { data: history } = trpc.captureAnalytics.getHistory.useQuery({
    limit: 50,
  });
  const { data: successRate } =
    trpc.captureAnalytics.getSuccessRate.useQuery({ periodDays });
  const { data: statusDistribution } =
    trpc.captureAnalytics.getStatusDistribution.useQuery();

  const COLORS = ["#10b981", "#ef4444", "#f59e0b"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Analytics de Captura</h1>
        <p className="text-gray-600 mt-2">
          Monitore o desempenho de capturas e tendências de produtos
        </p>
      </div>

      {/* Key Metrics */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-sm text-gray-600">Total de Capturas</div>
            <div className="text-3xl font-bold mt-2">{stats.totalCaptures}</div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.successfulCaptures} sucesso
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-gray-600">Taxa de Sucesso</div>
            <div className={`text-3xl font-bold mt-2 ${
              stats.successRate >= 80
                ? "text-green-600"
                : stats.successRate >= 60
                  ? "text-yellow-600"
                  : "text-red-600"
            }`}>
              {stats.successRate.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.failedCaptures} falhas
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-gray-600">Produtos Capturados</div>
            <div className="text-3xl font-bold mt-2">
              {stats.totalProductsCaptured}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.totalProductsEnriched} enriquecidos
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-gray-600">Duração Média</div>
            <div className="text-3xl font-bold mt-2">
              {stats.averageDuration.toFixed(0)}s
            </div>
            <div className="text-xs text-gray-500 mt-1">por captura</div>
          </Card>
        </div>
      )}

      {/* Status Distribution */}
      {statusDistribution && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Distribuição de Status</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={[
                  { name: "Sucesso", value: statusDistribution.success },
                  { name: "Falha", value: statusDistribution.failed },
                  { name: "Em Execução", value: statusDistribution.running },
                ]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {COLORS.map((color, index) => (
                  <Cell key={`cell-${index}`} fill={color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Success Rate Trend */}
      {successRate && successRate.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Taxa de Sucesso (Últimos {periodDays} dias)</h2>
            <select
              value={periodDays}
              onChange={(e) => setPeriodDays(parseInt(e.target.value))}
              className="px-3 py-1 border rounded text-sm"
            >
              <option value={7}>7 dias</option>
              <option value={14}>14 dias</option>
              <option value={30}>30 dias</option>
            </select>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={successRate}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="successRate"
                stroke="#10b981"
                name="Taxa de Sucesso (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Supplier Metrics */}
      {supplierMetrics && supplierMetrics.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Top Fornecedores</h2>

          <div className="space-y-3">
            {supplierMetrics.map((supplier) => (
              <div
                key={supplier.supplierId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium">{supplier.supplierName}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {supplier.totalCaptures} capturas • {supplier.totalProductsCaptured} produtos
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-semibold">
                      {supplier.successRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-600">sucesso</div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-semibold">
                      {supplier.averageDuration.toFixed(0)}s
                    </div>
                    <div className="text-xs text-gray-600">média</div>
                  </div>

                  {supplier.errorCount > 0 && (
                    <Badge className="bg-red-100 text-red-800">
                      {supplier.errorCount} erros
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Capture History */}
      {history && history.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Histórico de Capturas</h2>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {entry.status === "success" ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : entry.status === "failed" ? (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  ) : (
                    <Activity className="w-5 h-5 text-yellow-600" />
                  )}

                  <div>
                    <div className="font-medium">
                      Fornecedor #{entry.supplierId}
                    </div>
                    <div className="text-xs text-gray-600">
                      {new Date(entry.startedAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <div className="font-medium">
                      {entry.productsCaptured} capturados
                    </div>
                    <div className="text-xs text-gray-600">
                      {entry.productsCaptured} capturados
                    </div>
                  </div>

                  {entry.duration && (
                    <div className="text-right">
                      <div className="font-medium">{entry.duration.toFixed(0)}s</div>
                      <div className="text-xs text-gray-600">duração</div>
                    </div>
                  )}

                  <Badge
                    className={
                      entry.status === "success"
                        ? "bg-green-100 text-green-800"
                        : entry.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                    }
                  >
                    {entry.status === "success"
                      ? "Sucesso"
                      : entry.status === "failed"
                        ? "Falha"
                        : "Executando"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {!stats && (
        <Card className="p-12 text-center">
          <Activity className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">Nenhum dado de captura disponível</p>
          <p className="text-sm text-gray-500 mt-1">
            Execute capturas para visualizar analytics
          </p>
        </Card>
      )}
    </div>
  );
}
