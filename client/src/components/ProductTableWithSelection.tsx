import React, { useState, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Product {
  id: number;
  name: string;
  code?: string | null;
  activeIngredient?: string | null;
  manufacturer?: string | null;
  concentration?: string | null;
  presentation?: string | null;
  price?: string | null;
  imageUrl?: string | null;
  isActive?: string;
  [key: string]: any;
}

interface ProductTableWithSelectionProps {
  products: Product[];
  isLoading?: boolean;
  onEdit?: (product: Product) => void;
  onDelete?: (productId: number) => void;
  onSelectionChange?: (selectedIds: number[]) => void;
  selectedIds?: number[];
}

export function ProductTableWithSelection({
  products,
  isLoading = false,
  onEdit,
  onDelete,
  onSelectionChange,
  selectedIds = [],
}: ProductTableWithSelectionProps) {
  const [internalSelectedIds, setInternalSelectedIds] = useState<number[]>(
    selectedIds
  );

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      const newSelection = checked ? products.map((p) => p.id) : [];
      setInternalSelectedIds(newSelection);
      onSelectionChange?.(newSelection);
    },
    [products, onSelectionChange]
  );

  const handleSelectProduct = useCallback(
    (productId: number, checked: boolean) => {
      const newSelection = checked
        ? [...internalSelectedIds, productId]
        : internalSelectedIds.filter((id) => id !== productId);

      setInternalSelectedIds(newSelection);
      onSelectionChange?.(newSelection);
    },
    [internalSelectedIds, onSelectionChange]
  );

  const allSelected =
    products.length > 0 && internalSelectedIds.length === products.length;
  const someSelected = internalSelectedIds.length > 0 && !allSelected;

  return (
    <div className="space-y-4">
      {internalSelectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-200">
          <span className="text-sm font-medium text-blue-900">
            {internalSelectedIds.length} produto(s) selecionado(s)
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSelectAll(false)}
          >
            Limpar seleção
          </Button>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-12">
              <Checkbox
                checked={allSelected || someSelected}
                onCheckedChange={handleSelectAll}
              />
              </TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Princípio Ativo</TableHead>
              <TableHead>Fabricante</TableHead>
              <TableHead>Concentração</TableHead>
              <TableHead>Preço</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 bg-primary rounded-full animate-bounce" />
                    <span className="text-muted-foreground">
                      Carregando produtos...
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <span className="text-muted-foreground">
                    Nenhum produto encontrado
                  </span>
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow
                  key={product.id}
                  className={
                    internalSelectedIds.includes(product.id)
                      ? "bg-blue-50"
                      : ""
                  }
                >
                  <TableCell>
                    <Checkbox
                      checked={internalSelectedIds.includes(product.id)}
                      onCheckedChange={(checked) =>
                        handleSelectProduct(product.id, checked === true)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {product.imageUrl && (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <div>
                        <p className="font-medium text-sm">{product.name}</p>
                        {product.code && (
                          <p className="text-xs text-muted-foreground">
                            {product.code}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {product.activeIngredient || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {product.manufacturer || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {product.concentration || "—"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {product.price || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        product.isActive === "yes" ? "default" : "secondary"
                      }
                    >
                      {product.isActive === "yes" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit?.(product)}
                        title="Editar produto"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete?.(product.id)}
                        title="Deletar produto"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
