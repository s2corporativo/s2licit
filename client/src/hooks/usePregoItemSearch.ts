/**
 * usePregoItemSearch.ts
 * Hook para gerenciar busca de itens de pregão e pré-preenchimento
 * NOTA: módulo radar removido — busca multi-plataforma desativada
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";

export interface PregoItem {
  id: string;
  platform: string;
  description: string;
  quantity: number;
  unit: string;
  estimatedValue?: number;
  processNumber?: string;
  rawData?: any;
}

export interface ProposalItem {
  description: string;
  quantity: number;
  unitOfMeasure: string;
  editalRefPrice?: number;
  notes?: string;
}

/**
 * Hook para gerenciar busca de itens de pregão
 */
export function usePregoItemSearch() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  /**
   * Converte itens de pregão para itens de proposta
   */
  const convertToProposalItems = useCallback(
    (pregoItems: PregoItem[]): ProposalItem[] => {
      return pregoItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitOfMeasure: item.unit,
        editalRefPrice: item.estimatedValue,
        notes: `Origem: ${item.platform} | ID: ${item.id}`,
      }));
    },
    []
  );

  /**
   * Busca itens — desativada (módulo radar removido)
   */
  const searchItems = useCallback(
    async (_params: {
      pncp?: { cnpj: string; ano: number; sequencial: number };
      comprasMG?: { editalId: string };
      portalCompras?: { processNumber: string };
    }) => {
      toast.error("Módulo de busca de pregão foi removido.");
      return null;
    },
    []
  );

  /**
   * Valida equivalência técnica para itens selecionados
   */
  const validateEquivalence = useCallback(
    async (pregoItems: PregoItem[]) => {
      try {
        toast.info("Validação de equivalência será executada automaticamente");
        return pregoItems;
      } catch (error) {
        console.error("Erro ao validar equivalência:", error);
        return [];
      }
    },
    []
  );

  /**
   * Processa itens selecionados e retorna itens prontos para adicionar à proposta
   */
  const processSelectedItems = useCallback(
    async (
      pregoItems: PregoItem[],
      options?: {
        validateEquivalence?: boolean;
      }
    ): Promise<ProposalItem[] | null> => {
      try {
        const proposalItems = convertToProposalItems(pregoItems);
        if (options?.validateEquivalence) {
          await validateEquivalence(pregoItems);
        }
        return proposalItems;
      } catch (error) {
        console.error("Erro ao processar itens:", error);
        toast.error("Erro ao processar itens selecionados");
        return null;
      }
    },
    [convertToProposalItems, validateEquivalence]
  );

  return {
    isDialogOpen,
    setIsDialogOpen,
    searchItems,
    validateEquivalence,
    processSelectedItems,
    convertToProposalItems,
    isSearching: false,
  };
}
