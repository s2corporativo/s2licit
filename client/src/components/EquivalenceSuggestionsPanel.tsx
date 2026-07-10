/**
 * EquivalenceSuggestionsPanel.tsx
 * Painel de sugestões de equivalência técnica para itens de pregão
 * 
 * Exibe:
 * - Produtos equivalentes com scores de compatibilidade
 * - Justificativas técnicas (atributos compatíveis/incompatíveis)
 * - Preços e informações do fornecedor
 * - Opção de seleção rápida para adicionar à proposta
 */

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, TrendingDown, Package } from "lucide-react";

export interface EquivalentProduct {
  id: number;
  name: string;
  supplierId: number;
  supplierName?: string;
  activeIngredient?: string;
  concentration?: string;
  presentation?: string;
  price?: string;
  priceUnit?: string;
  unit?: string;
  imageUrl?: string;
  score: number;
  scoreBreakdown: {
    activeIngredient: number;
    concentration: number;
    presentation: number;
    other: number;
  };
  justification: string;
}

export interface EquivalenceSuggestion {
  pregoItemId: string;
  pregoItemDescription: string;
  equivalents: EquivalentProduct[];
  bestMatch?: EquivalentProduct;
  totalFound: number;
}

interface EquivalenceSuggestionsPanelProps {
  suggestions: EquivalenceSuggestion[];
  isLoading?: boolean;
  onSelectProduct?: (pregoItemId: string, product: EquivalentProduct) => void;
}

/**
 * Retorna cor baseada no score de compatibilidade
 */
function getScoreColor(score: number): string {
  if (score >= 90) return "bg-green-100 text-green-800 border-green-300";
  if (score >= 70) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  if (score >= 50) return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-red-100 text-red-800 border-red-300";
}

/**
 * Retorna ícone e texto baseado no score
 */
function getScoreIndicator(score: number) {
  if (score >= 90) {
    return { icon: CheckCircle2, text: "Altamente compatível", color: "text-green-600" };
  }
  if (score >= 70) {
    return { icon: CheckCircle2, text: "Compatível", color: "text-yellow-600" };
  }
  if (score >= 50) {
    return { icon: AlertCircle, text: "Parcialmente compatível", color: "text-orange-600" };
  }
  return { icon: AlertCircle, text: "Baixa compatibilidade", color: "text-red-600" };
}

/**
 * Componente de card de produto equivalente
 */
function EquivalentProductCard({
  product,
  pregoItemId,
  onSelect,
}: {
  product: EquivalentProduct;
  pregoItemId: string;
  onSelect?: (pregoItemId: string, product: EquivalentProduct) => void;
}) {
  const indicator = getScoreIndicator(product.score);
  const IconComponent = indicator.icon;

  return (
    <Card className="mb-3 border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
      <CardContent className="pt-4">
        {/* Cabeçalho: Score e Produto */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm text-gray-900">{product.name}</h4>
              <Badge variant="outline" className="text-xs">
                {product.supplierName || "Fornecedor desconhecido"}
              </Badge>
            </div>
            <p className="text-xs text-gray-600">
              {product.activeIngredient && `${product.activeIngredient}`}
              {product.concentration && ` • ${product.concentration}`}
            </p>
          </div>

          {/* Score de Compatibilidade */}
          <div className={`px-3 py-2 rounded-lg border ${getScoreColor(product.score)} text-center`}>
            <div className="text-lg font-bold">{product.score}%</div>
            <div className="text-xs">Compatibilidade</div>
          </div>
        </div>

        {/* Indicador de Compatibilidade */}
        <div className="flex items-center gap-2 mb-3 text-sm">
          <IconComponent className={`w-4 h-4 ${indicator.color}`} />
          <span className={indicator.color}>{indicator.text}</span>
        </div>

        {/* Justificativa */}
        <div className="bg-gray-50 rounded p-2 mb-3 text-xs text-gray-700 border border-gray-200">
          <div className="font-semibold mb-1 text-gray-800">Análise técnica:</div>
          <div>{product.justification}</div>
        </div>

        {/* Detalhes de Preço e Apresentação */}
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          {product.price && (
            <div className="bg-blue-50 p-2 rounded border border-blue-200">
              <div className="text-gray-600">Preço</div>
              <div className="font-semibold text-blue-900">
                R$ {product.price}
                {product.priceUnit && ` / ${product.priceUnit}`}
              </div>
            </div>
          )}
          {product.presentation && (
            <div className="bg-purple-50 p-2 rounded border border-purple-200">
              <div className="text-gray-600">Apresentação</div>
              <div className="font-semibold text-purple-900">{product.presentation}</div>
            </div>
          )}
        </div>

        {/* Breakdown de Score */}
        <div className="grid grid-cols-4 gap-1 mb-3 text-xs">
          <div className="text-center p-1 bg-gray-100 rounded">
            <div className="font-semibold">{product.scoreBreakdown.activeIngredient}%</div>
            <div className="text-gray-600">P. Ativo</div>
          </div>
          <div className="text-center p-1 bg-gray-100 rounded">
            <div className="font-semibold">{product.scoreBreakdown.concentration}%</div>
            <div className="text-gray-600">Concentração</div>
          </div>
          <div className="text-center p-1 bg-gray-100 rounded">
            <div className="font-semibold">{product.scoreBreakdown.presentation}%</div>
            <div className="text-gray-600">Forma</div>
          </div>
          <div className="text-center p-1 bg-gray-100 rounded">
            <div className="font-semibold">{product.scoreBreakdown.other}%</div>
            <div className="text-gray-600">Outros</div>
          </div>
        </div>

        {/* Botão de Seleção */}
        <Button
          size="sm"
          variant="default"
          className="w-full"
          onClick={() => onSelect?.(pregoItemId, product)}
        >
          <Package className="w-4 h-4 mr-2" />
          Selecionar para Proposta
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Painel principal de sugestões de equivalência
 */
export function EquivalenceSuggestionsPanel({
  suggestions,
  isLoading = false,
  onSelectProduct,
}: EquivalenceSuggestionsPanelProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpanded = (pregoItemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(pregoItemId)) {
      newExpanded.delete(pregoItemId);
    } else {
      newExpanded.add(pregoItemId);
    }
    setExpandedItems(newExpanded);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Analisando equivalência técnica...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-gray-500">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma sugestão de equivalência disponível</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {suggestions.map((suggestion) => (
        <Card key={suggestion.pregoItemId} className="overflow-hidden">
          <CardHeader
            className="bg-gradient-to-r from-blue-50 to-indigo-50 cursor-pointer hover:from-blue-100 hover:to-indigo-100 transition-colors"
            onClick={() => toggleExpanded(suggestion.pregoItemId)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <CardTitle className="text-sm font-semibold text-gray-900">
                  {suggestion.pregoItemDescription}
                </CardTitle>
                <p className="text-xs text-gray-600 mt-1">
                  {suggestion.totalFound} produto(s) equivalente(s) encontrado(s)
                </p>
              </div>
              <div className="flex items-center gap-2">
                {suggestion.bestMatch && (
                  <Badge className="bg-green-100 text-green-800 border-green-300">
                    Melhor: {suggestion.bestMatch.score}%
                  </Badge>
                )}
                <div className="text-gray-400">
                  {expandedItems.has(suggestion.pregoItemId) ? "▼" : "▶"}
                </div>
              </div>
            </div>
          </CardHeader>

          {/* Conteúdo Expandido */}
          {expandedItems.has(suggestion.pregoItemId) && (
            <CardContent className="pt-4">
              {suggestion.bestMatch && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="font-semibold text-sm text-green-900">Recomendação Principal</span>
                  </div>
                  <EquivalentProductCard
                    product={suggestion.bestMatch}
                    pregoItemId={suggestion.pregoItemId}
                    onSelect={onSelectProduct}
                  />
                </div>
              )}

              {/* Outros Equivalentes */}
              {suggestion.equivalents.length > 1 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">Outras opções:</h4>
                  <div className="space-y-2">
                    {suggestion.equivalents
                      .filter((p) => p.id !== suggestion.bestMatch?.id)
                      .map((product) => (
                        <EquivalentProductCard
                          key={product.id}
                          product={product}
                          pregoItemId={suggestion.pregoItemId}
                          onSelect={onSelectProduct}
                        />
                      ))}
                  </div>
                </div>
              )}

              {suggestion.equivalents.length === 0 && (
                <div className="text-center py-4 text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhum produto equivalente encontrado no catálogo</p>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

export default EquivalenceSuggestionsPanel;
