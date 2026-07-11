import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ImportProgressDialogProps {
  open: boolean;
  queueId: string | null;
  onComplete?: () => void;
}

export function ImportProgressDialog({ open, queueId, onComplete }: ImportProgressDialogProps) {
  const [progress, setProgress] = useState<any>(null);
  const [isPolling, setIsPolling] = useState(false);

  const { data: progressData } = trpc.imports.getImportProgress.useQuery(
    { queueId: queueId || "" },
    {
      enabled: open && !!queueId && isPolling,
      refetchInterval: 1000,
    }
  );

  useEffect(() => {
    if (open && queueId) {
      setIsPolling(true);
    } else {
      setIsPolling(false);
    }
  }, [open, queueId]);

  useEffect(() => {
    if (progressData && 'queueId' in progressData) {
      setProgress(progressData);

      if (progressData.status === "completed" || progressData.status === "failed") {
        setIsPolling(false);
        if (onComplete) {
          setTimeout(onComplete, 1500);
        }
      }
    }
  }, [progressData, onComplete]);

  if (!progress) {
    return null;
  }

  const isCompleted = progress.status === "completed";
  const isFailed = progress.status === "failed";
  const isProcessing = progress.status === "processing";

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importação de Produtos</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status */}
          <div className="flex items-center gap-3">
            {isCompleted && (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-600">Importação Concluída</span>
              </>
            )}
            {isFailed && (
              <>
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="text-sm font-medium text-red-600">Importação Falhou</span>
              </>
            )}
            {isProcessing && (
              <>
                <Clock className="h-5 w-5 text-blue-600 animate-spin" />
                <span className="text-sm font-medium text-blue-600">Processando...</span>
              </>
            )}
          </div>

          {/* Progresso */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Progresso</span>
              <span className="font-medium">{progress.progress}%</span>
            </div>
            <Progress value={progress.progress} className="h-2" />
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{progress.processedRows}</div>
              <div className="text-xs text-gray-600">Processados</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{progress.successRows}</div>
              <div className="text-xs text-gray-600">Sucesso</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{progress.errorRows}</div>
              <div className="text-xs text-gray-600">Erros</div>
            </div>
          </div>

          {/* Tempo Restante */}
          {isProcessing && progress.estimatedTimeRemaining > 0 && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-900">
                ⏱️ Tempo estimado: <strong>{formatTime(progress.estimatedTimeRemaining)}</strong>
              </p>
            </div>
          )}

          {/* Erros */}
          {progress.errors && progress.errors.length > 0 && (
            <div className="bg-red-50 p-3 rounded-lg max-h-40 overflow-y-auto">
              <p className="text-sm font-medium text-red-900 mb-2">Erros encontrados:</p>
              <ul className="space-y-1">
                {progress.errors.slice(0, 5).map((error: any, idx: number) => (
                  <li key={idx} className="text-xs text-red-800">
                    Linha {error.rowIndex + 1}: {error.error}
                  </li>
                ))}
              </ul>
              {progress.errors.length > 5 && (
                <p className="text-xs text-red-700 mt-2">
                  ... e mais {progress.errors.length - 5} erros
                </p>
              )}
            </div>
          )}

          {/* Resumo Final */}
          {isCompleted && (
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-green-900">
                ✓ {progress.successRows} de {progress.totalRows} produtos importados com sucesso
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
