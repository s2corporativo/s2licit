import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: number;
  name: string;
  price: number;
  selected: boolean;
  newPrice?: number;
}

export default function AplicarPrecificacao() {
  const [products, setProducts] = useState<Product[]>([]);
  const [marginPercentage, setMarginPercentage] = useState<string>("30");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  const selectedProducts = products.filter((p) => p.selected);
  const totalSelected = selectedProducts.length;

  const handleSelectAll = (checked: boolean) => {
    setProducts(products.map((p) => ({ ...p, selected: checked })));
  };

  const handleSelectProduct = (id: number, checked: boolean) => {
    setProducts(products.map((p) => (p.id === id ? { ...p, selected: checked } : p)));
  };

  const handleCalculatePreview = () => {
    const margin = parseFloat(marginPercentage) || 30;
    const updatedProducts = products.map((p) => ({
      ...p,
      newPrice: p.selected ? Math.round(p.price * (1 + margin / 100) * 100) / 100 : p.price,
    }));
    setProducts(updatedProducts);
    toast.success(`Prévia calculada para ${totalSelected} produtos`);
  };

  const applyBulkMutation = trpc.bulkPricing.applyBulkPricing.useMutation();

  const handleApplyPricing = async () => {
    if (totalSelected === 0) {
      toast.error("Selecione pelo menos um produto");
      return;
    }

    setIsApplying(true);
    try {
      const result = await applyBulkMutation.mutateAsync({
        productIds: selectedProducts.map((p) => p.id),
        marginPercentage: parseFloat(marginPercentage) || 30,
      });
      setAppliedCount(result.updatedCount);
      toast.success(`${result.updatedCount} produtos atualizados com sucesso!`);
    } catch (error) {
      toast.error("Erro ao aplicar precificação");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Aplicar Precificação em Massa</h1>
          <p className="text-gray-600 mt-2">
            Selecione produtos e aplique uma nova precificação com margem configurável
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Resumo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Produtos Selecionados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalSelected}</div>
              <p className="text-xs text-gray-500 mt-1">de {products.length} produtos</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Margem de Lucro</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{marginPercentage}%</div>
              <p className="text-xs text-gray-500 mt-1">configurada</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Aplicados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{appliedCount}</div>
              <p className="text-xs text-gray-500 mt-1">com sucesso</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Economia Média</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {selectedProducts.length > 0
                  ? `R$ ${(
                      selectedProducts.reduce((acc, p) => acc + ((p.newPrice || p.price) - p.price), 0) /
                      selectedProducts.length
                    ).toFixed(2)}`
                  : "R$ 0"}
              </div>
              <p className="text-xs text-gray-500 mt-1">por produto</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuração */}
          <Card>
            <CardHeader>
              <CardTitle>Configuração</CardTitle>
              <CardDescription>Defina os parâmetros de aplicação</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Margem de Lucro (%)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={marginPercentage}
                  onChange={(e) => setMarginPercentage(e.target.value)}
                  placeholder="30"
                />
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  A margem será aplicada ao preço base de cada produto selecionado.
                </AlertDescription>
              </Alert>

              <Button onClick={handleCalculatePreview} className="w-full" variant="outline">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Calculando...
                  </>
                ) : (
                  "Calcular Prévia"
                )}
              </Button>

              <Button
                onClick={handleApplyPricing}
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={totalSelected === 0 || isApplying}
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Aplicando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Aplicar Precificação
                  </>
                )}
              </Button>

              {appliedCount > 0 && (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    {appliedCount} produtos atualizados com sucesso!
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Lista de Produtos */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Produtos</CardTitle>
                <CardDescription>Selecione os produtos para aplicar precificação</CardDescription>
              </CardHeader>
              <CardContent>
                {products.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>Nenhum produto disponível</p>
                    <p className="text-sm mt-1">Importe produtos para começar</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {/* Cabeçalho com checkbox */}
                    <div className="flex items-center gap-3 pb-3 border-b sticky top-0 bg-white">
                      <Checkbox
                        checked={products.every((p) => p.selected)}
                        onCheckedChange={handleSelectAll}
                      />
                      <span className="text-sm font-medium flex-1">Selecionar Todos</span>
                      <span className="text-xs text-gray-500">{totalSelected} selecionados</span>
                    </div>

                    {/* Produtos */}
                    {products.map((product) => (
                      <div key={product.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                        <Checkbox
                          checked={product.selected}
                          onCheckedChange={(checked) => handleSelectProduct(product.id, checked as boolean)}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{product.name}</p>
                          <p className="text-xs text-gray-500">
                            Preço atual: R$ {product.price.toFixed(2)}
                            {product.newPrice && ` → R$ ${product.newPrice.toFixed(2)}`}
                          </p>
                        </div>
                        {product.newPrice && product.newPrice !== product.price && (
                          <div className="text-right">
                            <p className="text-xs font-medium text-green-600">
                              +R$ {(product.newPrice - product.price).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
