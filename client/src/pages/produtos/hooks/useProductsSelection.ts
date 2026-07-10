import { useCallback, useState } from "react";

/**
 * Hook para gerenciamento de seleção múltipla em listagens (FASE 3.4).
 * Suporta seleção individual, por página e global.
 */
export function useProductsSelection<T extends { id: number }>() {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllInPage = useCallback((items: T[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      items.forEach((i) => next.add(i.id));
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: number) => selected.has(id), [selected]);

  return {
    selected,
    count: selected.size,
    toggle,
    selectAllInPage,
    clear,
    isSelected,
  };
}
