import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ReclassificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ReclassificationSuggestion {
  productId: number;
  productName: string;
  currentCategory: string | null;
  suggestedCategory: string;
  approved: boolean;
}

export function ReclassificationModal({
  open,
  onOpenChange,
  onSuccess,
}: ReclassificationModalProps) {
  const [step, setStep] = useState<"loading" | "review" | "applying">("loading");
  const [suggestions, setSuggestions] = useState<ReclassificationSuggestion[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    processed: 0,
    failed: 0,
  });
  const [progress, setProgress] = useState(0);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  const listProductsQuery = trpc.reclassificacao.listProductsNeedingReclassification.useQuery(
    { limit: 50, offset: 0 },
    { enabled: open && step === "loading" }
  );

  const reclassifyMutation = trpc.reclassificacao.suggestReclassification.useMutation();
  const applyMutation = trpc.reclassificacao.applySuggestions.useMutation();

  useEffect(() => {
    if (open && step === "loading" && listProductsQuery.data) {
      const products = listProductsQuery.data.products;
      if (products.length === 0) {
        setMessage({
          type: "info",
          text: "Todos os produtos já possuem categoria atribuída.",
        });
        setTimeout(() => onOpenChange(false), 2000);
        return;
      }

      setSelectedProductIds(products.map((p) => p.id));
      handleReclassify(products.map((p) => p.id));
    }
  }, [open, step, listProductsQuery.data]);

  const handleReclassify = async (productIds: number[]) => {
    try {
      const result = await reclassifyMutation.mutateAsync({
        productIds,
      });

      setStats({
        total: productIds.length,
        processed: result.processed,
        failed: result.failed,
      });

      // Mapear sugestões para interface
      const mappedSuggestions: ReclassificationSuggestion[] = [];
      const products = listProductsQuery.data?.products || [];

      for (const product of products) {
        const suggestionId = product.id as unknown as number;
        if (result.suggestions[suggestionId]) {
          mappedSuggestions.push({
            productId: product.id,
            productName: product.name,
            currentCategory: product.categoryId?.toString() || null,
            suggestedCategory: result.suggestions[suggestionId],
            approved: true,
          });
        }
      }

      setSuggestions(mappedSuggestions);
      setStep("review");
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Erro desconhecido",
      });
      setTimeout(() => onOpenChange(false), 2000);
    }
  };

  const handleToggleApproval = (productId: number) => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.productId === productId ? { ...s, approved: !s.approved } : s
      )
    );
  };

  const handleApplySuggestions = async () => {
    const approvedSuggestions = suggestions.filter((s) => s.approved);

    if (approvedSuggestions.length === 0) {
      setMessage({
        type: "warning",
        text: "Selecione pelo menos uma sugestão para aplicar.",
      });
      return;
    }

    setStep("applying");
    setProgress(0);

    try {
      const suggestionMap: Record<string, string> = {};
      for (const suggestion of approvedSuggestions) {
        suggestionMap[suggestion.productId.toString()] =
          suggestion.suggestedCategory;
      }

      const result = await applyMutation.mutateAsync({
        suggestions: suggestionMap,
      });

      setProgress(100);
      setMessage({
        type: "success",
        text: `${result.applied} de ${result.total} produtos reclassificados com sucesso.`,
      });

      setTimeout(() => {
        onOpenChange(false);
        onSuccess?.();
      }, 1500);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Erro desconhecido",
      });
      setStep("review");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Reclassificação em Lote via IA</DialogTitle>
          <DialogDescription>
            Classifique automaticamente produtos sem categoria usando inteligência artificial
          </DialogDescription>
        </DialogHeader>

        {step === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Analisando produtos sem categoria...
            </p>
          </div>
        )}

        {step === "review" && (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Total de produtos</p>
                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Processados</p>
                <p className="text-2xl font-bold text-green-600">{stats.processed}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Erros</p>
                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
              </div>
            </div>

            <div className="border rounded-lg">
              <div className="bg-muted p-4 border-b">
                <p className="text-sm font-semibold">
                  Sugestões de Reclassificação ({suggestions.length})
                </p>
              </div>
              <ScrollArea className="h-[300px]">
                <div className="p-4 space-y-3">
                  {suggestions.map((suggestion) => (
                    <div
                      key={suggestion.productId}
                      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleToggleApproval(suggestion.productId)}
                    >
                      <input
                        type="checkbox"
                        checked={suggestion.approved}
                        onChange={() => handleToggleApproval(suggestion.productId)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {suggestion.productName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Atual: {suggestion.currentCategory || "Sem categoria"}
                        </p>
                      </div>
                      <Badge variant="outline" className="ml-2">
                        {suggestion.suggestedCategory}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p>
                {suggestions.filter((s) => s.approved).length} de{" "}
                {suggestions.length} sugestões selecionadas para aplicar
              </p>
            </div>
          </div>
        )}

        {step === "applying" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Aplicando reclassificações...
            </p>
            <Progress value={progress} className="w-full max-w-xs" />
          </div>
        )}

        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700"
                : message.type === "error"
                ? "bg-red-50 text-red-700"
                : message.type === "warning"
                ? "bg-amber-50 text-amber-700"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={step === "applying"}
          >
            Cancelar
          </Button>
          {step === "review" && (
            <Button
              onClick={handleApplySuggestions}
              disabled={suggestions.filter((s) => s.approved).length === 0}
            >
              Aplicar Sugestões
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
