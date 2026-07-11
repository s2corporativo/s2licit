import React, { useState } from "react";
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
import { AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface DuplicateProduct {
  product: {
    name: string;
    concentration?: string;
    presentation?: string;
    gtin?: string;
    mapa?: string;
  };
  existingId: number;
  matchType: "ean_exact" | "mapa_exact";
}

interface ImportDuplicatesReviewModalProps {
  open: boolean;
  duplicates: DuplicateProduct[];
  onResolve: (decisions: Record<number, "skip" | "update" | "replace">) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ImportDuplicatesReviewModal({
  open,
  duplicates,
  onResolve,
  onCancel,
  isLoading = false,
}: ImportDuplicatesReviewModalProps) {
  const [decisions, setDecisions] = useState<Record<number, "skip" | "update" | "replace">>({});

  const handleDecision = (index: number, decision: "skip" | "update" | "replace") => {
    setDecisions((prev) => ({
      ...prev,
      [index]: decision,
    }));
  };

  const allDecided = duplicates.length === 0 || duplicates.every((_, i) => decisions[i]);

  const handleApply = () => {
    if (allDecided) {
      onResolve(decisions);
    }
  };

  const skipCount = Object.values(decisions).filter((d) => d === "skip").length;
  const updateCount = Object.values(decisions).filter((d) => d === "update").length;
  const replaceCount = Object.values(decisions).filter((d) => d === "replace").length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            Duplicados Detectados
          </DialogTitle>
          <DialogDescription>
            {duplicates.length} produto(s) duplicado(s) foram detectados. Escolha como proceder com cada um.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo de Decisões */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="text-center">
              <p className="text-sm text-gray-600">Pular</p>
              <p className="text-lg font-bold text-gray-700">{skipCount}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Atualizar</p>
              <p className="text-lg font-bold text-blue-600">{updateCount}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Substituir</p>
              <p className="text-lg font-bold text-red-600">{replaceCount}</p>
            </div>
          </div>

          {/* Lista de Duplicados */}
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {duplicates.map((dup, index) => (
                <div key={index} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{dup.product.name}</p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {dup.product.concentration && (
                          <Badge variant="outline" className="text-xs">
                            {dup.product.concentration}
                          </Badge>
                        )}
                        {dup.product.presentation && (
                          <Badge variant="outline" className="text-xs">
                            {dup.product.presentation}
                          </Badge>
                        )}
                        {dup.matchType === "ean_exact" && (
                          <Badge className="bg-orange-100 text-orange-800 text-xs">EAN Duplicado</Badge>
                        )}
                        {dup.matchType === "mapa_exact" && (
                          <Badge className="bg-red-100 text-red-800 text-xs">MAPA Duplicado</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Opções de Decisão */}
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      variant={decisions[index] === "skip" ? "default" : "outline"}
                      onClick={() => handleDecision(index, "skip")}
                      className="flex-1"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Pular
                    </Button>
                    <Button
                      size="sm"
                      variant={decisions[index] === "update" ? "default" : "outline"}
                      onClick={() => handleDecision(index, "update")}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Atualizar
                    </Button>
                    <Button
                      size="sm"
                      variant={decisions[index] === "replace" ? "default" : "outline"}
                      onClick={() => handleDecision(index, "replace")}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Substituir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            onClick={handleApply}
            disabled={!allDecided || isLoading}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? "Processando..." : "Aplicar Decisões"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
