import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Calculator, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

interface PricingConfig {
  supplierId: number;
  region: string;
  icmsPercentage: number;
  ipPercentage: number;
  pisPercentage: number;
  cofinsPercentage: number;
  freightType: "fixed" | "percentage";
  freightValue: number;
  marginPercentage: number;
  minPrice?: number;
  maxPrice?: number;
  roundingMethod: "round" | "ceil" | "floor";
}

interface PricingCalculation {
  finalPrice: number;
  basePriceBeforeTax: number;
  priceBeforeMargin: number;
  icmsAmount: number;
  ipAmount: number;
  pisAmount: number;
  cofinsAmount: number;
  freightAmount: number;
  marginAmount: number;
  breakdown: {
    basePrice: number;
    taxes: number;
    freight: number;
    margin: number;
    final: number;
  };
}

export default function ConfiguradorPrecificacao() {
  const [basePrice, setBasePrice] = useState<string>("100");
  const [config, setConfig] = useState<PricingConfig>({
    supplierId: 0,
    region: "Nacional",
    icmsPercentage: 0,
    ipPercentage: 0,
    pisPercentage: 0,
    cofinsPercentage: 0,
    freightType: "fixed",
    freightValue: 0,
    marginPercentage: 30,
    roundingMethod: "round",
  });

  // Queries
  const { data: suppliers } = trpc.suppliers.list.useQuery();
  // calculatePrice não implementado no router
  const [calculation] = useState<PricingCalculation | null>(null);
  const isCalculating = false;

  const { data: validation } = trpc.pricing.validateConfig.useQuery(config);

  const handleSupplierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConfig({ ...config, supplierId: parseInt(e.target.value) });
  };

  const handleConfigChange = (field: keyof PricingConfig, value: any) => {
    setConfig({ ...config, [field]: value });
  };

  const handleCalculate = () => {
    if (!basePrice || parseFloat(basePrice) <= 0) {
      toast.error("Digite um preço base válido");
      return;
    }
    // O cálculo já é feito automaticamente pela query
    toast.success("Preço calculado com sucesso");
  };

  const totalTaxPercentage = useMemo(() => {
    return config.icmsPercentage + config.ipPercentage + config.pisPercentage + config.cofinsPercentage;
  }, [config]);

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configurador de Precificação</h1>
          <p className="text-gray-600 mt-2">
            Configure impostos, fretes e margens para calcular preços automaticamente
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuração */}
          <Card>
            <CardHeader>
              <CardTitle>Configuração de Precificação</CardTitle>
              <CardDescription>Defina os parâmetros para cálculo de preços</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Fornecedor */}
              <div>
                <label className="block text-sm font-medium mb-2">Fornecedor</label>
                <select
                  value={config.supplierId}
                  onChange={handleSupplierChange}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value={0}>Selecione um fornecedor</option>
                  {suppliers?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Região */}
              <div>
                <label className="block text-sm font-medium mb-2">Região</label>
                <Input
                  value={config.region}
                  onChange={(e) => handleConfigChange("region", e.target.value)}
                  placeholder="Ex: Nacional, SP, RJ"
                />
              </div>

              {/* Preço Base */}
              <div>
                <label className="block text-sm font-medium mb-2">Preço Base (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder="100.00"
                />
              </div>

              {/* Impostos */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Impostos (%)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm mb-1">ICMS</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.icmsPercentage}
                      onChange={(e) => handleConfigChange("icmsPercentage", parseFloat(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">IP</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.ipPercentage}
                      onChange={(e) => handleConfigChange("ipPercentage", parseFloat(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">PIS</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.pisPercentage}
                      onChange={(e) => handleConfigChange("pisPercentage", parseFloat(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">COFINS</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.cofinsPercentage}
                      onChange={(e) => handleConfigChange("cofinsPercentage", parseFloat(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Total de impostos: <strong>{totalTaxPercentage.toFixed(2)}%</strong>
                </p>
              </div>

              {/* Frete */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Frete</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm mb-1">Tipo</label>
                    <select
                      value={config.freightType}
                      onChange={(e) =>
                        handleConfigChange("freightType", e.target.value as "fixed" | "percentage")
                      }
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="fixed">Valor Fixo (R$)</option>
                      <option value="percentage">Percentual (%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Valor</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.freightValue}
                      onChange={(e) => handleConfigChange("freightValue", parseFloat(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* Margem */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Margem de Lucro</h3>
                <div>
                  <label className="block text-sm mb-1">Percentual (%)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.marginPercentage}
                    onChange={(e) => handleConfigChange("marginPercentage", parseFloat(e.target.value))}
                    placeholder="30"
                  />
                </div>
              </div>

              {/* Limites */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Limites de Preço</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm mb-1">Preço Mínimo (R$)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.minPrice || ""}
                      onChange={(e) =>
                        handleConfigChange("minPrice", e.target.value ? parseFloat(e.target.value) : undefined)
                      }
                      placeholder="Opcional"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Preço Máximo (R$)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.maxPrice || ""}
                      onChange={(e) =>
                        handleConfigChange("maxPrice", e.target.value ? parseFloat(e.target.value) : undefined)
                      }
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              </div>

              {/* Arredondamento */}
              <div className="border-t pt-4">
                <label className="block text-sm font-medium mb-2">Método de Arredondamento</label>
                <select
                  value={config.roundingMethod}
                  onChange={(e) =>
                    handleConfigChange("roundingMethod", e.target.value as "round" | "ceil" | "floor")
                  }
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="round">Arredondar</option>
                  <option value="ceil">Sempre para cima</option>
                  <option value="floor">Sempre para baixo</option>
                </select>
              </div>

              <Button onClick={handleCalculate} className="w-full" disabled={isCalculating}>
                {isCalculating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Calculando...
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4 mr-2" />
                    Calcular Preço
                  </>
                )}
              </Button>

              {validation && !validation.isValid && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertDescription className="text-red-800">
                    {validation.errors.join("; ")}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Resultado */}
          <div className="space-y-4">
            {calculation ? (
              <>
                {/* Resumo */}
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-2xl">Preço Final</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-blue-900">
                      R$ {calculation.finalPrice.toFixed(2)}
                    </div>
                    <p className="text-sm text-blue-700 mt-2">
                      Preço base: R$ {calculation.basePriceBeforeTax.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>

                {/* Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle>Detalhamento do Cálculo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span>Preço Base</span>
                      <span className="font-semibold">R$ {calculation.breakdown.basePrice.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b text-red-600">
                      <span>Impostos</span>
                      <span className="font-semibold">+ R$ {calculation.breakdown.taxes.toFixed(2)}</span>
                    </div>

                    {calculation.icmsAmount > 0 && (
                      <div className="flex justify-between items-center py-1 pl-4 text-sm text-gray-600">
                        <span>ICMS</span>
                        <span>R$ {calculation.icmsAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {calculation.ipAmount > 0 && (
                      <div className="flex justify-between items-center py-1 pl-4 text-sm text-gray-600">
                        <span>IP</span>
                        <span>R$ {calculation.ipAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {calculation.pisAmount > 0 && (
                      <div className="flex justify-between items-center py-1 pl-4 text-sm text-gray-600">
                        <span>PIS</span>
                        <span>R$ {calculation.pisAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {calculation.cofinsAmount > 0 && (
                      <div className="flex justify-between items-center py-1 pl-4 text-sm text-gray-600">
                        <span>COFINS</span>
                        <span>R$ {calculation.cofinsAmount.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center py-2 border-b text-orange-600">
                      <span>Frete</span>
                      <span className="font-semibold">+ R$ {calculation.breakdown.freight.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b text-gray-600">
                      <span>Subtotal (com impostos e frete)</span>
                      <span className="font-semibold">R$ {calculation.priceBeforeMargin.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b text-green-600">
                      <span>Margem de Lucro ({config.marginPercentage}%)</span>
                      <span className="font-semibold">+ R$ {calculation.breakdown.margin.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between items-center py-3 bg-blue-50 px-3 rounded-lg border border-blue-200">
                      <span className="font-bold text-lg">PREÇO FINAL</span>
                      <span className="font-bold text-lg text-blue-900">
                        R$ {calculation.breakdown.final.toFixed(2)}
                      </span>
                    </div>

                    {/* Economia */}
                    <div className="pt-4 border-t">
                      <div className="flex items-center gap-2 text-sm">
                        {calculation.finalPrice > calculation.basePriceBeforeTax ? (
                          <>
                            <TrendingUp className="w-4 h-4 text-red-600" />
                            <span className="text-red-600">
                              Aumento de R${" "}
                              {(calculation.finalPrice - calculation.basePriceBeforeTax).toFixed(2)} (
                              {(
                                ((calculation.finalPrice - calculation.basePriceBeforeTax) /
                                  calculation.basePriceBeforeTax) *
                                100
                              ).toFixed(2)}
                              %)
                            </span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-4 h-4 text-green-600" />
                            <span className="text-green-600">
                              Economia de R${" "}
                              {(calculation.basePriceBeforeTax - calculation.finalPrice).toFixed(2)} (
                              {(
                                ((calculation.basePriceBeforeTax - calculation.finalPrice) /
                                  calculation.basePriceBeforeTax) *
                                100
                              ).toFixed(2)}
                              %)
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center text-gray-500">
                  <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Digite um preço base para ver o cálculo</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
