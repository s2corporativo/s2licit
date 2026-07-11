import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Activity,
  AlertTriangle,
} from "lucide-react";

export function CaptureSchedulerMonitor() {
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | undefined>();
  const [frequencyHours, setFrequencyHours] = useState("24");

  // Lista real de fornecedores (antes era hardcoded "Fornecedor 1/2")
  const { data: suppliers = [] } = trpc.suppliers.list.useQuery();

  // Queries
  const { data: schedulerStatus, refetch: refetchStatus } =
    trpc.captureScheduler.getStatus.useQuery();

  const { data: health, refetch: refetchHealth } =
    trpc.captureScheduler.getHealth.useQuery();

  // Mutations
  const startCaptureMutation = trpc.captureScheduler.startCapture.useMutation({
    onSuccess: () => {
      refetchStatus();
      refetchHealth();
    },
  });

  const scheduleCaptureMutation =
    trpc.captureScheduler.scheduleCapture.useMutation({
      onSuccess: () => {
        refetchStatus();
      },
    });

  const stopCaptureMutation = trpc.captureScheduler.stopCapture.useMutation({
    onSuccess: () => {
      refetchStatus();
    },
  });

  const reprocessMutation = trpc.captureScheduler.reprocessFailures.useMutation({
    onSuccess: () => {
      refetchHealth();
    },
  });

  const cleanupMutation = trpc.captureScheduler.cleanupLogs.useMutation();

  const handleStartCapture = async () => {
    if (!selectedSupplierId) return;
    await startCaptureMutation.mutateAsync({
      supplierId: selectedSupplierId,
    });
  };

  const handleScheduleCapture = async () => {
    if (!selectedSupplierId) return;
    await scheduleCaptureMutation.mutateAsync({
      supplierId: selectedSupplierId,
      frequencyHours: parseInt(frequencyHours),
    });
  };

  const handleStopCapture = async () => {
    if (!selectedSupplierId) return;
    await stopCaptureMutation.mutateAsync({
      supplierId: selectedSupplierId,
    });
  };

  const handleReprocess = async () => {
    await reprocessMutation.mutateAsync({
      supplierId: selectedSupplierId,
    });
  };

  const handleCleanup = async () => {
    await cleanupMutation.mutateAsync({ daysToKeep: 30 });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Monitor de Scheduler</h1>
        <p className="text-gray-600 mt-2">
          Gerencie agendamentos e monitore saúde de capturas
        </p>
      </div>

      {/* Health Stats */}
      {health && (
        <div className="grid grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="text-sm text-gray-600">Fornecedores</div>
            <div className="text-2xl font-bold">{health.totalSuppliers}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-600">Agendamentos Ativos</div>
            <div className="text-2xl font-bold text-blue-600">
              {health.activeSchedules}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-600">Falhas (24h)</div>
            <div className="text-2xl font-bold text-red-600">
              {health.failedCapturesLast24h}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-600">Duração Média</div>
            <div className="text-2xl font-bold">{health.averageDuration}s</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-gray-600">Taxa de Sucesso</div>
            <div className="text-2xl font-bold text-green-600">
              {health.successRate}
            </div>
          </Card>
        </div>
      )}

      {/* Controls */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Controles de Captura</h2>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium">Fornecedor</label>
            <Select
              value={selectedSupplierId?.toString() || ""}
              onValueChange={(v) =>
                setSelectedSupplierId(v ? parseInt(v) : undefined)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Frequência (horas)</label>
            <Select value={frequencyHours} onValueChange={setFrequencyHours}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">A cada 6 horas</SelectItem>
                <SelectItem value="12">A cada 12 horas</SelectItem>
                <SelectItem value="24">Diariamente</SelectItem>
                <SelectItem value="48">A cada 2 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleStartCapture}
            disabled={!selectedSupplierId || startCaptureMutation.isPending}
          >
            <Play className="w-4 h-4 mr-2" />
            Iniciar Captura
          </Button>

          <Button
            variant="outline"
            onClick={handleScheduleCapture}
            disabled={
              !selectedSupplierId || scheduleCaptureMutation.isPending
            }
          >
            <Activity className="w-4 h-4 mr-2" />
            Agendar
          </Button>

          <Button
            variant="outline"
            onClick={handleStopCapture}
            disabled={!selectedSupplierId || stopCaptureMutation.isPending}
          >
            <Pause className="w-4 h-4 mr-2" />
            Parar
          </Button>

          <Button
            variant="outline"
            onClick={handleReprocess}
            disabled={reprocessMutation.isPending}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reprocessar Erros
          </Button>

          <Button
            variant="destructive"
            onClick={handleCleanup}
            disabled={cleanupMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Limpar Logs
          </Button>
        </div>
      </Card>

      {/* Scheduled Jobs */}
      {schedulerStatus && schedulerStatus.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Agendamentos Ativos</h2>

          <div className="space-y-3">
            {schedulerStatus.map((job) => (
              <div
                key={job.jobId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="font-medium">Fornecedor #{job.supplierId}</div>
                    <div className="text-sm text-gray-600">{job.jobId}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {job.isRunning ? (
                    <Badge className="bg-yellow-100 text-yellow-800">
                      Em Execução
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800">
                      Agendado
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {(!schedulerStatus || schedulerStatus.length === 0) && (
        <Card className="p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">Nenhum agendamento ativo</p>
          <p className="text-sm text-gray-500 mt-1">
            Selecione um fornecedor e clique em "Agendar" para iniciar
          </p>
        </Card>
      )}
    </div>
  );
}
