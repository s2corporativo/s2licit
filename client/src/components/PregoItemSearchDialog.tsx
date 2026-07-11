/**
 * PregoItemSearchDialog.tsx
 * Componente de busca de itens de pregão com seleção de plataforma
 * Permite buscar itens em PNCP, Compras MG e Portal de Compras Públicas
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, AlertCircle } from "lucide-react";
import { toast } from "sonner";
// trpc import removido - radar router foi excluído

export interface PregoItem {
  id: string;
  platform: string;
  description: string;
  quantity: number;
  unit: string;
  estimatedValue?: number;
}

export interface PregoItemSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemsSelected: (items: PregoItem[]) => void;
}

export function PregoItemSearchDialog({
  open,
  onOpenChange,
  onItemsSelected,
}: PregoItemSearchDialogProps) {
  const [searchMode, setSearchMode] = useState<"pncp" | "compras-mg" | "portal">("pncp");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // PNCP: CNPJ, Ano, Sequencial
  const [pncpCnpj, setPncpCnpj] = useState("");
  const [pncpAno, setPncpAno] = useState(new Date().getFullYear());
  const [pncpSequencial, setPncpSequencial] = useState("");

  // Compras MG: Edital ID
  const [comprasMgEditalId, setComprasMgEditalId] = useState("");

  // Portal de Compras Públicas: Número de Processo
  const [portalProcessNumber, setPortalProcessNumber] = useState("");

  // Busca multi-plataforma desativada (módulo radar removido)
  const [_stubData, _setStubData] = useState<any>(null);
  const searchMutation = { mutateAsync: async (_: any) => { toast.error('Módulo de busca de pregão foi removido.'); return { success: false, allItems: [], errors: ['Módulo removido'] }; }, isPending: false, data: _stubData };
  const isSearching = false;

  const handleSearch = async (): Promise<void> => {
    try {
      // Valida inputs
      if (searchMode === "pncp") {
        if (!pncpCnpj || !pncpSequencial) {
          toast.error("Preencha CNPJ e Sequencial do pregão");
          return;
        }
      } else if (searchMode === "compras-mg") {
        if (!comprasMgEditalId) {
          toast.error("Preencha o ID do edital");
          return;
        }
      } else if (searchMode === "portal") {
        if (!portalProcessNumber) {
          toast.error("Preencha o número do processo");
          return;
        }
      }

      // Monta parâmetros de busca
      const searchParams: Record<string, any> = {};

      if (searchMode === "pncp") {
        searchParams.pncp = {
          cnpj: pncpCnpj,
          ano: pncpAno,
          sequencial: parseInt(pncpSequencial),
        };
      }

      if (searchMode === "compras-mg") {
        searchParams.comprasMG = {
          editalId: comprasMgEditalId,
        };
      }

      if (searchMode === "portal") {
        searchParams.portalCompras = {
          processNumber: portalProcessNumber,
        };
      }

      // Executa busca
      const result = await searchMutation.mutateAsync(searchParams);

      if (!result.success) {
        toast.error(result.errors?.[0] || "Erro ao buscar itens do pregão");
        return;
      }

      if (result.allItems.length === 0) {
        toast.warning("Nenhum item encontrado");
        return;
      }

      toast.success(`${result.allItems.length} itens encontrados`);
      setSelectedItems(new Set()); // Reseta seleção
    } catch (error) {
      console.error("Erro ao buscar itens:", error);
      toast.error("Erro ao buscar itens do pregão");
    }
  };

  const handleSelectItem = (itemId: string): void => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleConfirm = (): void => {
    if (selectedItems.size === 0) {
      toast.error("Selecione pelo menos um item");
      return;
    }

    // Filtra itens selecionados
    const itemsToAdd = searchMutation.data?.allItems.filter((item: any) =>
      selectedItems.has(item.id)
    ) || [];

    onItemsSelected(itemsToAdd);
    onOpenChange(false);
    toast.success(`${itemsToAdd.length} itens adicionados à proposta`);
  };

  const allItems = searchMutation.data?.allItems || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buscar Itens de Pregão</DialogTitle>
          <DialogDescription>
            Busque itens em múltiplas plataformas (PNCP, Compras MG, Portal de Compras Públicas)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Abas de plataforma */}
          <Tabs
            value={searchMode}
            onValueChange={(value) => {
              setSearchMode(value as any);
              setSelectedItems(new Set()); // Reseta seleção ao trocar aba
            }}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pncp">PNCP</TabsTrigger>
              <TabsTrigger value="compras-mg">Compras MG</TabsTrigger>
              <TabsTrigger value="portal">Portal de Compras</TabsTrigger>
            </TabsList>

            {/* PNCP */}
            <TabsContent value="pncp" className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">CNPJ</label>
                  <Input
                    placeholder="12345678000190"
                    value={pncpCnpj}
                    onChange={(e) => setPncpCnpj(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Ano</label>
                  <Input
                    type="number"
                    placeholder={String(new Date().getFullYear())}
                    value={pncpAno}
                    onChange={(e) => setPncpAno(parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Sequencial</label>
                  <Input
                    placeholder="000001"
                    value={pncpSequencial}
                    onChange={(e) => setPncpSequencial(e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Compras MG */}
            <TabsContent value="compras-mg" className="space-y-4">
              <div>
                <label className="text-sm font-medium">ID do Edital</label>
                <Input
                  placeholder="550e8400-e29b-41d4-a716-446655440000"
                  value={comprasMgEditalId}
                  onChange={(e) => setComprasMgEditalId(e.target.value)}
                />
              </div>
            </TabsContent>

            {/* Portal de Compras Públicas */}
            <TabsContent value="portal" className="space-y-4">
              <div>
                <label className="text-sm font-medium">Número do Processo</label>
                <Input
                  placeholder="2024.0001/2024-01"
                  value={portalProcessNumber}
                  onChange={(e) => setPortalProcessNumber(e.target.value)}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Botão de busca */}
          <Button
            onClick={handleSearch}
            disabled={isSearching}
            className="w-full"
          >
            {isSearching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Buscar Itens
              </>
            )}
          </Button>

          {/* Resultados */}
          {searchMutation.data?.errors && searchMutation.data.errors.length > 0 && (
            <div className="flex gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                {searchMutation.data?.errors.map((error: string, i: number) => (
                  <div key={i}>{error}</div>
                ))}
              </div>
            </div>
          )}

          {allItems.length > 0 && (
            <div className="space-y-4">
              <div className="text-sm font-medium">
                {allItems.length} itens encontrados ({selectedItems.size} selecionados)
              </div>

              <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">
                  <Checkbox
                    checked={selectedItems.size === allItems.length && allItems.length > 0}
                    onCheckedChange={(checked: any) => {
                            if (checked) {
                              setSelectedItems(new Set(allItems.map((item: any) => item.id)));
                            } else {
                              setSelectedItems(new Set());
                            }
                          }}
                        />
                      </th>
                      <th className="px-4 py-2 text-left">Descrição</th>
                      <th className="px-4 py-2 text-center">Quantidade</th>
                      <th className="px-4 py-2 text-center">Unidade</th>
                      <th className="px-4 py-2 text-right">Valor Estimado</th>
                      <th className="px-4 py-2 text-center">Plataforma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allItems.map((item: any) => (
                      <tr key={item.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <Checkbox
                            checked={selectedItems.has(item.id)}
                            onCheckedChange={() => handleSelectItem(item.id)}
                          />
                        </td>
                        <td className="px-4 py-2 text-left max-w-xs truncate">
                          {item.description}
                        </td>
                        <td className="px-4 py-2 text-center">{item.quantity}</td>
                        <td className="px-4 py-2 text-center">{item.unit}</td>
                        <td className="px-4 py-2 text-right">
                          {item.estimatedValue
                            ? `R$ ${item.estimatedValue.toFixed(2)}`
                            : "-"}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                            {item.platform === "pncp" && "PNCP"}
                            {item.platform === "compras-mg" && "Compras MG"}
                            {item.platform === "portal-compras" && "Portal"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Botões de ação */}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={selectedItems.size === 0 || allItems.length === 0}
            >
              Adicionar {selectedItems.size > 0 ? `(${selectedItems.size})` : ""} Itens
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
