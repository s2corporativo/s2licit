import { useState, useMemo } from "react";
import { useDebouncedValue } from "./useDebouncedValue";

/**
 * Estado de filtros da tela de Produtos (FASE 3.4).
 * Centraliza a lógica de filtros, busca com debounce e paginação.
 */
export interface ProductsFilterState {
  search: string;
  categoryId: number | null;
  supplierId: number | null;
  onlyActive: boolean;
  page: number;
  pageSize: number;
}

export const DEFAULT_FILTERS: ProductsFilterState = {
  search: "",
  categoryId: null,
  supplierId: null,
  onlyActive: true,
  page: 1,
  pageSize: 50,
};

export function useProductsFilters(initial: Partial<ProductsFilterState> = {}) {
  const [filters, setFilters] = useState<ProductsFilterState>({
    ...DEFAULT_FILTERS,
    ...initial,
  });

  const debouncedSearch = useDebouncedValue(filters.search, 300);

  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );

  const setField = <K extends keyof ProductsFilterState>(
    key: K,
    value: ProductsFilterState[K],
  ) => setFilters((prev) => ({ ...prev, [key]: value, page: key === "page" ? (value as number) : 1 }));

  const reset = () => setFilters(DEFAULT_FILTERS);

  return { filters, effectiveFilters, setField, reset, setFilters };
}
