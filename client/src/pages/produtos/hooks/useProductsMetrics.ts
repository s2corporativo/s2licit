import { useMemo } from "react";

/**
 * Hook derivado de métricas de produtos (FASE 3.4 + FASE 5 §10).
 * Consolida KPIs da tela de produtos em um único cálculo memorizado,
 * evitando duplicação entre Dashboard, Central Operacional e Produtos.
 */
export interface ProductsMetrics {
  total: number;
  active: number;
  inactive: number;
  withoutPrice: number;
  withoutCategory: number;
  withoutSupplier: number;
  averageQuality: number;
}

export function useProductsMetrics(
  products: Array<Record<string, unknown>>,
): ProductsMetrics {
  return useMemo(() => {
    const total = products.length;
    let active = 0;
    let withoutPrice = 0;
    let withoutCategory = 0;
    let withoutSupplier = 0;
    let qualitySum = 0;

    for (const p of products) {
      if ((p.isActive ?? "yes") === "yes") active++;
      if (!p.price) withoutPrice++;
      if (!p.categoryId) withoutCategory++;
      if (!p.supplierId) withoutSupplier++;

      let score = 0;
      const fields = ["name", "sku", "price", "categoryId", "supplierId"];
      for (const f of fields) if (p[f]) score++;
      qualitySum += score / fields.length;
    }

    return {
      total,
      active,
      inactive: total - active,
      withoutPrice,
      withoutCategory,
      withoutSupplier,
      averageQuality: total ? +(qualitySum / total).toFixed(3) : 0,
    };
  }, [products]);
}
