import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Calculator, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface PricingConfig {
  icmsPercentage: number;
  ipPercentage: number;
  pisPercentage: number;
  cofinsPercentage: number;
  freightType: "fixed" | "percentage";
  freightValue: number;
  marginPercentage: number;
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ConfiguradorPrecificacao() {
  const [basePrice, setBasePrice] = useState<string>("100");
  const [config, setConfig] = useState<PricingConfig>({
    icmsPercentage: 0,
    ipPercentage: 0,
    pisPercentage: 0,
    cofinsPercentage: 0,
    freightType: "fixed",
    freightValue: 0,
    marginPercentage: 30,
  });

  const [payload, setPayload] = useState<any>(null);
  const calcQuery = trpc.precificacao.sugerirLote.useQuery(payload, {
    enabled: payload != null,
    retry: false,
  });
  const isCalculating = payload != null && calcQuery.isFetching;

  const handleConfigChange = (field: keyof PricingConfig, value: any) => {
    setConfig({ ...config, [field]: value });
  };

  const handleCalculate = () => {
    const custo = parseFloat(basePrice.replace(",", "."));
    if (!custo || custo <= 0) {
      toast.error("Digite um preço base válido");
      return;
    }
    setPayload({
      itens: [{ custo, quantidade: 1 }],
      impostos: {
        icmsPercentage: config.icmsPercentage,
        ipPercentage: config.ipPercentage,
        pisPercentage: config.pisPercentage,
        cofinsPercentage: config.cofinsPercentage,
        freightType: config.freightType,
        freightValue: config.freightValue,
      },
      margemDesejada: config.marginPercentage,
    });
  };

  const totalTaxPercentage = useMemo(() => {
    return config.icmsPercentage + config.ipPercentage + config.pisPercentage + config.cofinsPercentage;
  }, [config]);

  const resultado = calcQuery.data;
  const item = resultado?.itens?.[0];

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
              {/* Preço Base */}
              <div>
                <label className="block text-sm font-medium mb-2">Preço Base / Custo (R$)</label>
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
                      onChange={(e) => handleConfigChange("icmsPercentage", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">IP</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.ipPercentage}
                      onChange={(e) => handleConfigChange("ipPercentage", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">PIS</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.pisPercentage}
                      onChange={(e) => handleConfigChange("pisPercentage", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-1">COFINS</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.cofinsPercentage}
                      onChange={(e) => handleConfigChange("cofinsPercentage", parseFloat(e.target.value) || 0)}
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
                      onChange={(e) => handleConfigChange("freightValue", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* Margem */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Margem de Lucro Desejada</h3>
                <div>
                  <label className="block text-sm mb-1">Percentual (%)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.marginPercentage}
                    onChange={(e) => handleConfigChange("marginPercentage", parseFloat(e.target.value) || 0)}
                    placeholder="30"
                  />
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  A margem mínima (piso) é a configurada nos dados da empresa.
                </p>
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

              {calcQuery.error && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertDescription className="text-red-800">{calcQuery.error.message}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Resultado */}
          <div className="space-y-4">
            {resultado && item ? (
              <>
                {/* Resumo */}
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-2xl">Preço Sugerido</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-blue-900">{brl(item.sugerido)}</div>
                    <p className="text-sm text-blue-700 mt-2">
                      Custo base: {brl(item.custo)} · Margem no sugerido: {item.margemNoSugerido.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>

                {/* Detalhamento */}
                <Card>
                  <CardHeader>
                    <CardTitle>Detalhamento do Cálculo</CardTitle>
                    <CardDescription>
                      Margens aplicadas: mínima {resultado.margemMinima}% / desejada {resultado.margemDesejada}%
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span>Custo Base</span>
                      <span className="font-semibold">{brl(item.custo)}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b text-red-600">
                      <span>PISO (não desça abaixo)</span>
                      <span className="font-semibold">{brl(item.piso)}</span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b text-gray-600">
                      <span>Alvo (margem desejada)</span>
                      <span className="font-semibold">{brl(item.alvo)}</span>
                    </div>

                    <div className="flex justify-between items-center py-3 bg-blue-50 px-3 rounded-lg border border-blue-200">
                      <span className="font-bold text-lg">PREÇO SUGERIDO</span>
                      <span className="font-bold text-lg text-blue-900">{brl(item.sugerido)}</span>
                    </div>

                    {item.alerta && (
                      <Alert className="bg-amber-50 border-amber-200">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-amber-800">{item.alerta}</AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center text-gray-500">
                  <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Digite um preço base e clique em "Calcular Preço" para ver o cálculo</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
