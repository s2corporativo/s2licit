import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Edit2, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export function NfeImport() {
  const [xmlContent, setXmlContent] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const parseNfe = trpc.nfeImport.previewNfeImport.useMutation({
    onSuccess: (result) => {
      if (result.success && result.preview) {
        setPreview(result.preview);
        setSelectedProducts(new Set(result.preview.products.map((p: any) => p.id)));
        toast.success("NF-e analisada com sucesso!");
      } else {
        toast.error(result.error || "Erro ao analisar NF-e");
      }
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const importNfe = trpc.nfeImport.importNfeWithSupplier.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`${result.productsImported} produto(s) importado(s) com sucesso!`);
        setXmlContent("");
        setPreview(null);
        setSelectedProducts(new Set());
      } else {
        toast.error(result.error || "Erro ao importar NF-e");
      }
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setXmlContent(content);
    };
    reader.readAsText(file);
  };

  const handleParse = () => {
    if (!xmlContent) {
      toast.error("Selecione um arquivo XML");
      return;
    }
    setIsLoading(true);
    parseNfe.mutate({ xmlContent });
    setIsLoading(false);
  };

  const handleToggleProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleImport = () => {
    if (!preview) {
      toast.error("Nenhuma NF-e para importar");
      return;
    }

    setIsLoading(true);
    importNfe.mutate({
      xmlContent,
      selectedProductIds: Array.from(selectedProducts),
    });
    setIsLoading(false);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Importar NF-e</h1>
        <p className="text-gray-600 mt-1">Importe produtos de Notas Fiscais Eletrônicas</p>
      </div>

      {/* Upload Section */}
      {!preview && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition">
              <input
                type="file"
                accept=".xml"
                onChange={handleFileUpload}
                className="hidden"
                id="xml-upload"
              />
              <label htmlFor="xml-upload" className="cursor-pointer block">
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-900">Clique para selecionar ou arraste um arquivo XML</p>
                <p className="text-xs text-gray-500 mt-1">Apenas arquivos .xml de NF-e</p>
              </label>
            </div>

            {xmlContent && (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-900">Arquivo carregado</span>
                </div>
                <Button
                  onClick={() => setXmlContent("")}
                  variant="ghost"
                  size="sm"
                  className="text-green-600 hover:text-green-700"
                >
                  Remover
                </Button>
              </div>
            )}

            <Button
              onClick={handleParse}
              disabled={!xmlContent || isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Analisar NF-e
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Preview Section */}
      {preview && (
        <div className="space-y-6">
          {/* Supplier Info */}
          <Card className="p-6 bg-blue-50 border-blue-200">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-blue-900">Fornecedor</h2>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-blue-600 font-medium">Razão Social</p>
                  <p className="text-blue-900">{preview.supplierName}</p>
                </div>
                <div>
                  <p className="text-blue-600 font-medium">CNPJ</p>
                  <p className="text-blue-900">{preview.supplierCnpj}</p>
                </div>
                <div>
                  <p className="text-blue-600 font-medium">NF-e Nº</p>
                  <p className="text-blue-900">{preview.nfeNumber}</p>
                </div>
                <div>
                  <p className="text-blue-600 font-medium">Valor Total</p>
                  <p className="text-blue-900">R$ {preview.totalValue.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Statistics */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-sm text-gray-600">Total de Produtos</p>
              <p className="text-2xl font-bold text-gray-900">{preview.stats.totalProducts}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-600">Preço Mínimo</p>
              <p className="text-2xl font-bold text-gray-900">R$ {preview.stats.priceRangeMin.toFixed(2)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-600">Preço Máximo</p>
              <p className="text-2xl font-bold text-gray-900">R$ {preview.stats.priceRangeMax.toFixed(2)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-600">Preço Médio</p>
              <p className="text-2xl font-bold text-gray-900">R$ {preview.stats.averagePrice.toFixed(2)}</p>
            </Card>
          </div>

          {/* Products Table */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Produtos</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === preview.products.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProducts(new Set(preview.products.map((p: any) => p.id)));
                          } else {
                            setSelectedProducts(new Set());
                          }
                        }}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Produto</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">EAN</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Quantidade</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Preço Unitário</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Total</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {preview.products.map((product: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.id)}
                          onChange={() => handleToggleProduct(product.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{product.productName}</td>
                      <td className="px-4 py-3 text-gray-600">{product.ean || "-"}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{product.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-600">R$ {product.unitPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">R$ {product.totalPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          onClick={() => setEditingProduct(product)}
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
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
                setPreview(null);
                setXmlContent("");
                setSelectedProducts(new Set());
              }}
              variant="outline"
              size="lg"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleImport}
              disabled={selectedProducts.size === 0 || isLoading}
              size="lg"
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Importar {selectedProducts.size} Produto(s)
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
