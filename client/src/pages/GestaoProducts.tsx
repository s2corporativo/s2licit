import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Edit2, Trash2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ProductEditModal } from "@/components/ProductEditModal";
import { BulkEditPanel } from "@/components/BulkEditPanel";

export function GestaoProducts() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Query para listar produtos
  const productsQuery = trpc.products.list.useQuery({
    search: search || undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  // Mutations
  const utils = trpc.useUtils();
  const deleteProductMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      utils.products.list.invalidate();
    },
  });

  const products = productsQuery.data?.items || [];
  const total = productsQuery.data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(products.map((p: any) => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectProduct = (productId: number, checked: boolean) => {
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(productId);
    } else {
      newSelection.delete(productId);
    }
    setSelectedIds(newSelection);
  };

  const allSelected = products.length > 0 && selectedIds.size === products.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gestão de Produtos</h1>
        <p className="text-gray-600 mt-2">Edite produtos individualmente ou em lote</p>
      </div>

      {/* Search and Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Produtos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Buscar por nome, código, princípio ativo..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
              setSelectedIds(new Set());
            }}
          />

          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-200">
              <span className="text-sm font-medium text-blue-900">
                {selectedIds.size} produto(s) selecionado(s)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Limpar
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowBulkEdit(true)}
                >
                  Editar em Lote
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Produtos ({total})</CardTitle>
          <CardDescription>
            Página {page + 1} de {totalPages || 1}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {productsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>Nenhum produto encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 w-12">
                      <input
                        type="checkbox"
                        checked={allSelected || someSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th className="text-left p-2">Produto</th>
                    <th className="text-left p-2">Princípio Ativo</th>
                    <th className="text-left p-2">Fabricante</th>
                    <th className="text-left p-2">Preço</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product: any) => (
                    <tr
                      key={product.id}
                      className={`border-b ${
                        selectedIds.has(product.id) ? "bg-blue-50" : ""
                      }`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={(e) =>
                            handleSelectProduct(product.id, e.target.checked)
                          }
                        />
                      </td>
                      <td className="p-2">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.code && (
                            <p className="text-xs text-gray-500">{product.code}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-sm">
                        {product.activeIngredient || "—"}
                      </td>
                      <td className="p-2 text-sm">
                        {product.manufacturer || "—"}
                      </td>
                      <td className="p-2 text-sm font-medium">
                        {product.price || "—"}
                      </td>
                      <td className="p-2">
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded ${
                            product.isActive === "yes"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {product.isActive === "yes" ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingProductId(product.id)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (
                                confirm(`Excluir "${product.name}"?`)
                              ) {
                                deleteProductMutation.mutate({ id: product.id });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-600">
                Página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      {editingProductId && (
        <ProductEditModal
          open={!!editingProductId}
          onOpenChange={(open) => {
            if (!open) setEditingProductId(null);
          }}
          productId={editingProductId}
          onSuccess={() => {
            setEditingProductId(null);
            utils.products.list.invalidate();
          }}
        />
      )}

      <BulkEditPanel
        open={showBulkEdit}
        onOpenChange={setShowBulkEdit}
        selectedProductIds={Array.from(selectedIds)}
        onSuccess={() => {
          setShowBulkEdit(false);
          setSelectedIds(new Set());
          utils.products.list.invalidate();
        }}
      />
    </div>
  );
}
