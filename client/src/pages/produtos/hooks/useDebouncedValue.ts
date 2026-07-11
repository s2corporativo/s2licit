import { useEffect, useState } from "react";

/**
 * Hook de debounce para valores de input.
 * Reduz requisições excessivas em buscas (meta FASE 5 — Performance).
 *
 * @example
 * const [search, setSearch] = useState("");
 * const debounced = useDebouncedValue(search, 300);
 * useEffect(() => { fetchProducts(debounced); }, [debounced]);
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
