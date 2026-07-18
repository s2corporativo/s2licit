import { BatchXmlImportComponent } from "@/components/BatchXmlImportComponent";
import { NfeUploadComponent } from "@/components/NfeUploadComponent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, FileText, History, Upload } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export function ImportarNfe() {
  const [activeTab, setActiveTab] = useState("upload");
  
  // Fetch import history
  const { data: historyData, isLoading: historyLoading } = trpc.nfeImport.getImportHistory.useQuery(
    { limit: 10 },
    { enabled: activeTab === "history" }
  );
  
  const importHistory = historyData?.imports || [];

  return (
    <>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Importar NF-e</h1>
          <p className="text-muted-foreground mt-2">
            Importe Notas Fiscais Eletrônicas (XML) para cadastrar produtos e atualizar preços
            automaticamente. Para planilhas de preços (CSV/XLSX), use{" "}
            <Link href="/importar" className="font-medium underline">
              Importar planilha
            </Link>
            .
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Upload NFe
            </TabsTrigger>
            <TabsTrigger value="batch" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              XML em Lote
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab - NFe */}
          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Enviar Arquivo NFe</CardTitle>
                <CardDescription>
                  Selecione um arquivo XML de Nota Fiscal Eletrônica para importar produtos e preços
                </CardDescription>
              </CardHeader>
              <CardContent>
                <NfeUploadComponent />
              </CardContent>
            </Card>

            {/* Information Card */}
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <CardTitle className="text-base text-blue-900">Como funciona</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-blue-800 space-y-2">
                <p>
                  <strong>1. Upload:</strong> Envie um arquivo XML de NFe (Nota Fiscal Eletrônica)
                </p>
                <p>
                  <strong>2. Preview:</strong> Revise os produtos extraídos e selecione quais deseja importar
                </p>
                <p>
                  <strong>3. Reconhecimento:</strong> O sistema compara cada item da nota com o seu
                  catálogo e reconhece automaticamente os produtos que você já tem
                </p>
                <p>
                  <strong>4. Importação:</strong> Produtos novos são criados e preços são atualizados por fornecedor
                </p>
                <p>
                  <strong>5. Atualização:</strong> A tabela de comparação de fornecedores é atualizada em tempo real
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="batch" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Importação XML em Lote</CardTitle>
                <CardDescription>
                  Envie vários XMLs de NF-e em uma única operação, valide o lote e importe apenas os arquivos consistentes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BatchXmlImportComponent />
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                  <div>
                    <CardTitle className="text-base text-amber-900">Boas práticas para lote XML</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-amber-800">
                <p>
                  <strong>1. Padronização:</strong> concentre no mesmo lote XMLs do mesmo fluxo operacional para facilitar conferência e rastreabilidade.
                </p>
                <p>
                  <strong>2. Validação prévia:</strong> o sistema separa automaticamente arquivos válidos e arquivos com inconsistências antes da importação.
                </p>
                <p>
                  <strong>3. Seleção controlada:</strong> somente os XMLs marcados e validados seguem para gravação no histórico de importação.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-6">
            {historyLoading ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground">Carregando histórico...</div>
                </CardContent>
              </Card>
            ) : importHistory.length > 0 ? (
              <div className="space-y-4">
                {importHistory.map((item: any) => (
                  <Card key={item.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{item.supplierName}</CardTitle>
                          <CardDescription>
                            {new Date(item.importedAt).toLocaleString("pt-BR")}
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-600">{item.productsImported}</div>
                          <div className="text-xs text-muted-foreground">produtos importados</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Arquivo</div>
                          <div className="font-mono text-xs truncate">{item.fileName}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">CNPJ</div>
                          <div className="font-mono">{item.supplierCnpj}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-muted-foreground">
                    Nenhuma importação de NFe realizada ainda
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
