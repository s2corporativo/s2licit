import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";

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
  onSuccess?: (result: unknown) => void;
  onError?: (error: string) => void;
}

export function NfeUploadComponent({ onSuccess, onError }: NfeUploadComponentProps) {
  const [xmlContent, setXmlContent] = useState("");
  const [preview, setPreview] = useState<NfePreview | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const previewMutation = trpc.nfeImport.previewNfeImport.useMutation();
  const importMutation = trpc.nfeImport.importNfeWithSupplier.useMutation();
  const busy = previewMutation.isPending || importMutation.isPending;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setSuccess("");
    setPreview(null);
    setSelectedProducts(new Set());

    if (!file.name.toLowerCase().endsWith(".xml")) {
      setError("Selecione um arquivo XML de NF-e.");
      return;
    }

    try {
      const content = await file.text();
      const result = await previewMutation.mutateAsync({ xmlContent: content });
      if (!result.success || !result.preview) {
        throw new Error(result.error || "Não foi possível validar a NF-e");
      }
      setXmlContent(content);
      setPreview(result.preview as NfePreview);
      setSelectedProducts(new Set(result.preview.products.map((product) => product.id)));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Erro ao ler o XML";
      setError(message);
      onError?.(message);
    }
  };

  const toggleProduct = (productId: string) => {
    setSelectedProducts((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleAll = () => {
    if (!preview) return;
    setSelectedProducts((current) =>
      current.size === preview.products.length
        ? new Set()
        : new Set(preview.products.map((product) => product.id)),
    );
  };

  const handleImport = async () => {
    if (!xmlContent || !preview) {
      setError("Carregue e valide uma NF-e antes de importar.");
      return;
    }
    if (selectedProducts.size === 0) {
      setError("Selecione ao menos um produto.");
      return;
    }

    setError("");
    setSuccess("");
    try {
      const result = await importMutation.mutateAsync({
        xmlContent,
        selectedProductIds: Array.from(selectedProducts),
      });
      if (!result.success) throw new Error(result.error || "A importação não foi concluída");

      setSuccess(`${result.productsImported} produto(s) importado(s) integralmente da NF-e ${result.nfeNumber}.`);
      setXmlContent("");
      setPreview(null);
      setSelectedProducts(new Set());
      onSuccess?.(result);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Erro ao importar NF-e";
      setError(message);
      onError?.(message);
    }
  };

  return (
    <div className="space-y-5">
      {success && (
        <Card className="border-green-200 bg-green-50 p-4">
          <div className="flex gap-3 text-green-900">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="text-sm">{success}</p>
          </div>
        </Card>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50 p-4">
          <div className="flex gap-3 text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <Upload className="h-12 w-12 text-gray-400" />
          <div>
            <h3 className="text-lg font-semibold">Importar Nota Fiscal Eletrônica</h3>
            <p className="text-sm text-gray-500">O XML será validado antes de qualquer gravação.</p>
          </div>
          <input
            id="nfe-file-input"
            type="file"
            accept=".xml,application/xml,text/xml"
            onChange={handleFileUpload}
            disabled={busy}
            className="hidden"
          />
          <Button asChild variant="outline" disabled={busy}>
            <label htmlFor="nfe-file-input" className="cursor-pointer">
              {previewMutation.isPending ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Validando</> : "Selecionar XML"}
            </label>
          </Button>
        </div>
      </Card>

      {preview && (
        <>
          <Card className="border-green-200 bg-green-50 p-4">
            <div className="grid gap-2 text-sm text-green-900 md:grid-cols-3">
              <p><strong>NF-e:</strong> {preview.nfeNumber}</p>
              <p><strong>Fornecedor:</strong> {preview.supplierName}</p>
              <p><strong>CNPJ:</strong> {preview.supplierCnpj}</p>
              <p><strong>Itens:</strong> {preview.products.length}</p>
              <p><strong>Valor:</strong> {preview.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
              <p><strong>Selecionados:</strong> {selectedProducts.size}</p>
            </div>
          </Card>

          <Card className="overflow-x-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-semibold">Produtos extraídos</h4>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {selectedProducts.size === preview.products.length ? "Desmarcar todos" : "Selecionar todos"}
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="p-2 text-left">Importar</th>
                  <th className="p-2 text-left">Produto</th>
                  <th className="p-2 text-left">EAN</th>
                  <th className="p-2 text-right">Quantidade</th>
                  <th className="p-2 text-right">Preço unitário</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.products.map((product) => (
                  <tr key={product.id}>
                    <td className="p-2"><Checkbox checked={selectedProducts.has(product.id)} onCheckedChange={() => toggleProduct(product.id)} /></td>
                    <td className="p-2 font-medium">{product.productName}</td>
                    <td className="p-2 font-mono text-xs">{product.ean || "—"}</td>
                    <td className="p-2 text-right">{product.quantity}</td>
                    <td className="p-2 text-right">{Number(product.unitPrice).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                    <td className="p-2 text-right">{Number(product.totalPrice).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Button className="w-full" size="lg" onClick={handleImport} disabled={busy || selectedProducts.size === 0}>
            {importMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importando</> : `Importar ${selectedProducts.size} produto(s)`}
          </Button>
        </>
      )}
    </div>
  );
}
