import { useState } from "react";
import { AlertCircle, TrendingDown, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface PriceSyncNotificationProps {
  summary: string;
  stats: {
    totalProductsUpdated: number;
    totalPriceChanges: number;
    newSuppliersAdded: number;
    priceIncreases: number;
    priceDecreases: number;
    averagePriceChange: number;
  } | null;
  onDismiss?: () => void;
  onViewDetails?: () => void;
}

/**
 * Component to display price synchronization notifications
 */
export function PriceSyncNotification({
  summary,
  stats,
  onDismiss,
  onViewDetails,
}: PriceSyncNotificationProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isExpanded) {
    return null;
  }

  return (
    <Card className="border-blue-200 bg-blue-50 p-4">
      <div className="flex gap-3">
        <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-blue-900">
              Sincronização de Preços Concluída
            </h4>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-blue-600 hover:text-blue-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Summary Text */}
          <p className="text-sm text-blue-800 mt-2 whitespace-pre-line">
            {summary}
          </p>

          {/* Stats Grid */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
              <div className="bg-white rounded p-2">
                <div className="text-xs text-gray-600">Produtos Atualizados</div>
                <div className="text-lg font-bold text-blue-900">
                  {stats.totalProductsUpdated}
                </div>
              </div>

              <div className="bg-white rounded p-2">
                <div className="text-xs text-gray-600">Mudanças de Preço</div>
                <div className="text-lg font-bold text-blue-900">
                  {stats.totalPriceChanges}
                </div>
              </div>

              <div className="bg-white rounded p-2">
                <div className="text-xs text-gray-600">Novos Fornecedores</div>
                <div className="text-lg font-bold text-green-600">
                  +{stats.newSuppliersAdded}
                </div>
              </div>

              {stats.priceIncreases > 0 && (
                <div className="bg-white rounded p-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-red-600" />
                  <div>
                    <div className="text-xs text-gray-600">Aumentos</div>
                    <div className="text-lg font-bold text-red-600">
                      {stats.priceIncreases}
                    </div>
                  </div>
                </div>
              )}

              {stats.priceDecreases > 0 && (
                <div className="bg-white rounded p-2 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-green-600" />
                  <div>
                    <div className="text-xs text-gray-600">Reduções</div>
                    <div className="text-lg font-bold text-green-600">
                      {stats.priceDecreases}
                    </div>
                  </div>
                </div>
              )}

              {stats.averagePriceChange !== 0 && (
                <div className="bg-white rounded p-2">
                  <div className="text-xs text-gray-600">Variação Média</div>
                  <div
                    className={`text-lg font-bold ${
                      stats.averagePriceChange > 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {stats.averagePriceChange > 0 ? "+" : ""}
                    {stats.averagePriceChange.toFixed(2)}%
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            {onViewDetails && (
              <Button
                variant="outline"
                size="sm"
                onClick={onViewDetails}
                className="text-blue-600 border-blue-300 hover:bg-blue-100"
              >
                Ver Detalhes
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onDismiss}
              className="text-blue-600 border-blue-300 hover:bg-blue-100"
            >
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
