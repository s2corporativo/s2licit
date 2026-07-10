import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ProductThumbnail } from "@/components/ProductThumbnail";

interface ConsolidatedRow {
  masterProductId: string;
  name: string;
  activeIngredient?: string;
  concentration?: string;
  presentation?: string;
  manufacturer?: string;
  imageUrl?: string | null;
  prices: Array<{
    supplierId: number;
    supplierName: string;
    price: string | null;
  }>;
}

export function ComparadorFornecedoresV2() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  // Query para categorias
  const categoriesQuery = trpc.categories.list.useQuery();

  // Query para produtos consolidados
  const consolidatedQuery = (trpc.consolidation as any).getConsolidatedByCategory?.useQuery?.(
    { categoryId: selectedCategoryId || 0 },
    { enabled: !!selectedCategoryId }
  ) ?? { data: undefined };

  // Query para estatísticas de consolidação
  const statsQuery = (trpc.consolidation as any).getConsolidationStats?.useQuery?.(
    { categoryId: selectedCategoryId || 0 },
    { enabled: !!selectedCategoryId }
  ) ?? { data: undefined };

  const categories = categoriesQuery.data || [];
  const data = consolidatedQuery.data;
  const stats = statsQuery.data;

  const isLoading = consolidatedQuery.isLoading || statsQuery.isLoading;
  const hasData = data && data.products.length > 0;

  // Encontrar menor preço em cada linha
  const getMinPrice = (row: ConsolidatedRow): number | null => {
    let min: number | null = null;
    row.prices.forEach(({ price }) => {
      if (price) {
        const num = parseFloat(price.replace(",", "."));
        if (!isNaN(num) && (min === null || num < min)) {
          min = num;
        }
      }
    });
    return min;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Comparador de Fornecedores</h1>
        <p className="text-gray-600 mt-2">
          Compare preços consolidados de produtos por fornecedor. Produtos duplicados são automaticamente agrupados.
        </p>
      </div>

      {/* Category Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Selecionar Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedCategoryId?.toString() || ""}
            onValueChange={(val) => setSelectedCategoryId(val ? parseInt(val) : null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Escolha uma categoria..." />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat: any) => (
                <SelectItem key={cat.id} value={cat.id.toString()}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Consolidation Stats */}
      {selectedCategoryId && stats && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-lg">Estatísticas de Consolidação</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Produtos Originais</p>
                <p className="text-2xl font-bold">{stats.totalSourceProducts}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Produtos Consolidados</p>
                <p className="text-2xl font-bold">{stats.totalConsolidatedProducts}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Duplicatas Encontradas</p>
                <p className="text-2xl font-bold text-orange-600">{stats.duplicatesFound}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total de Fornecedores</p>
                <p className="text-2xl font-bold text-green-600">{stats.totalSuppliers}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Média de Fornecedores/Produto</p>
                <p className="text-2xl font-bold">{stats.averageSuppliersPerProduct}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Produtos Completos</p>
                <p className="text-2xl font-bold text-green-600">{stats.productsWithAllSuppliers}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Produtos Incompletos</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.productsWithMissingSuppliers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison Table */}
      {selectedCategoryId && (
        <Card>
          <CardHeader>
            <CardTitle>
              {categories.find((c: any) => c.id === selectedCategoryId)?.name}
            </CardTitle>
            <CardDescription>
              {hasData
                ? `${data.totalProducts} produto(s) consolidado(s) · ${data.suppliers.length} fornecedor(es)`
                : "Nenhum produto encontrado"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : !hasData ? (
              <div className="text-center py-12 text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>Nenhum produto encontrado nesta categoria</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-center p-3 font-bold bg-gray-50 sticky left-0 z-10 min-w-12">
                        Imagem
                      </th>
                      <th className="text-left p-3 font-bold bg-gray-50 sticky left-12 z-10 min-w-68">
                        Produto
                      </th>
                      {data.suppliers.map((supplier: any) => (
                        <th
                          key={supplier.id}
                          className="text-center p-3 font-bold bg-blue-50 border-l border-gray-200 min-w-32"
                        >
                          <div className="font-semibold text-sm">{supplier.name}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((row: any, idx: number) => {
                      const minPrice = getMinPrice(row);
                      return (
                        <tr key={row.masterProductId} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="p-3 sticky left-0 z-10 bg-inherit border-r border-gray-200 text-center">
                            <ProductThumbnail
                              imageUrl={row.imageUrl}
                              productName={row.name}
                              size="md"
                              showPreview={true}
                            />
                          </td>
                          <td className="p-3 sticky left-12 z-10 bg-inherit border-r border-gray-200">
                            <div>
                              <p className="font-medium text-sm">{row.name}</p>
                              {row.activeIngredient && (
                                <p className="text-xs text-gray-500">
                                  {row.activeIngredient}
                                  {row.concentration && ` · ${row.concentration}`}
                                </p>
                              )}
                              {row.presentation && (
                                <p className="text-xs text-gray-400">{row.presentation}</p>
                              )}
                            </div>
                          </td>
                          {row.prices.map(({ supplierId, price }: any) => {
                            const priceNum = price ? parseFloat(price.replace(",", ".")) : null;
                            const isMinPrice =
                              minPrice !== null && priceNum !== null && priceNum === minPrice;

                            return (
                              <td
                                key={supplierId}
                                className={`p-3 text-center border-l border-gray-200 ${
                                  isMinPrice ? "bg-green-100 font-bold text-green-900" : ""
                                }`}
                              >
                                {price ? (
                                  <div className="flex flex-col items-center">
                                    <span>R$ {price}</span>
                                    {isMinPrice && (
                                      <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded mt-1">
                                        Menor
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
