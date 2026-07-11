import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Check, X, Merge } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface DuplicateGroup {
  groupId: string;
  products: Array<{
    id: number;
    name: string;
    concentration: string | null;
    presentation: string | null;
    manufacturer: string | null;
    similarity: number;
  }>;
  similarity: number;
}

interface DuplicateAction {
  groupId: string;
  action: "merge" | "replace" | "keep-separate";
  primaryProductId?: number;
  secondaryProductId?: number;
}

interface DuplicatesReviewModalProps {
  isOpen: boolean;
  duplicateGroups: DuplicateGroup[];
  onClose: () => void;
  onApply: (actions: DuplicateAction[]) => Promise<void>;
  isLoading?: boolean;
}

export function DuplicatesReviewModal({
  isOpen,
  duplicateGroups,
  onClose,
  onApply,
  isLoading = false,
}: DuplicatesReviewModalProps) {
  const [actions, setActions] = useState<Map<string, DuplicateAction>>(new Map());
  const [isApplying, setIsApplying] = useState(false);

  const handleMerge = (groupId: string, primaryId: number, secondaryId: number) => {
    setActions((prev) => {
      const newMap = new Map(prev);
      newMap.set(groupId, {
        groupId,
        action: "merge",
        primaryProductId: primaryId,
        secondaryProductId: secondaryId,
      });
      return newMap;
    });
  };

  const handleReplace = (groupId: string, oldId: number, newId: number) => {
    setActions((prev) => {
      const newMap = new Map(prev);
      newMap.set(groupId, {
        groupId,
        action: "replace",
        primaryProductId: newId,
        secondaryProductId: oldId,
      });
      return newMap;
    });
  };

  const handleKeepSeparate = (groupId: string) => {
    setActions((prev) => {
      const newMap = new Map(prev);
      newMap.set(groupId, {
        groupId,
        action: "keep-separate",
      });
      return newMap;
    });
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await onApply(Array.from(actions.values()));
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const decidedCount = actions.size;
  const totalCount = duplicateGroups.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            Revisar Produtos Duplicados
          </DialogTitle>
          <DialogDescription>
            Encontrados {totalCount} grupo(s) de produtos duplicados. Decida como proceder com cada um.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progresso */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Progresso</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{ width: `${(decidedCount / totalCount) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-medium">
                  {decidedCount} / {totalCount} decididos
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Grupos */}
          <div className="space-y-3">
            {duplicateGroups.map((group) => {
              const action = actions.get(group.groupId);
              const isPrimary = group.products[0];

              return (
                <Card key={group.groupId} className={action ? "border-green-200 bg-green-50" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{isPrimary?.name}</CardTitle>
                        <CardDescription>
                          Similaridade: {(group.similarity * 100).toFixed(0)}% • {group.products.length} produtos
                        </CardDescription>
                      </div>
                      {action && (
                        <Badge className="bg-green-600">
                          <Check className="h-3 w-3 mr-1" />
                          {action.action === "merge" ? "Mesclar" : action.action === "replace" ? "Substituir" : "Manter"}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {/* Produtos no Grupo */}
                    <div className="space-y-2">
                      {group.products.map((product, idx) => (
                        <div
                          key={product.id}
                          className="p-2 bg-white border rounded text-sm space-y-1"
                        >
                          <div className="font-medium">
                            {idx === 0 && <Badge className="mr-2">Principal</Badge>}
                            {product.name}
                          </div>
                          <div className="text-xs text-gray-600 space-y-0.5">
                            {product.concentration && <div>Concentração: {product.concentration}</div>}
                            {product.presentation && <div>Apresentação: {product.presentation}</div>}
                            {product.manufacturer && <div>Fabricante: {product.manufacturer}</div>}
                            <div>ID: {product.id}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Ações */}
                    {!action && (
                      <div className="flex gap-2 pt-2">
                        {group.products.length === 2 && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleMerge(
                                  group.groupId,
                                  group.products[0].id,
                                  group.products[1].id
                                )
                              }
                              className="flex-1"
                            >
                              <Merge className="h-3 w-3 mr-1" />
                              Mesclar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleReplace(
                                  group.groupId,
                                  group.products[1].id,
                                  group.products[0].id
                                )
                              }
                              className="flex-1"
                            >
                              Substituir
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleKeepSeparate(group.groupId)}
                          className="flex-1"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Manter Separados
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Aviso */}
          {decidedCount < totalCount && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Você precisa decidir sobre todos os {totalCount} grupos antes de aplicar.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isApplying}>
            Cancelar
          </Button>
          <Button
            onClick={handleApply}
            disabled={decidedCount < totalCount || isApplying || isLoading}
            className="bg-green-600 hover:bg-green-700"
          >
            {isApplying ? "Aplicando..." : "Aplicar Decisões"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
