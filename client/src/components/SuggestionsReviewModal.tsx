import { ChevronDown, ChevronUp, Check, X, AlertCircle, Edit2, Save, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export type Suggestion = {
  productId: number;
  productName: string;
  currentValues: {
    activeIngredient?: string | null;
    concentration?: string | null;
    category?: string | null;
    subcategory?: string | null;
    manufacturer?: string | null;
    indication?: string | null;
  };
  suggestedValues: {
    activeIngredient?: string | null;
    concentration?: string | null;
    category?: string | null;
    subcategory?: string | null;
    manufacturer?: string | null;
    indication?: string | null;
  };
  confidence: number; // 0-1
  status: "pending" | "accepted" | "rejected" | "edited";
};

interface SuggestionsReviewModalProps {
  open: boolean;
  suggestions: Suggestion[];
  onClose: () => void;
  onApply: (accepted: Suggestion[]) => Promise<void>;
  isLoading?: boolean;
}

export function SuggestionsReviewModal({
  open,
  suggestions,
  onClose,
  onApply,
  isLoading = false,
}: SuggestionsReviewModalProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [localSuggestions, setLocalSuggestions] = useState<Suggestion[]>(suggestions);
  const [applying, setApplying] = useState(false);

  // Sincronizar sugestões quando prop mudar
  if (JSON.stringify(suggestions) !== JSON.stringify(localSuggestions)) {
    setLocalSuggestions(suggestions);
  }

  const handleAccept = (productId: number) => {
    setLocalSuggestions((prev) =>
      prev.map((s) =>
        s.productId === productId ? { ...s, status: "accepted" } : s
      )
    );
  };

  const handleReject = (productId: number) => {
    setLocalSuggestions((prev) =>
      prev.map((s) =>
        s.productId === productId ? { ...s, status: "rejected" } : s
      )
    );
  };

  const handleEdit = (productId: number, field: string, value: string) => {
    setLocalSuggestions((prev) =>
      prev.map((s) =>
        s.productId === productId
          ? {
              ...s,
              status: "edited",
              suggestedValues: {
                ...s.suggestedValues,
                [field]: value || null,
              },
            }
          : s
      )
    );
  };

  const handleReset = (productId: number) => {
    const original = suggestions.find((s) => s.productId === productId);
    if (original) {
      setLocalSuggestions((prev) =>
        prev.map((s) =>
          s.productId === productId ? { ...original } : s
        )
      );
    }
  };

  const handleApplyAll = async () => {
    const accepted = localSuggestions.filter(
      (s) => s.status === "accepted" || s.status === "edited"
    );

    if (accepted.length === 0) {
      toast.error("Nenhuma sugestão foi aceita");
      return;
    }

    setApplying(true);
    try {
      await onApply(accepted);
      toast.success(`${accepted.length} sugestões aplicadas com sucesso`);
      onClose();
    } catch (error) {
      toast.error("Erro ao aplicar sugestões");
      console.error(error);
    } finally {
      setApplying(false);
    }
  };

  const stats = {
    total: localSuggestions.length,
    accepted: localSuggestions.filter((s) => s.status === "accepted").length,
    rejected: localSuggestions.filter((s) => s.status === "rejected").length,
    edited: localSuggestions.filter((s) => s.status === "edited").length,
  };

  const fields = [
    { key: "activeIngredient", label: "Princípio Ativo" },
    { key: "concentration", label: "Concentração" },
    { key: "category", label: "Categoria" },
    { key: "subcategory", label: "Subcategoria" },
    { key: "manufacturer", label: "Fabricante" },
    { key: "indication", label: "Indicação" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisar Sugestões de Enriquecimento</DialogTitle>
        </DialogHeader>

        {/* Estatísticas */}
        <div className="grid grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-600">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.accepted}</div>
            <div className="text-xs text-gray-600">Aceitas</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <div className="text-xs text-gray-600">Rejeitadas</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.edited}</div>
            <div className="text-xs text-gray-600">Editadas</div>
          </div>
        </div>

        {/* Lista de sugestões */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {localSuggestions.map((suggestion) => {
            const isExpanded = expandedId === suggestion.productId;
            const isEditing = editingId === suggestion.productId;
            const statusColor =
              suggestion.status === "accepted"
                ? "bg-green-50 border-l-4 border-l-green-500"
                : suggestion.status === "rejected"
                ? "bg-red-50 border-l-4 border-l-red-500"
                : suggestion.status === "edited"
                ? "bg-blue-50 border-l-4 border-l-blue-500"
                : "bg-white border-l-4 border-l-gray-200";

            return (
              <div key={suggestion.productId} className={`${statusColor} rounded border p-3`}>
                {/* Header */}
                <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : suggestion.productId)}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{suggestion.productName}</div>
                    <div className="text-xs text-gray-500">
                      Confiança: {(suggestion.confidence * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {suggestion.status === "accepted" && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-green-100 text-green-800 rounded">
                        <Check size={12} /> Aceita
                      </span>
                    )}
                    {suggestion.status === "rejected" && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-red-100 text-red-800 rounded">
                        <X size={12} /> Rejeitada
                      </span>
                    )}
                    {suggestion.status === "edited" && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-blue-100 text-blue-800 rounded">
                        <Edit2 size={12} /> Editada
                      </span>
                    )}

                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Detalhes expandidos */}
                {isExpanded && (
                  <div className="mt-3 space-y-3 pt-3 border-t border-gray-200">
                    {fields.map(({ key, label }) => {
                      const current = suggestion.currentValues[key];
                      const suggested = suggestion.suggestedValues[key];

                      if (!suggested) return null;

                      return (
                        <div key={key} className="space-y-1">
                          <div className="text-xs font-semibold text-gray-700">{label}</div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <div className="text-xs text-gray-500 mb-1">Atual:</div>
                              <div className="p-2 bg-white border border-gray-200 rounded text-sm text-gray-600">
                                {current || "—"}
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-gray-500 mb-1">Sugerido:</div>
                              {isEditing ? (
                                <Input
                                  value={suggested || ""}
                                  onChange={(e) =>
                                    handleEdit(suggestion.productId, key, e.target.value)
                                  }
                                  className="text-sm"
                                />
                              ) : (
                                <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900 font-medium">
                                  {suggested}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Ações */}
                    <div className="flex gap-2 pt-2 border-t border-gray-200">
                      {!isEditing ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(suggestion.productId)}
                            className="flex-1"
                          >
                            <Edit2 size={14} className="mr-1" /> Editar
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            onClick={() => handleAccept(suggestion.productId)}
                          >
                            <Check size={14} className="mr-1" /> Aceitar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1"
                            onClick={() => handleReject(suggestion.productId)}
                          >
                            <X size={14} className="mr-1" /> Rejeitar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            className="flex-1 bg-blue-600 hover:bg-blue-700"
                            onClick={() => setEditingId(null)}
                          >
                            <Save size={14} className="mr-1" /> Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleReset(suggestion.productId)}
                          >
                            <RotateCcw size={14} className="mr-1" /> Resetar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleApplyAll}
            disabled={stats.accepted + stats.edited === 0 || applying}
            className="bg-green-600 hover:bg-green-700"
          >
            {applying ? "Aplicando..." : `Aplicar ${stats.accepted + stats.edited} Sugestões`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
