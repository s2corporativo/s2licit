import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Download, Eye, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function HistoricoEnriquecimento() {
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<
    "nfe_import" | "manual" | "batch_job" | "api" | undefined
  >(undefined);
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "running" | "completed" | "failed" | undefined
  >(undefined);
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);

  // Queries
  const { data: executions, isLoading: loadingExecutions } = trpc.enrichmentHistory.listExecutions.useQuery(
    {
      limit,
      offset,
      source: sourceFilter,
      status: statusFilter,
    },
    { enabled: !selectedExecution }
  );

  const executionDetailQuery = trpc.enrichmentHistory.getExecutionDetail.useQuery(
    { executionId: selectedExecution! },
    { enabled: !!selectedExecution }
  );
  const { data: executionDetail, isLoading: loadingDetail } = executionDetailQuery;

  const { data: stats } = trpc.enrichmentHistory.getStats.useQuery();

  // Mutations
  const approveResultMutation = trpc.enrichmentHistory.approveResult.useMutation();
  const rejectResultMutation = trpc.enrichmentHistory.rejectResult.useMutation();
  const applyResultMutation = trpc.enrichmentHistory.applyResult.useMutation();

  const handleApproveResult = async (resultId: number, appliedValue: string | null) => {
    try {
      if (!appliedValue) return;
      await approveResultMutation.mutateAsync({ resultId, appliedValue });
      // Recarregar detalhes
      if (selectedExecution) {
        await executionDetailQuery.refetch();
      }
    } catch (error) {
      console.error("Erro ao aprovar resultado:", error);
    }
  };

  const handleRejectResult = async (resultId: number) => {
    try {
      await rejectResultMutation.mutateAsync({ resultId });
      if (selectedExecution) {
        await executionDetailQuery.refetch();
      }
    } catch (error) {
      console.error("Erro ao rejeitar resultado:", error);
    }
  };

  const handleApplyResult = async (resultId: number) => {
    try {
      await applyResultMutation.mutateAsync({ resultId });
      if (selectedExecution) {
        await executionDetailQuery.refetch();
      }
    } catch (error) {
      console.error("Erro ao aplicar resultado:", error);
    }
  };

  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) return <Badge variant="secondary">Desconhecido</Badge>;
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      running: "default",
      completed: "default",
      failed: "destructive",
    };
    const icons: Record<string, React.ReactNode> = {
      pending: <Clock className="w-3 h-3" />,
      running: <Loader2 className="w-3 h-3 animate-spin" />,
      completed: <CheckCircle2 className="w-3 h-3" />,
      failed: <XCircle className="w-3 h-3" />,
    };
    const labels: Record<string, string> = {
      pending: "Pendente",
      running: "Executando",
      completed: "Concluído",
      failed: "Falhou",
    };

    return (
      <Badge variant={variants[status] || "default"} className="flex items-center gap-1">
        {icons[status]}
        {labels[status] || status}
      </Badge>
    );
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      nfe_import: "Importação NF-e",
      manual: "Manual",
      batch_job: "Job em Lote",
      api: "API",
    };
    return labels[source] || source;
  };

  const getResultStatusBadge = (status: string | null | undefined) => {
    if (!status) return <Badge variant="secondary">Desconhecido</Badge>;
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      approved: "default",
      rejected: "destructive",
      applied: "default",
    };
    const labels: Record<string, string> = {
      pending: "Pendente",
      approved: "Aprovado",
      rejected: "Rejeitado",
      applied: "Aplicado",
    };

    return (
      <Badge variant={variants[status] || "default"}>
        {labels[status] || status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Histórico de Enriquecimento</h1>
          <p className="text-muted-foreground">Rastreie todas as execuções de enriquecimento de produtos</p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total de Execuções</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalExecutions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Bem-Sucedidas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.successfulExecutions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Falhadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.failedExecutions}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Produtos Processados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProductsProcessed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.averageSuccessRate.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      {!selectedExecution ? (
        <Card>
          <CardHeader>
            <CardTitle>Execuções de Enriquecimento</CardTitle>
            <CardDescription>Lista de todas as execuções de enriquecimento de produtos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex gap-4 flex-wrap">
              <Select value={sourceFilter || ""} onValueChange={(v) => setSourceFilter(v as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filtrar por fonte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas as fontes</SelectItem>
                  <SelectItem value="nfe_import">Importação NF-e</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="batch_job">Job em Lote</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter || ""} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos os status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="running">Executando</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="failed">Falhou</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            {loadingExecutions ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : executions && executions.executions.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID da Execução</TableHead>
                        <TableHead>Fonte</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Produtos</TableHead>
                        <TableHead>Sucesso</TableHead>
                        <TableHead>Falhas</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {executions.executions.map((exec) => (
                        <TableRow key={exec.executionId}>
                          <TableCell className="font-mono text-xs">{exec.executionId?.slice(0, 8) || "-"}...</TableCell>
                          <TableCell>{getSourceLabel(exec.source || "")}</TableCell>
                          <TableCell>{getStatusBadge(exec.status || "")}</TableCell>
                          <TableCell>{exec.totalProducts}</TableCell>
                          <TableCell className="text-green-600">{exec.successCount || 0}</TableCell>
                          <TableCell className="text-red-600">{exec.failureCount || 0}</TableCell>
                          <TableCell>
                            {format(new Date(exec.createdAt!), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedExecution(exec.executionId)}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Detalhes
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex justify-between items-center pt-4">
                  <div className="text-sm text-muted-foreground">
                    Total: {executions.total} execuções
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      disabled={offset + limit >= executions.total}
                      onClick={() => setOffset(offset + limit)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma execução encontrada
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Detalhes da Execução</CardTitle>
              <CardDescription>ID: {selectedExecution.slice(0, 8)}...</CardDescription>
            </div>
            <Button variant="outline" onClick={() => setSelectedExecution(null)}>
              Voltar
            </Button>
          </CardHeader>
          <CardContent>
            {loadingDetail ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : executionDetail ? (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                  <TabsTrigger value="results">Resultados ({executionDetail.results.length})</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Status</div>
                      <div className="mt-1">{getStatusBadge(executionDetail.status)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Fonte</div>
                      <div className="mt-1 font-medium">{getSourceLabel(executionDetail.source || "")}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total de Produtos</div>
                      <div className="mt-1 font-medium">{executionDetail.totalProducts}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Taxa de Sucesso</div>
                      <div className="mt-1 font-medium">
                        {(executionDetail.totalProducts || 0) > 0
                          ? (((executionDetail.successCount || 0) / (executionDetail.totalProducts || 1)) * 100).toFixed(1)
                          : 0}
                        %
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                    <div>
                      <div className="text-sm text-muted-foreground">Sucesso</div>
                      <div className="mt-1 text-2xl font-bold text-green-600">{executionDetail.successCount || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Falhas</div>
                      <div className="mt-1 text-2xl font-bold text-red-600">{executionDetail.failureCount || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Ignorados</div>
                      <div className="mt-1 text-2xl font-bold text-yellow-600">{executionDetail.skippedCount || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Confiança Média</div>
                      <div className="mt-1 text-2xl font-bold">
                        {parseFloat(executionDetail.averageConfidenceScore?.toString() || "0").toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {executionDetail.errorMessage && (
                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="text-sm font-medium text-red-900">Erro</div>
                      <div className="text-sm text-red-700 mt-1">{executionDetail.errorMessage}</div>
                    </div>
                  )}
                </TabsContent>

                {/* Results Tab */}
                <TabsContent value="results" className="space-y-4">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Campo</TableHead>
                          <TableHead>Valor Original</TableHead>
                          <TableHead>Valor Sugerido</TableHead>
                          <TableHead>Confiança</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {executionDetail.results.map((result) => (
                          <TableRow key={result.id}>
                            <TableCell className="font-medium">{result.fieldName}</TableCell>
                            <TableCell className="text-xs">{result.originalValue || "-"}</TableCell>
                            <TableCell className="text-xs">{result.suggestedValue || "-"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full"
                                    style={{
                                      width: `${parseFloat(result.confidenceScore?.toString() || "0")}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs font-medium">
                                  {parseFloat(result.confidenceScore?.toString() || "0").toFixed(0)}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{getResultStatusBadge(result.status)}</TableCell>
                            <TableCell>
                              {result.status === "pending" && (
                                <div className="flex gap-1">
                            <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleApproveResult(result.id, result.suggestedValue)
                                  }
                                  disabled={approveResultMutation.isPending || !result.suggestedValue}
                                >
                                  Aprovar
                                </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRejectResult(result.id)}
                                    disabled={rejectResultMutation.isPending}
                                  >
                                    Rejeitar
                                  </Button>
                                </div>
                              )}
                              {result.status === "approved" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleApplyResult(result.id)}
                                  disabled={applyResultMutation.isPending}
                                >
                                  Aplicar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {executionDetail.results.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhum resultado encontrado para esta execução
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Erro ao carregar detalhes da execução
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
