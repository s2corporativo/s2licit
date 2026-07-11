import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { QuotationItemEditor, type QuotationItem } from "./QuotationItemEditor";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

interface QuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGeneratePdf: (data: {
    number: string;
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    items: QuotationItem[];
    discount?: number;
    tax?: number;
    notes?: string;
  }) => Promise<{ success: boolean; pdfUrl?: string; message: string }>;
  preloadedItems?: Array<{ productName: string; quantity: number; unitPrice: number }>;
}

export function QuotationModal({ isOpen, onClose, onGeneratePdf, preloadedItems = [] }: QuotationModalProps) {
  const [number, setNumber] = useState(`ORC-${new Date().getTime()}`);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [totals, setTotals] = useState({ subtotal: 0, total: 0 });

  useEffect(() => {
    if (preloadedItems && preloadedItems.length > 0) {
      const newItems = preloadedItems.map((item, idx) => ({
        id: `item-${Date.now()}-${idx}`,
        ...item,
      }));
      setItems(newItems);
    }
  }, [preloadedItems]);

  const handleGeneratePdf = async () => {
    if (items.length === 0) {
      toast.error("Adicione pelo menos um item ao orçamento");
      return;
    }

    setIsLoading(true);
    try {
      const result = await onGeneratePdf({
        number,
        clientName: clientName || undefined,
        clientEmail: clientEmail || undefined,
        clientPhone: clientPhone || undefined,
        items,
        discount: discount > 0 ? discount : undefined,
        tax: tax > 0 ? tax : undefined,
        notes: notes || undefined,
      });

      if (result.success && result.pdfUrl) {
        window.open(result.pdfUrl, "_blank");
        toast.success("PDF gerado com sucesso!");
        handleClose();
      } else {
        toast.error(`Erro ao gerar PDF: ${result.message}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error(`Erro ao gerar PDF: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setNumber(`ORC-${new Date().getTime()}`);
    setClientName("");
    setClientEmail("");
    setClientPhone("");
    setItems([]);
    setDiscount(0);
    setTax(0);
    setNotes("");
    setTotals({ subtotal: 0, total: 0 });
    onClose();
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const calculateFinalTotal = () => {
    return totals.subtotal - discount + tax;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Novo Orçamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações do Orçamento */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Informações do Orçamento</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Número do Orçamento</label>
                <Input
                  value={number}
                  onChange={e => setNumber(e.target.value)}
                  placeholder="ORC-001"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Data de Validade (dias)</label>
                <Input type="number" placeholder="30" className="mt-1" defaultValue="30" />
              </div>
            </div>
          </div>

          {/* Informações do Cliente */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Informações do Cliente</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <Input
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Telefone</label>
                <Input
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Itens do Orçamento */}
          <QuotationItemEditor items={items} onItemsChange={setItems} onTotalsChange={setTotals} />

          {/* Totais */}
          <Card className="p-4 bg-gray-50">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>R$ {formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <label className="text-sm font-medium">Desconto:</label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    value={discount}
                    onChange={e => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                    step="0.01"
                    min="0"
                    className="w-24"
                  />
                  <span>R$ {formatCurrency(discount)}</span>
                </div>
              </div>
              <div className="flex justify-between">
                <label className="text-sm font-medium">Impostos:</label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    value={tax}
                    onChange={e => setTax(Math.max(0, parseFloat(e.target.value) || 0))}
                    step="0.01"
                    min="0"
                    className="w-24"
                  />
                  <span>R$ {formatCurrency(tax)}</span>
                </div>
              </div>
              <div className="border-t pt-2 flex justify-between font-bold text-lg">
                <span>Total:</span>
                <span>R$ {formatCurrency(calculateFinalTotal())}</span>
              </div>
            </div>
          </Card>

          {/* Notas */}
          <div>
            <label className="text-sm font-medium">Observações</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Adicione observações ou condições especiais..."
              className="w-full mt-1 p-2 border rounded-md text-sm"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleGeneratePdf} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando PDF...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Gerar e Baixar PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
