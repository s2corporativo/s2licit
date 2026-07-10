import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Trash2, Plus, Edit2 } from "lucide-react";

export interface QuotationItem {
  id?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  supplier?: string;
}

interface QuotationItemEditorProps {
  items: QuotationItem[];
  onItemsChange: (items: QuotationItem[]) => void;
  onTotalsChange?: (totals: { subtotal: number; total: number }) => void;
}

export function QuotationItemEditor({ items, onItemsChange, onTotalsChange }: QuotationItemEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<QuotationItem | null>(null);

  const handleAddItem = () => {
    const id = `item-${Date.now()}`;
    const newItem: QuotationItem = {
      id,
      productName: "",
      quantity: 1,
      unitPrice: 0,
    };
    const updatedItems = [...items, newItem];
    onItemsChange(updatedItems);
    setEditingId(id);
    setEditingItem(newItem);
  };

  const handleEditItem = (item: QuotationItem) => {
    const id = item.id || `item-${Date.now()}`;
    setEditingId(id);
    setEditingItem({ ...item, id });
  };

  const handleSaveItem = () => {
    if (!editingItem || !editingItem.productName) {
      alert("Nome do produto é obrigatório");
      return;
    }

    const updatedItems = items.map(item => (item.id === editingId ? editingItem : item));
    onItemsChange(updatedItems);
    calculateTotals(updatedItems);
    setEditingId(null);
    setEditingItem(null);
  };

  const handleDeleteItem = (id: string | undefined) => {
    if (!id) return;
    const updatedItems = items.filter(item => item.id !== id);
    onItemsChange(updatedItems);
    calculateTotals(updatedItems);
  };

  const calculateTotals = (itemsList: QuotationItem[]) => {
    const subtotal = itemsList.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (onTotalsChange) {
      onTotalsChange({ subtotal, total: subtotal });
    }
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Itens do Orçamento</h3>
        <Button onClick={handleAddItem} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar Item
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center text-gray-500">
          <p>Nenhum item adicionado. Clique em "Adicionar Item" para começar.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="border rounded-lg p-4 bg-white">
              {editingId === item.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">Produto</label>
                      <Input
                        value={editingItem?.productName || ""}
                        onChange={e =>
                          setEditingItem(prev => (prev ? { ...prev, productName: e.target.value } : null))
                        }
                        placeholder="Nome do produto"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Fornecedor</label>
                      <Input
                        value={editingItem?.supplier || ""}
                        onChange={e =>
                          setEditingItem(prev => (prev ? { ...prev, supplier: e.target.value } : null))
                        }
                        placeholder="Fornecedor (opcional)"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium">Quantidade</label>
                      <Input
                        type="number"
                        value={editingItem?.quantity || 1}
                        onChange={e =>
                          setEditingItem(prev =>
                            prev ? { ...prev, quantity: Math.max(1, parseInt(e.target.value) || 1) } : null
                          )
                        }
                        min="1"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Preço Unit.</label>
                      <Input
                        type="number"
                        value={editingItem?.unitPrice || 0}
                        onChange={e =>
                          setEditingItem(prev =>
                            prev ? { ...prev, unitPrice: Math.max(0, parseFloat(e.target.value) || 0) } : null
                          )
                        }
                        step="0.01"
                        min="0"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Total</label>
                      <div className="mt-1 p-2 bg-gray-100 rounded text-sm font-semibold">
                        R$ {formatCurrency((editingItem?.quantity || 1) * (editingItem?.unitPrice || 0))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setEditingId(null)} size="sm">
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveItem} size="sm">
                      Salvar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <p className="font-medium">{item.productName}</p>
                    {item.supplier && <p className="text-sm text-gray-600">{item.supplier}</p>}
                    <p className="text-sm text-gray-600">
                      {item.quantity}x R$ {formatCurrency(item.unitPrice)} = R${" "}
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditItem(item)}
                      className="gap-1"
                    >
                      <Edit2 className="w-4 h-4" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteItem(item.id)}
                      className="gap-1 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                      Deletar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
