import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, CheckCircle, AlertCircle } from "lucide-react";

export function AIEnrichment() {
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const enrichMutation = trpc.aiEnrichment.enrichProduct.useMutation();

  const handleEnrich = async () => {
    if (!productName.trim()) return;

    setIsLoading(true);
    try {
      const response = await enrichMutation.mutateAsync({
        name: productName,
        description: description || undefined,
        manufacturer: manufacturer || undefined,
      });

      setResult(response);
    } catch (error) {
      console.error("Erro ao enriquecer:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "bg-green-100 text-green-800";
    if (confidence >= 60) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Enriquecimento com IA</h1>
        <p className="text-gray-600 mt-2">
          Extraia automaticamente campos faltantes de produtos usando IA
        </p>
      </div>

      {/* Input Section */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Dados do Produto</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Nome do Produto *
            </label>
            <Input
              placeholder="Ex: Amoxicilina 500mg"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Descrição
            </label>
            <Textarea
              placeholder="Cole aqui a descrição completa do produto..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Fabricante
            </label>
            <Input
              placeholder="Ex: Laboratório XYZ"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <Button
            onClick={handleEnrich}
            disabled={!productName.trim() || isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enriquecendo...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Enriquecer com IA
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Results Section */}
      {result && (
        <div className="space-y-4">
          {/* Score Card */}
          <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Score de Qualidade</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Avalia a completude e confiança do enriquecimento
                </p>
              </div>
              <div className={`text-4xl font-bold ${getScoreColor(result.score)}`}>
                {result.score}
              </div>
            </div>
          </Card>

          {/* Validation Status */}
          {result.validation && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-3">
                {result.validation.valid ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <h3 className="font-semibold text-green-900">
                      Validação Passou
                    </h3>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <h3 className="font-semibold text-red-900">
                      Validação Falhou
                    </h3>
                  </>
                )}
              </div>

              {result.validation.errors.length > 0 && (
                <ul className="space-y-2 mt-3">
                  {result.validation.errors.map((error: string, i: number) => (
                    <li key={i} className="text-sm text-red-700">
                      • {error}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* Enriched Fields */}
          {result.enriched && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Campos Extraídos</h3>
                <Badge className={getConfidenceColor(result.enriched.confidence)}>
                  Confiança: {result.enriched.confidence}%
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {result.enriched.activeIngredient && (
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="text-xs text-gray-600 font-medium">
                      Ingrediente Ativo
                    </div>
                    <div className="text-sm font-semibold mt-1">
                      {result.enriched.activeIngredient}
                    </div>
                  </div>
                )}

                {result.enriched.concentration && (
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="text-xs text-gray-600 font-medium">
                      Concentração
                    </div>
                    <div className="text-sm font-semibold mt-1">
                      {result.enriched.concentration}
                    </div>
                  </div>
                )}

                {result.enriched.unit && (
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="text-xs text-gray-600 font-medium">
                      Unidade
                    </div>
                    <div className="text-sm font-semibold mt-1">
                      {result.enriched.unit}
                    </div>
                  </div>
                )}

                {result.enriched.manufacturer && (
                  <div className="p-3 bg-gray-50 rounded">
                    <div className="text-xs text-gray-600 font-medium">
                      Fabricante
                    </div>
                    <div className="text-sm font-semibold mt-1">
                      {result.enriched.manufacturer}
                    </div>
                  </div>
                )}

                {result.enriched.indication && (
                  <div className="p-3 bg-gray-50 rounded col-span-2">
                    <div className="text-xs text-gray-600 font-medium">
                      Indicação
                    </div>
                    <div className="text-sm font-semibold mt-1">
                      {result.enriched.indication}
                    </div>
                  </div>
                )}

                {result.enriched.contraindication && (
                  <div className="p-3 bg-gray-50 rounded col-span-2">
                    <div className="text-xs text-gray-600 font-medium">
                      Contraindicação
                    </div>
                    <div className="text-sm font-semibold mt-1">
                      {result.enriched.contraindication}
                    </div>
                  </div>
                )}

                {result.enriched.dosage && (
                  <div className="p-3 bg-gray-50 rounded col-span-2">
                    <div className="text-xs text-gray-600 font-medium">
                      Dosagem
                    </div>
                    <div className="text-sm font-semibold mt-1">
                      {result.enriched.dosage}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t">
                <div className="text-xs text-gray-600 font-medium mb-2">
                  Campos Extraídos ({result.enriched.fieldsExtracted.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.enriched.fieldsExtracted.map((field: string) => (
                    <Badge key={field} variant="outline">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* Merged Product */}
          {result.merged && (
            <Card className="p-6 bg-green-50 border-green-200">
              <h3 className="font-semibold text-green-900 mb-3">
                Produto Enriquecido (Pronto para Salvar)
              </h3>
              <div className="bg-white p-3 rounded text-sm font-mono text-gray-700 overflow-auto max-h-48">
                <pre>{JSON.stringify(result.merged, null, 2)}</pre>
              </div>
              <Button className="mt-3 w-full bg-green-600 hover:bg-green-700">
                Salvar Produto Enriquecido
              </Button>
            </Card>
          )}
        </div>
      )}

      {/* Empty State */}
      {!result && !isLoading && (
        <Card className="p-12 text-center">
          <Zap className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">
            Preencha os dados do produto e clique em "Enriquecer com IA"
          </p>
          <p className="text-sm text-gray-500 mt-1">
            A IA extrairá automaticamente campos como ingrediente ativo,
            concentração, indicações e mais
          </p>
        </Card>
      )}
    </div>
  );
}
