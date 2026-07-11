import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShoppingCart } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

interface ProductRow {
  id: number;
  name: string;
  activeIngredient?: string;
  concentration?: string;
  presentation?: string;
  supplierId?: number;
  supplierName?: string;
  price?: string;
  supplierPrices: Map<number, { supplierName: string; price: string | null }>;
}

export function ComparadorFornecedores() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [, navigate] = useLocation();

  // Query para categorias
  const categoriesQuery = trpc.categories.list.useQuery();

  // Query para produtos da categoria selecionada
  const productsQuery = trpc.products.list.useQuery(
    {
      categoryId: selectedCategoryId || undefined,
      isActive: "yes",
      limit: 5000,
    },
    { enabled: !!selectedCategoryId }
  );

  const categories = categoriesQuery.data || [];
  const products = productsQuery.data?.items || [];

  // Transformar dados em matriz de comparação
  const comparisonData = useMemo(() => {
    if (!products.length) return { suppliers: [], rows: [] };

    // Extrair fornecedores únicos
    const suppliersMap = new Map<number, string>();
    products.forEach((p: any) => {
      if (p.supplierId && p.supplierName) {
        suppliersMap.set(p.supplierId, p.supplierName);
      }
    });

    // Agrupar produtos por ID e criar matriz de preços
    const productsMap = new Map<number, ProductRow>();
    products.forEach((p: any) => {
      if (!productsMap.has(p.id)) {
        productsMap.set(p.id, {
          id: p.id,
          name: p.name,
          activeIngredient: p.activeIngredient,
          concentration: p.concentration,
          presentation: p.presentation,
          supplierPrices: new Map(),
        });
      }

      const row = productsMap.get(p.id)!;
      if (p.supplierId && p.supplierName) {
        row.supplierPrices.set(p.supplierId, {
          supplierName: p.supplierName,
          price: p.price,
        });
      }
    });

    return {
      suppliers: Array.from(suppliersMap.entries()).sort((a, b) =>
        a[1].localeCompare(b[1], "pt-BR")
      ),
      rows: Array.from(productsMap.values()),
    };
  }, [products]);

  // Encontrar menor preço em cada linha
  const getMinPrice = (row: ProductRow): number | null => {
    let min: number | null = null;
    row.supplierPrices.forEach(({ price }) => {
      if (price) {
        const num = parseFloat(price.replace(",", "."));
        if (!isNaN(num) && (min === null || num < min)) {
          min = num;
        }
      }
    });
    return min;
  };

  const handleAddToQuotation = (row: ProductRow) => {
    const minPrice = getMinPrice(row);
    const bestSupplier = Array.from(row.supplierPrices.entries()).find(
      ([_, data]) => data.price && parseFloat(data.price.replace(",", ".")) === minPrice
    );

    if (bestSupplier) {
      const [supplierId, { supplierName, price }] = bestSupplier;
      // Armazenar dados do produto no sessionStorage para passar para a página de orçamentos
      const selectedProduct = {
        id: row.id,
        productName: row.name,
        quantity: 1,
        unitPrice: parseFloat(price?.replace(",", ".") || "0"),
        supplier: supplierName,
        activeIngredient: row.activeIngredient,
        concentration: row.concentration,
      };

      // Recuperar produtos já selecionados
      const existingProducts = JSON.parse(sessionStorage.getItem("quotationProducts") || "[]");
      existingProducts.push(selectedProduct);
      sessionStorage.setItem("quotationProducts", JSON.stringify(existingProducts));

      // Navegar para página de orçamentos
      navigate("/orcamentos");
    }
  };

  const isLoading = productsQuery.isLoading;
  const hasData = comparisonData.rows.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Comparador de Fornecedores</h1>
        <p className="text-gray-600 mt-2">
          Compare preços de produtos por fornecedor em cada categoria
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

      {/* Comparison Table */}
      {selectedCategoryId && (
        <Card>
          <CardHeader>
            <CardTitle>
              {categories.find((c: any) => c.id === selectedCategoryId)?.name}
            </CardTitle>
            <CardDescription>
              {hasData
                ? `${comparisonData.rows.length} produto(s) · ${comparisonData.suppliers.length} fornecedor(es)`
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
                <p>Nenhum produto encontrado nesta categoria</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left p-3 font-bold bg-gray-50 sticky left-0 z-10 min-w-64">
                        Produto
                      </th>
                      <th className="text-center p-3 font-bold bg-gray-50 min-w-32">
                        Ação
                      </th>
                      {comparisonData.suppliers.map(([supplierId, supplierName]) => (
                        <th
                          key={supplierId}
                          className="text-center p-3 font-bold bg-blue-50 border-l border-gray-200"
                        >
                          <div className="font-semibold text-sm">{supplierName}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonData.rows.map((row, idx) => {
                      const minPrice = getMinPrice(row);
                      return (
                        <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="p-3 sticky left-0 z-10 bg-inherit border-r border-gray-200">
                            <div>
                              <p className="font-medium text-sm">{row.name}</p>
                              {row.activeIngredient && (
                                <p className="text-xs text-gray-500">
                                  {row.activeIngredient}
                                  {row.concentration && ` · ${row.concentration}`}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center border-l border-gray-200">
                            <Button
                              size="sm"
                              className="gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => handleAddToQuotation(row)}
                            >
                              <ShoppingCart className="w-4 h-4" />
                              Adicionar
                            </Button>
                          </td>
                          {comparisonData.suppliers.map(([supplierId]) => {
                            const priceData = row.supplierPrices.get(supplierId);
                            const price = priceData?.price;
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
