import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

type PipelineResult = {
  processed: number;
  enriched: number;
  matched: number;
  failed: number;
  success: boolean;
  partial: boolean;
  message: string;
  results: Array<{
    productId: number;
    productName: string;
    status: "pending" | "enriching" | "completed" | "failed";
    error?: string;
    result?: {
      activeIngredient: string;
      concentration: string;
      confidence: number;
      requiresReview: boolean;
    };
  }>;
};

export function NfeEnrichmentPipeline() {
  const [productIdsText, setProductIdsText] = useState("");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [results, setResults] = useState<PipelineResult | null>(null);

  const selectedProducts = productIdsText
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value, index, all) => Number.isInteger(value) && value > 0 && all.indexOf(value) === index);

  const startPipeline = trpc.nfeEnrichmentPipeline.startEnrichmentPipeline.useMutation({
    onSuccess: (result) => {
      setResults(result as PipelineResult);
      if (result.success) toast.success(result.message);
      else if (result.partial) toast.warning(result.message);
      else toast.error(result.message);
    },
    onError: (error) => toast.error(error.message),
  });

  const handleStartPipeline = () => {
    if (selectedProducts.length === 0) {
      toast.error("Informe ao menos um ID de produto válido.");
      return;
    }
    if (!supplierId) {
      toast.error("Informe o fornecedor.");
      return;
    }
    setResults(null);
    startPipeline.mutate({ productIds: selectedProducts, supplierId });
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Pipeline de Enriquecimento NF-e</h1>
        <p className="mt-1 text-gray-600">
          Preenche apenas dados estruturados com confiança suficiente. Informações clínicas incertas não são gravadas automaticamente.
        </p>
      </div>

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Fornecedor</label>
            <input
              type="number"
              min={1}
              value={supplierId ?? ""}
              onChange={(event) => setSupplierId(event.target.value ? Number(event.target.value) : null)}
              placeholder="ID do fornecedor"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Produtos</label>
            <textarea
              value={productIdsText}
              onChange={(event) => setProductIdsText(event.target.value)}
              placeholder="IDs separados por vírgula: 10, 11, 12"
              className="h-24 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">{selectedProducts.length} produto(s) válido(s).</p>
          </div>
        </div>

        <Button
          onClick={handleStartPipeline}
          disabled={startPipeline.isPending || selectedProducts.length === 0 || !supplierId}
          className="mt-5 w-full"
          size="lg"
        >
          {startPipeline.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando</>
          ) : (
            <><Zap className="mr-2 h-4 w-4" />Executar pipeline síncrono</>
          )}
        </Button>
      </Card>

      {results && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="p-4"><p className="text-sm text-gray-500">Processados</p><p className="text-3xl font-bold">{results.processed}</p></Card>
            <Card className="p-4"><p className="text-sm text-blue-600">Enriquecidos</p><p className="text-3xl font-bold text-blue-900">{results.enriched}</p></Card>
            <Card className="p-4"><p className="text-sm text-purple-600">Matches confirmados</p><p className="text-3xl font-bold text-purple-900">{results.matched}</p></Card>
            <Card className="p-4"><p className="text-sm text-red-600">Falhas/revisão</p><p className="text-3xl font-bold text-red-900">{results.failed}</p></Card>
          </div>

          <Card className="overflow-x-auto p-6">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Produto</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Princípio ativo</th>
                  <th className="px-3 py-2 text-left">Concentração</th>
                  <th className="px-3 py-2 text-left">Confiança</th>
                  <th className="px-3 py-2 text-left">Observação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results.results.map((item) => (
                  <tr key={item.productId}>
                    <td className="px-3 py-3 font-medium">{item.productName}</td>
                    <td className="px-3 py-3">
                      <span className={item.status === "completed" ? "text-green-700" : "text-red-700"}>
                        {item.status === "completed" ? <CheckCircle2 className="mr-1 inline h-4 w-4" /> : <AlertCircle className="mr-1 inline h-4 w-4" />}
                        {item.status === "completed" ? "Concluído" : "Não gravado"}
                      </span>
                    </td>
                    <td className="px-3 py-3">{item.result?.activeIngredient || "—"}</td>
                    <td className="px-3 py-3">{item.result?.concentration || "—"}</td>
                    <td className="px-3 py-3">{item.result ? `${item.result.confidence}%` : "—"}</td>
                    <td className="px-3 py-3 text-gray-600">{item.error || (item.result?.requiresReview ? "Exige revisão humana" : "Dados gravados")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
