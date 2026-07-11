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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ProductEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: number;
  onSuccess?: () => void;
}

interface ProductFormData {
  name: string;
  code: string | null;
  description: string | null;
  activeIngredient: string | null;
  concentration: string | null;
  presentation: string | null;
  unit: string | null;
  manufacturer: string | null;
  barcode: string | null;
  mapa: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  isActive: boolean;
}

interface Product {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  activeIngredient?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  unit?: string | null;
  manufacturer?: string | null;
  barcode?: string | null;
  mapa?: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  isActive?: boolean;
  [key: string]: any;
}

export function ProductEditModal({
  open,
  onOpenChange,
  productId,
  onSuccess,
}: ProductEditModalProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    code: null,
    description: null,
    activeIngredient: null,
    concentration: null,
    presentation: null,
    unit: null,
    manufacturer: null,
    barcode: null,
    mapa: null,
    imageUrl: null,
    productUrl: null,
    isActive: true,
  });

  const [isSaving, setIsSaving] = useState(false);

  // Query para carregar dados do produto
  const productQuery = trpc.products.get.useQuery(
    { id: productId },
    { enabled: open && productId > 0 }
  );

  // Mutation para atualizar produto
  const updateMutation = trpc.products.update.useMutation();

  // Carregar dados do produto quando query retorna
  useEffect(() => {
    if (productQuery.data) {
      setFormData({
        name: productQuery.data.name || "",
        code: productQuery.data.code || null,
        description: productQuery.data.description || null,
        activeIngredient: productQuery.data.activeIngredient || null,
        concentration: productQuery.data.concentration || null,
        presentation: productQuery.data.presentation || null,
        unit: productQuery.data.unit || null,
        manufacturer: productQuery.data.manufacturer || null,
        barcode: productQuery.data.barcode || null,
        mapa: productQuery.data.mapa || null,
        imageUrl: productQuery.data.imageUrl || null,
        productUrl: productQuery.data.productUrl || null,
        isActive: productQuery.data.isActive === "yes" ? true : productQuery.data.isActive !== "no",
      });
    }
  }, [productQuery.data]);

  const handleInputChange = (
    field: keyof ProductFormData,
    value: string | boolean
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value === "" ? null : value,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        id: productId,
        name: formData.name,
        code: formData.code,
        description: formData.description,
        activeIngredient: formData.activeIngredient,
        concentration: formData.concentration,
        presentation: formData.presentation,
        unit: formData.unit,
        manufacturer: formData.manufacturer,
        barcode: formData.barcode,
        mapa: formData.mapa,
        imageUrl: formData.imageUrl,
        productUrl: formData.productUrl,
        isActive: formData.isActive ? "yes" : "no",
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Erro ao salvar produto:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Produto</DialogTitle>
          <DialogDescription>
            Atualize os dados do produto. Todos os campos são opcionais.
          </DialogDescription>
        </DialogHeader>

        {productQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 p-4">
              {/* Informações Básicas */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Informações Básicas</h3>

                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Produto *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    placeholder="Ex: Amoxicilina 500mg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Código</Label>
                    <Input
                      id="code"
                      value={formData.code || ""}
                      onChange={(e) => handleInputChange("code", e.target.value)}
                      placeholder="Ex: AMX-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="barcode">Código de Barras</Label>
                    <Input
                      id="barcode"
                      value={formData.barcode || ""}
                      onChange={(e) =>
                        handleInputChange("barcode", e.target.value)
                      }
                      placeholder="Ex: 7891234567890"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description || ""}
                    onChange={(e) =>
                      handleInputChange("description", e.target.value)
                    }
                    placeholder="Descrição detalhada do produto"
                    rows={3}
                  />
                </div>
              </div>

              {/* Informações Técnicas */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Informações Técnicas</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="activeIngredient">Princípio Ativo</Label>
                    <Input
                      id="activeIngredient"
                      value={formData.activeIngredient || ""}
                      onChange={(e) =>
                        handleInputChange("activeIngredient", e.target.value)
                      }
                      placeholder="Ex: Amoxicilina"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="concentration">Concentração</Label>
                    <Input
                      id="concentration"
                      value={formData.concentration || ""}
                      onChange={(e) =>
                        handleInputChange("concentration", e.target.value)
                      }
                      placeholder="Ex: 500mg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="presentation">Apresentação</Label>
                    <Input
                      id="presentation"
                      value={formData.presentation || ""}
                      onChange={(e) =>
                        handleInputChange("presentation", e.target.value)
                      }
                      placeholder="Ex: Comprimido"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="unit">Unidade</Label>
                    <Input
                      id="unit"
                      value={formData.unit || ""}
                      onChange={(e) => handleInputChange("unit", e.target.value)}
                      placeholder="Ex: Caixa com 10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="manufacturer">Fabricante</Label>
                    <Input
                      id="manufacturer"
                      value={formData.manufacturer || ""}
                      onChange={(e) =>
                        handleInputChange("manufacturer", e.target.value)
                      }
                      placeholder="Ex: Laboratório XYZ"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mapa">MAPA</Label>
                    <Input
                      id="mapa"
                      value={formData.mapa || ""}
                      onChange={(e) => handleInputChange("mapa", e.target.value)}
                      placeholder="Ex: 1234.5678.0001-01"
                    />
                  </div>
                </div>
              </div>

              {/* Links e Imagens */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Links e Imagens</h3>

                <div className="space-y-2">
                  <Label htmlFor="imageUrl">URL da Imagem</Label>
                  <Input
                    id="imageUrl"
                    value={formData.imageUrl || ""}
                    onChange={(e) =>
                      handleInputChange("imageUrl", e.target.value)
                    }
                    placeholder="https://exemplo.com/imagem.jpg"
                    type="url"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="productUrl">URL do Produto</Label>
                  <Input
                    id="productUrl"
                    value={formData.productUrl || ""}
                    onChange={(e) =>
                      handleInputChange("productUrl", e.target.value)
                    }
                    placeholder="https://exemplo.com/produto"
                    type="url"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Status</h3>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) =>
                      handleInputChange("isActive", checked === true)
                    }
                  />
                  <Label htmlFor="isActive" className="cursor-pointer">
                    Produto Ativo
                  </Label>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !formData.name}
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
