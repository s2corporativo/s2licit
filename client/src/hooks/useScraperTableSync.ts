import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

export interface SyncState {
  isSyncing: boolean;
  syncResult: any | null;
  summary: any | null;
  highlightedChanges: any[] | null;
  error: string | null;
}

/**
 * Hook para sincronizar preços do scraper com a tabela de comparação
 * Gerencia estado de sincronização, resultado e mudanças destacadas
 */
export function useScraperTableSync() {
  const [state, setState] = useState<SyncState>({
    isSyncing: false,
    syncResult: null,
    summary: null,
    highlightedChanges: null,
    error: null,
  });

  // Mutation para sincronizar com tabela
  const syncMutation = trpc.scraperSync.syncWithTable.useMutation({
    onSuccess: (result) => {
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        syncResult: result,
        error: null,
      }));
    },
    onError: (error) => {
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        error: error.message,
      }));
    },
  });

  // Query para obter resumo
  const summaryQuery = trpc.scraperSync.getTableSyncSummary.useQuery(
    { supplierId: 0 },
    { enabled: false }
  );

  // Query para obter mudanças destacadas
  const changesQuery = trpc.scraperSync.getHighlightedChanges.useQuery(
    { supplierId: 0, hoursBack: 24 },
    { enabled: false }
  );

  // Sincronizar com tabela
  const sync = useCallback(
    async (
      supplierId: number,
      products: Array<{
        productName: string;
        price: number;
        ean?: string;
        code?: string;
      }>
    ) => {
      setState((prev) => ({
        ...prev,
        isSyncing: true,
        error: null,
      }));

      try {
        await syncMutation.mutateAsync({
          supplierId: Number(supplierId),
          products,
        });

        // Carregar resumo após sincronização
        await summaryQuery.refetch();
        await changesQuery.refetch();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isSyncing: false,
          error:
            error instanceof Error ? error.message : "Erro ao sincronizar",
        }));
      }
    },
    [syncMutation, summaryQuery, changesQuery]
  );

  // Obter resumo
  const getSummary = useCallback(
    async (supplierId: string) => {
      try {
        const result = await summaryQuery.refetch();
        if (result.data) {
          setState((prev) => ({
            ...prev,
            summary: result.data,
          }));
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Erro ao obter resumo",
        }));
      }
    },
    [summaryQuery]
  );

  // Obter mudanças destacadas
  const getHighlightedChanges = useCallback(
    async (supplierId: string, hoursBack: number = 24) => {
      try {
        const result = await changesQuery.refetch();
        if (result.data) {
          setState((prev) => ({
            ...prev,
            highlightedChanges: result.data,
          }));
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "Erro ao obter mudanças",
        }));
      }
    },
    [changesQuery]
  );

  // Limpar estado
  const clear = useCallback(() => {
    setState({
      isSyncing: false,
      syncResult: null,
      summary: null,
      highlightedChanges: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    sync,
    getSummary,
    getHighlightedChanges,
    clear,
  };
}
