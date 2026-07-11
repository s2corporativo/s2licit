import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Package, Users, TrendingDown } from "lucide-react";

interface ConsolidationStats {
  consolidationRate: number;
  avgSuppliersPerProduct: number;
  totalUniqueSuppliers: number;
  productsWithMultipleSuppliers: number;
}

interface ConsolidationGroup {
  signature: string;
  masterName: string;
  count: number;
  suppliers: Array<{
    id?: number;
    name?: string;
    price?: string;
  }>;
}

interface ConsolidationPreviewData {
  willCreateProducts: number;
  willConsolidateDuplicates: number;
  totalSuppliersInImport: number;
  productsWithMultipleSuppliers: number;
}

interface ConsolidationPreviewModalProps {
  isOpen: boolean;
  isLoading: boolean;
  stats?: ConsolidationStats;
  consolidatedGroups?: ConsolidationGroup[];
  previewData?: ConsolidationPreviewData;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConsolidationPreviewModal({
  isOpen,
  isLoading,
  stats,
  consolidatedGroups = [],
  previewData,
  onConfirm,
  onCancel,
}: ConsolidationPreviewModalProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (signature: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(signature)) {
      newExpanded.delete(signature);
    } else {
      newExpanded.add(signature);
    }
    setExpandedGroups(newExpanded);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-500" />
            Revisão de Consolidação
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-3">Analisando consolidações...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Estatísticas Resumidas */}
            {previewData && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Produtos Únicos</p>
                      <p className="text-2xl font-bold text-green-600">
                        {previewData.willCreateProducts}
                      </p>
                    </div>
                    <Package className="h-8 w-8 text-green-500 opacity-20" />
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Duplicatas</p>
                      <p className="text-2xl font-bold text-orange-600">
                        {previewData.willConsolidateDuplicates}
                      </p>
                    </div>
                    <TrendingDown className="h-8 w-8 text-orange-500 opacity-20" />
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Fornecedores</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {previewData.totalSuppliersInImport}
                      </p>
                    </div>
                    <Users className="h-8 w-8 text-blue-500 opacity-20" />
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Multi-Fornecedor</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {previewData.productsWithMultipleSuppliers}
                      </p>
                    </div>
                    <CheckCircle2 className="h-8 w-8 text-purple-500 opacity-20" />
                  </div>
                </Card>
              </div>
            )}

            {/* Estatísticas Detalhadas */}
            {stats && (
              <Card className="p-4 bg-blue-50 border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-3">Estatísticas de Consolidação</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-blue-700">Taxa de Consolidação</p>
                    <p className="text-lg font-bold text-blue-900">{stats.consolidationRate}%</p>
                  </div>
                  <div>
                    <p className="text-blue-700">Média de Fornecedores</p>
                    <p className="text-lg font-bold text-blue-900">{stats.avgSuppliersPerProduct}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Grupos de Consolidação */}
            <div>
              <h3 className="font-semibold mb-3">Grupos de Consolidação</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {consolidatedGroups.map((group) => (
                  <Card key={group.signature} className="p-3">
                    <button
                      onClick={() => toggleGroup(group.signature)}
                      className="w-full text-left flex items-center justify-between hover:bg-gray-50 p-2 rounded"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{group.masterName}</p>
                        <p className="text-sm text-gray-500">
                          {group.count} produto{group.count > 1 ? "s" : ""} • {group.suppliers.length} fornecedor
                          {group.suppliers.length > 1 ? "es" : ""}
                        </p>
                      </div>
                      <span className="text-gray-400">
                        {expandedGroups.has(group.signature) ? "▼" : "▶"}
                      </span>
                    </button>

                    {expandedGroups.has(group.signature) && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="space-y-2">
                          {group.suppliers.map((supplier, idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm pl-4">
                              <span className="text-gray-700">{supplier.name || "Sem fornecedor"}</span>
                              <span className="font-semibold text-gray-900">
                                {supplier.price ? `R$ ${supplier.price}` : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>

            {/* Aviso */}
            <Card className="p-4 bg-amber-50 border-amber-200">
              <p className="text-sm text-amber-900">
                <strong>ℹ️ Nota:</strong> Produtos com o mesmo nome, concentração e apresentação serão consolidados em uma única entrada com preços de cada fornecedor.
              </p>
            </Card>
          </div>
        )}

        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
            {isLoading ? "Processando..." : "Confirmar e Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
