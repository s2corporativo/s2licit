import { useState } from "react";
import { Upload, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { usePriceSync } from "@/hooks/usePriceSync";

interface NfePreview {
  nfeNumber: string;
  supplierName: string;
  supplierCnpj: string;
  products: Array<{
    id: string;
    productName: string;
    ean?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unit?: string;
  }>;
  stats: {
    totalProducts: number;
    totalValue: number;
    averagePrice: number;
    priceRangeMin: number;
    priceRangeMax: number;
  };
  totalValue: number;
}

interface NfeUploadComponentProps {
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
}

export function NfeUploadComponent({ onSuccess, onError }: NfeUploadComponentProps) {
  const [xmlContent, setXmlContent] = useState<string>("");
  const [preview, setPreview] = useState<NfePreview | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [syncSummary, setSyncSummary] = useState<string>("");
  const [showSyncResults, setShowSyncResults] = useState(false);

  const priceSync = usePriceSync();

  const previewMutation = trpc.nfeImport.previewNfeImport.useMutation();
  const importMutation = trpc.nfeImport.importNfeWithSupplier.useMutation();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError("");

    try {
      const content = await file.text() as string;
      setXmlContent(content);

      // Preview the import
      const result = await previewMutation.mutateAsync({
        xmlContent: content,
      });

      if (result.success && result.preview) {
        setPreview(result.preview);
        // Select all products by default
          const allIds = new Set<string>(result.preview.products.map((p: NfePreview["products"][number]) => p.id));

        setSelectedProducts(allIds);
      } else {
        setError(result.error || "Erro ao processar NFe");
      }
    } catch (err) {
      setError(`Erro ao ler arquivo: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductToggle = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleSelectAll = () => {
    if (preview) {
      if (selectedProducts.size === preview.products.length) {
        setSelectedProducts(new Set());
      } else {
        setSelectedProducts(new Set(preview.products.map(p => p.id)));
      }
    }
  };

  const handleImport = async () => {
    if (!xmlContent) {
      setError("Nenhum arquivo selecionado");
      return;
    }

    setIsLoading(true);
    setError("");
    setSyncSummary("");

    try {
      // Capture price snapshot before import
      const beforeSnapshot = await priceSync.captureBeforeSnapshot(
        preview?.products.map((_, i) => i) || []
      );

      // Import NFe
      const result = await importMutation.mutateAsync({
        xmlContent,
        selectedProductIds: Array.from(selectedProducts),
      });

      if (result.success) {
        // Synchronize prices after import
        // Note: importNfeWithSupplier returns productsImported count, not array of IDs
        // We'll use the preview products as reference for sync
        if (beforeSnapshot && preview && preview.products.length > 0) {
          const productIds = preview.products.map((_, i) => i);
          const syncResult = await priceSync.syncPrices(
            productIds,
            beforeSnapshot
          );

          if (syncResult && syncResult.summary) {
            setSyncSummary(syncResult.summary);
            setShowSyncResults(true);
          }
        }

        setXmlContent("");
        setPreview(null);
        setSelectedProducts(new Set());
        onSuccess?.(result);
      } else {
        setError(result.error || "Erro ao importar NFe");
        onError?.(result.error || "Erro ao importar NFe");
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setError(`Erro ao importar: ${errorMsg}`);
      onError?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sync Results */}
      {showSyncResults && syncSummary && (
        <Card className="border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3">
            <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-blue-900">Sincronização de Preços</h4>
              <p className="text-sm text-blue-800 mt-2 whitespace-pre-line">{syncSummary}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setShowSyncResults(false)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Upload Area */}
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center gap-4">
          <Upload className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-lg font-semibold">Importar Nota Fiscal (NFe)</h3>
            <p className="text-sm text-muted-foreground">
              Arraste um arquivo XML ou clique para selecionar
            </p>
          </div>
          <input
            type="file"
            accept=".xml"
            onChange={handleFileUpload}
            disabled={isLoading}
            className="hidden"
            id="nfe-file-input"
          />
          <Button
            asChild
            variant="outline"
            disabled={isLoading}
            className="cursor-pointer"
          >
            <label htmlFor="nfe-file-input">
              {isLoading ? "Processando..." : "Selecionar arquivo"}
            </label>
          </Button>
        </div>
      </Card>

      {/* Error Message */}
      {error && (
        <Card className="border-red-200 bg-red-50 p-4">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-900">Erro</h4>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          {/* NFe Info */}
          <Card className="p-4 border-green-200 bg-green-50">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-green-900">NFe Válida</h4>
                <div className="mt-2 grid grid-cols-2 gap-4 text-sm text-green-800">
                  <div>
                    <span className="font-medium">NFe:</span> {preview.nfeNumber}
                  </div>
                  <div>
                    <span className="font-medium">Fornecedor:</span> {preview.supplierName}
                  </div>
                  <div>
                    <span className="font-medium">CNPJ:</span> {preview.supplierCnpj}
                  </div>
                  <div>
                    <span className="font-medium">Produtos:</span> {preview.products.length}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Total de Produtos</div>
              <div className="text-2xl font-bold">{preview.stats.totalProducts}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Valor Total</div>
              <div className="text-2xl font-bold">
                R$ {preview.stats.totalValue.toFixed(2)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Preço Médio</div>
              <div className="text-2xl font-bold">
                R$ {preview.stats.averagePrice.toFixed(2)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Selecionados</div>
              <div className="text-2xl font-bold">{selectedProducts.size}</div>
            </Card>
          </div>

          {/* Products Table */}
          <Card className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Produtos</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedProducts.size === preview.products.length
                    ? "Desselecionar Todos"
                    : "Selecionar Todos"}
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 w-8">
                        <Checkbox
                          checked={selectedProducts.size === preview.products.length}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th className="text-left py-2 px-2">Produto</th>
                      <th className="text-left py-2 px-2">EAN</th>
                      <th className="text-right py-2 px-2">Qtd</th>
                      <th className="text-right py-2 px-2">Preço Unit.</th>
                      <th className="text-right py-2 px-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.products.map(product => (
                      <tr key={product.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2">
                          <Checkbox
                            checked={selectedProducts.has(product.id)}
                            onChange={() => handleProductToggle(product.id)}
                          />
                        </td>
                        <td className="py-2 px-2 font-medium">{product.productName}</td>
                        <td className="py-2 px-2 text-muted-foreground">{product.ean || "-"}</td>
                        <td className="py-2 px-2 text-right">{product.quantity}</td>
                        <td className="py-2 px-2 text-right">R$ {product.unitPrice.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-medium">
                          R$ {product.totalPrice.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setXmlContent("");
                setPreview(null);
                setSelectedProducts(new Set());
              }}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleImport}
              disabled={isLoading || selectedProducts.size === 0}
            >
              {isLoading ? "Importando..." : `Importar ${selectedProducts.size} Produtos`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
