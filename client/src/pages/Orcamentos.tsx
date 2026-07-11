import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QuotationModal } from "@/components/QuotationModal";
import { FileText, Plus, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function Orcamentos() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preloadedItems, setPreloadedItems] = useState<Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
  }>>([]);

  React.useEffect(() => {
    const stored = sessionStorage.getItem("quotationProducts");
    if (stored) {
      try {
        const items = JSON.parse(stored);
        setPreloadedItems(items.map((item: any) => ({
          productName: item.productName,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
        })));
        sessionStorage.removeItem("quotationProducts");
        setIsModalOpen(true);
      } catch (e) {
        console.error("Erro ao carregar produtos", e);
      }
    }
  }, []);

  const generatePdfMutation = trpc.quotations.generatePdf.useMutation();

  const handleGeneratePdf = async (data: {
    number: string;
    clientName?: string;
    clientEmail?: string;
    clientPhone?: string;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice: number;
      supplier?: string;
    }>;
    discount?: number;
    tax?: number;
    notes?: string;
  }) => {
    setIsLoading(true);
    try {
      const result = await generatePdfMutation.mutateAsync({
        number: data.number,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        clientPhone: data.clientPhone,
        items: data.items.map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        discount: data.discount,
        tax: data.tax,
        notes: data.notes,
      });

      return {
        success: result.success,
        pdfUrl: result.pdfUrl || undefined,
        message: result.success ? "PDF gerado com sucesso" : "Falha ao gerar PDF",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      return {
        success: false,
        message: `Erro ao gerar PDF: ${errorMessage}`,
      };
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Cabeçalho */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Orçamentos</h1>
          </div>
          <p className="text-gray-600">Crie e gerencie propostas comerciais em PDF</p>
        </div>

        {/* Botão de Ação */}
        <div className="mb-6">
          <Button
            onClick={() => setIsModalOpen(true)}
            size="lg"
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Novo Orçamento
          </Button>
        </div>

        {/* Cards de Informação */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-6 bg-white border-0 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Orçamentos Criados</p>
                <p className="text-3xl font-bold text-gray-900">0</p>
              </div>
              <FileText className="w-12 h-12 text-blue-100" />
            </div>
          </Card>

          <Card className="p-6 bg-white border-0 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Valor Total</p>
                <p className="text-3xl font-bold text-gray-900">R$ 0,00</p>
              </div>
              <Download className="w-12 h-12 text-green-100" />
            </div>
          </Card>

          <Card className="p-6 bg-white border-0 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">PDFs Gerados</p>
                <p className="text-3xl font-bold text-gray-900">0</p>
              </div>
              <FileText className="w-12 h-12 text-purple-100" />
            </div>
          </Card>
        </div>

        {/* Seção Vazia */}
        <Card className="p-12 text-center bg-white border-0 shadow-sm">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Nenhum orçamento criado</h2>
          <p className="text-gray-600 mb-6">
            Clique em "Novo Orçamento" para começar a criar propostas comerciais em PDF
          </p>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Criar Primeiro Orçamento
          </Button>
        </Card>

        {/* Instruções */}
        <Card className="mt-8 p-6 bg-blue-50 border border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-3">Como usar:</h3>
          <ul className="space-y-2 text-blue-800 text-sm">
            <li>✓ Clique em "Novo Orçamento" para abrir o formulário</li>
            <li>✓ Preencha as informações do cliente (opcional)</li>
            <li>✓ Adicione produtos com quantidade e preço</li>
            <li>✓ Configure descontos e impostos se necessário</li>
            <li>✓ Clique em "Gerar e Baixar PDF" para criar a proposta</li>
          </ul>
        </Card>
      </div>

      {/* Modal */}
      <QuotationModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setPreloadedItems([]);
        }}
        onGeneratePdf={handleGeneratePdf}
        preloadedItems={preloadedItems}
      />
    </div>
  );
}
