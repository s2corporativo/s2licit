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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface BulkEditPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProductIds: number[];
  onSuccess?: () => void;
}

interface BulkEditData {
  pricePercentage?: number | null;
  supplierId?: number | null;
  categoryId?: number | null;
  isActive?: "yes" | "no" | null;
}

export function BulkEditPanel({
  open,
  onOpenChange,
  selectedProductIds,
  onSuccess,
}: BulkEditPanelProps) {
  const [editData, setEditData] = useState<BulkEditData>({
    pricePercentage: null,
    supplierId: null,
    categoryId: null,
    isActive: null,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Set<keyof BulkEditData>>(
    new Set()
  );

  // Queries para dados de referência
  const suppliersQuery = trpc.suppliers.list.useQuery();
  const categoriesQuery = trpc.categories.list.useQuery();

  // Mutation para atualizar em lote
  const bulkUpdateMutation = trpc.products.bulkUpdate.useMutation();

  const handleFieldToggle = (field: keyof BulkEditData) => {
    const newFields = new Set(selectedFields);
    if (newFields.has(field)) {
      newFields.delete(field);
    } else {
      newFields.add(field);
    }
    setSelectedFields(newFields);
  };

  const handleSave = async () => {
    if (selectedProductIds.length === 0 || selectedFields.size === 0) {
      return;
    }

    setIsSaving(true);
    try {
      const updatePayload: Record<string, any> = {
        ids: selectedProductIds,
      };

      if (selectedFields.has("pricePercentage") && editData.pricePercentage !== null && editData.pricePercentage !== undefined) {
        updatePayload.pricePercentage = editData.pricePercentage.toString();
      }
      if (selectedFields.has("supplierId") && editData.supplierId) {
        updatePayload.supplierId = editData.supplierId;
      }
      if (selectedFields.has("categoryId") && editData.categoryId) {
        updatePayload.categoryId = editData.categoryId;
      }
      if (selectedFields.has("isActive") && editData.isActive) {
        updatePayload.isActive = editData.isActive;
      }

      await bulkUpdateMutation.mutateAsync(updatePayload as any);

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Erro ao atualizar produtos:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = selectedFields.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edição em Lote</DialogTitle>
          <DialogDescription>
            {selectedProductIds.length} produto(s) selecionado(s)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Preço */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="pricePercentage"
                checked={selectedFields.has("pricePercentage")}
                onCheckedChange={() => handleFieldToggle("pricePercentage")}
              />
              <Label
                htmlFor="pricePercentage"
                className="cursor-pointer font-medium"
              >
                Ajustar Preço (%)
              </Label>
            </div>
            {selectedFields.has("pricePercentage") && (
              <div className="ml-6 space-y-2">
                <Input
                  type="number"
                  placeholder="Ex: 10 para +10%, -5 para -5%"
                  value={editData.pricePercentage ?? ""}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      pricePercentage: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    })
                  }
                  step="0.01"
                />
                <p className="text-xs text-muted-foreground">
                  Valores positivos aumentam, negativos diminuem
                </p>
              </div>
            )}
          </div>

          {/* Fornecedor */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="supplierId"
                checked={selectedFields.has("supplierId")}
                onCheckedChange={() => handleFieldToggle("supplierId")}
              />
              <Label htmlFor="supplierId" className="cursor-pointer font-medium">
                Alterar Fornecedor
              </Label>
            </div>
            {selectedFields.has("supplierId") && (
              <div className="ml-6">
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={editData.supplierId ?? ""}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      supplierId: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">Selecione um fornecedor...</option>
                  {suppliersQuery.data?.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Categoria */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="categoryId"
                checked={selectedFields.has("categoryId")}
                onCheckedChange={() => handleFieldToggle("categoryId")}
              />
              <Label htmlFor="categoryId" className="cursor-pointer font-medium">
                Alterar Categoria
              </Label>
            </div>
            {selectedFields.has("categoryId") && (
              <div className="ml-6">
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={editData.categoryId ?? ""}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      categoryId: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                >
                  <option value="">Selecione uma categoria...</option>
                  {categoriesQuery.data?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Status */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                checked={selectedFields.has("isActive")}
                onCheckedChange={() => handleFieldToggle("isActive")}
              />
              <Label htmlFor="isActive" className="cursor-pointer font-medium">
                Alterar Status
              </Label>
            </div>
            {selectedFields.has("isActive") && (
              <div className="ml-6">
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={editData.isActive ?? ""}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      isActive: (e.target.value as "yes" | "no") || null,
                    })
                  }
                >
                  <option value="">Selecione um status...</option>
                  <option value="yes">Ativo</option>
                  <option value="no">Inativo</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !isFormValid}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Aplicar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
