import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

export interface ImportProduct {
  name: string;
  activeIngredient?: string;
  concentration?: string;
  presentation?: string;
  manufacturer?: string;
  supplierId?: number;
  supplierName?: string;
  price?: string;
  code?: string;
  imageUrl?: string;
  productUrl?: string;
  categoryId?: number;
  fichaTecnica?: string;
  tipoCatalogo?: string;
  ean?: string;
}

interface ConsolidationStats {
  consolidationRate: number;
  avgSuppliersPerProduct: number;
  totalUniqueSuppliers: number;
  productsWithMultipleSuppliers: number;
}

interface ConsolidationGroup {
  signature: string;
  masterName: string;
  count: number;
  suppliers: Array<{
    id?: number;
    name?: string;
    price?: string;
  }>;
}

interface PreviewData {
  willCreateProducts: number;
  willConsolidateDuplicates: number;
  totalSuppliersInImport: number;
  productsWithMultipleSuppliers: number;
}

export function useConsolidationImport() {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [stats, setStats] = useState<ConsolidationStats | null>(null);
  const [consolidatedGroups, setConsolidatedGroups] = useState<ConsolidationGroup[]>([]);
  const [currentProducts, setCurrentProducts] = useState<ImportProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  const previewMutation = (trpc as any).importConsolidated.previewConsolidation.useQuery(
    { products: currentProducts },
    {
      enabled: false,
      retry: false,
    }
  );

  const importMutation = (trpc as any).importConsolidated.importWithConsolidation.useMutation({
    onSuccess: () => {
      setIsPreviewOpen(false);
      setCurrentProducts([]);
      setError(null);
    },
    onError: (err: any) => {
      setError(err.message || "Erro ao importar com consolidação");
    },
  });

  const handlePreview = useCallback(
    async (products: ImportProduct[]) => {
      setCurrentProducts(products);
      setPreviewLoading(true);
      setError(null);

      try {
        // Usar query para preview (não salva)
        const response = await (trpc as any).importConsolidated.previewConsolidation.query({
          products,
        });

        if (response) {
          setStats(response.stats);
          setPreviewData(response.previewData);
          setConsolidatedGroups(response.consolidationReport.consolidatedGroups);
          setIsPreviewOpen(true);
        }
      } catch (err: any) {
        setError(err instanceof Error ? err.message : "Erro ao visualizar consolidação");
      } finally {
        setPreviewLoading(false);
      }
    },
    []
  );

  const handleConfirmImport = useCallback(async () => {
    setImportLoading(true);
    setError(null);

    try {
      await importMutation.mutateAsync({
        products: currentProducts,
      });
      } catch (err: any) {
        setError(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setImportLoading(false);
    }
  }, [currentProducts, importMutation]);

  const handleCancel = useCallback(() => {
    setIsPreviewOpen(false);
    setCurrentProducts([]);
    setError(null);
  }, []);

  return {
    // State
    isPreviewOpen,
    previewLoading,
    importLoading,
    previewData,
    stats,
    consolidatedGroups,
    error,

    // Methods
    handlePreview,
    handleConfirmImport,
    handleCancel,

    // Mutations
    importMutation,
  };
}
