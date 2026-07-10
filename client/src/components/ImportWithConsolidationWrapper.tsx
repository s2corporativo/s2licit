import { useState } from "react";
import { ConsolidationPreviewModal } from "./ConsolidationPreviewModal";
import { useConsolidationImport } from "@/hooks/useConsolidationImport";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

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

interface ImportWithConsolidationWrapperProps {
  products: ImportProduct[];
  onSuccess?: () => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export function ImportWithConsolidationWrapper({
  products,
  onSuccess,
  onError,
  disabled = false,
}: ImportWithConsolidationWrapperProps) {
  const [showButton, setShowButton] = useState(true);
  const {
    isPreviewOpen,
    previewLoading,
    importLoading,
    previewData,
    stats,
    consolidatedGroups,
    error,
    handlePreview,
    handleConfirmImport,
    handleCancel,
    importMutation,
  } = useConsolidationImport();

  const handleOpenPreview = async () => {
    await handlePreview(products);
  };

  const handleConfirm = async () => {
    await handleConfirmImport();
    if (importMutation.isSuccess) {
      onSuccess?.();
    }
  };

  if (error) {
    onError?.(error);
  }

  if (!showButton) {
    return null;
  }

  return (
    <>
      <Button
        onClick={handleOpenPreview}
        disabled={disabled || previewLoading || products.length === 0}
        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
      >
        <Sparkles className="mr-2 h-4 w-4" />
        {previewLoading ? "Analisando..." : "Importar com Consolidação"}
      </Button>

      <ConsolidationPreviewModal
        isOpen={isPreviewOpen}
        isLoading={importLoading}
        stats={stats || undefined}
        consolidatedGroups={consolidatedGroups}
        previewData={previewData || undefined}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
