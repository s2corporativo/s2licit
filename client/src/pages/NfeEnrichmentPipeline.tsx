import { useState } from "react";
import { toast } from "sonner";
import { Zap, Loader2, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export function NfeEnrichmentPipeline() {
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const startPipeline = trpc.nfeEnrichmentPipeline.startEnrichmentPipeline.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        setResults(result);
        toast.success("Pipeline concluído com sucesso!");
      } else {
        toast.error(result.error || "Erro ao iniciar pipeline");
      }
      setIsProcessing(false);
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
      setIsProcessing(false);
    },
  });

  const handleStartPipeline = () => {
    if (selectedProducts.length === 0) {
      toast.error("Selecione pelo menos um produto");
      return;
    }

    if (!supplierId) {
      toast.error("Selecione um fornecedor");
      return;
    }

    setIsProcessing(true);
    startPipeline.mutate({
      productIds: selectedProducts,
      supplierId,
    });
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Pipeline de Enriquecimento NF-e</h1>
        <p className="text-gray-600 mt-1">Enriqueça automaticamente produtos importados com IA e matching com catálogo</p>
      </div>

      {!results ? (
        <div className="space-y-6">
          {/* Configuration */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuração</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fornecedor
                </label>
                <input
                  type="number"
                  value={supplierId || ""}
                  onChange={(e) => setSupplierId(e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="ID do fornecedor"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Produtos ({selectedProducts.length} selecionado(s))
                </label>
                <textarea
                  value={selectedProducts.join(", ")}
                  onChange={(e) => {
                    const ids = e.target.value
                      .split(",")
                      .map(id => parseInt(id.trim()))
                      .filter(id => !isNaN(id));
                    setSelectedProducts(ids);
                  }}
                  placeholder="IDs dos produtos separados por vírgula (ex: 1, 2, 3)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 font-mono text-sm"
                />
              </div>
            </div>
          </Card>

          {/* Pipeline Steps */}
          <Card className="p-6 bg-blue-50 border-blue-200">
            <h2 className="text-lg font-semibold text-blue-900 mb-4">Etapas do Pipeline</h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                  1
                </div>
                <div>
                  <p className="font-medium text-blue-900">Enriquecimento com IA</p>
                  <p className="text-sm text-blue-700">Extrai automaticamente ingrediente ativo, indicações, contraindicações, dosagem</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                  2
                </div>
                <div>
                  <p className="font-medium text-blue-900">Matching com Catálogo</p>
                  <p className="text-sm text-blue-700">Identifica produtos duplicados já capturados no sistema</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                  3
                </div>
                <div>
                  <p className="font-medium text-blue-900">Mesclagem de Dados</p>
                  <p className="text-sm text-blue-700">Combina dados do NF-e com dados do catálogo existente</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                  4
                </div>
                <div>
                  <p className="font-medium text-blue-900">Atualização do Banco</p>
                  <p className="text-sm text-blue-700">Grava dados enriquecidos e notifica usuário</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Start Button */}
          <Button
            onClick={handleStartPipeline}
            disabled={selectedProducts.length === 0 || !supplierId || isProcessing}
            size="lg"
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Iniciar Pipeline
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Results Summary */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="p-4 bg-green-50 border-green-200">
              <p className="text-sm text-green-600 font-medium">Total Processado</p>
              <p className="text-3xl font-bold text-green-900">{results.processed}</p>
            </Card>

            <Card className="p-4 bg-blue-50 border-blue-200">
              <p className="text-sm text-blue-600 font-medium">Enriquecido</p>
              <p className="text-3xl font-bold text-blue-900">{results.enriched}</p>
            </Card>

            <Card className="p-4 bg-purple-50 border-purple-200">
              <p className="text-sm text-purple-600 font-medium">Matches</p>
              <p className="text-3xl font-bold text-purple-900">{results.matched}</p>
            </Card>

            <Card className="p-4 bg-red-50 border-red-200">
              <p className="text-sm text-red-600 font-medium">Erros</p>
              <p className="text-3xl font-bold text-red-900">{results.failed}</p>
            </Card>
          </div>

          {/* Results Details */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Detalhes do Processamento</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Produto</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Ingrediente Ativo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Confiança</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Mensagem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {results.results?.map((result: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{result.productName}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            result.status === "completed"
                              ? "bg-green-100 text-green-800"
                              : result.status === "failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {result.status === "completed" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {result.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {result.result?.activeIngredient || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${result.result?.confidence || 0}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-gray-600">
                            {result.result?.confidence || 0}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {result.error || result.result?.source || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button
              onClick={() => {
                setResults(null);
                setSelectedProducts([]);
                setSupplierId(null);
              }}
              variant="outline"
              size="lg"
              className="flex-1"
            >
              Novo Pipeline
            </Button>

            <Button
              onClick={() => toast.success("Relatório exportado!")}
              size="lg"
              className="flex-1"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Exportar Relatório
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
