import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Image, Copy, Zap, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ReclassificationModal } from "@/components/ReclassificationModal";

export function DataQualityDashboard() {
  const [activeTab, setActiveTab] = useState("images");
  const [reclassificationOpen, setReclassificationOpen] = useState(false);

  // Queries para estatísticas
  const imagesStats = trpc.images.getImageStats.useQuery();
  const duplicatesStats = trpc.duplicates.getDuplicateStats.useQuery();
  const enrichmentStats = trpc.enrichment.getEnrichmentStats.useQuery();
  const reclassificationStats = trpc.reclassification.getReclassificationStats.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Qualidade de Dados</h1>
          <p className="text-gray-600 mt-2">Gerenciamento centralizado de imagens, duplicados e enriquecimento</p>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Cobertura de Imagens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {imagesStats.data ? `${Math.round((imagesStats.data.withImages / imagesStats.data.totalProducts) * 100)}%` : "—"}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {imagesStats.data?.withImages ?? 0} de {imagesStats.data?.totalProducts ?? 0} produtos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Grupos Duplicados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{duplicatesStats.data?.totalDuplicateGroups ?? 0}</div>
            <p className="text-xs text-gray-500 mt-1">
              {duplicatesStats.data?.totalDuplicateProducts ?? 0} produtos afetados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Enriquecimento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {enrichmentStats.data ? `${Math.round((enrichmentStats.data.enriquecidos / enrichmentStats.data.total) * 100)}%` : "—"}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {enrichmentStats.data?.enriquecidos ?? 0} de {enrichmentStats.data?.total ?? 0} produtos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas Críticos */}
      {imagesStats.data && (imagesStats.data.withImages / imagesStats.data.totalProducts) < 0.5 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            Menos de 50% dos produtos possuem imagens. Considere usar a auto-vinculação de imagens para melhorar a cobertura.
          </AlertDescription>
        </Alert>
      )}

      {duplicatesStats.data && duplicatesStats.data.totalDuplicateGroups > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {duplicatesStats.data.totalDuplicateGroups} grupos de duplicados detectados. Revise e resolva para melhorar a qualidade dos dados.
          </AlertDescription>
        </Alert>
      )}

      {enrichmentStats.data && (enrichmentStats.data.enriquecidos / enrichmentStats.data.total) < 0.7 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            Menos de 70% dos produtos possuem ficha técnica completa. Use o enriquecimento com IA para aumentar a cobertura.
          </AlertDescription>
        </Alert>
      )}

      {/* Abas de Conteúdo */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="images" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            <span className="hidden sm:inline">Imagens</span>
          </TabsTrigger>
          <TabsTrigger value="duplicates" className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            <span className="hidden sm:inline">Duplicados</span>
          </TabsTrigger>
          <TabsTrigger value="enrichment" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Enriquecimento</span>
          </TabsTrigger>
        </TabsList>

        {/* Aba: Imagens */}
        <TabsContent value="images" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gestão de Imagens de Produtos</CardTitle>
              <CardDescription>
                Visualize e gerencie a cobertura de imagens, auto-vinculação e matches com baixa confiança
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500 space-y-3">
                <p>A gestão completa de imagens fica na página dedicada.</p>
                <a href="/imagens" className="inline-block text-sm font-semibold text-blue-700 hover:text-blue-900 underline">
                  Abrir Gestão de Imagens →
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba: Duplicados */}
        <TabsContent value="duplicates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gestão de Produtos Duplicados</CardTitle>
              <CardDescription>
                Revise, mescle e resolva produtos duplicados detectados no catálogo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500 space-y-3">
                <p>A revisão e mesclagem de duplicados é feita no catálogo de produtos.</p>
                <a href="/produtos" className="inline-block text-sm font-semibold text-blue-700 hover:text-blue-900 underline">
                  Abrir Catálogo de Produtos →
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aba: Enriquecimento */}
        <TabsContent value="enrichment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enriquecimento com IA</CardTitle>
              <CardDescription>
                Classifique automaticamente produtos com IA, revise sugestões e aplique em lote
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Produtos sem categoria</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {reclassificationStats.data?.needsReclassification ?? 0}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">Categorias disponíveis</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {reclassificationStats.data?.categories.length ?? 0}
                  </p>
                </div>
              </div>
              
              <Button
                onClick={() => setReclassificationOpen(true)}
                className="w-full"
                size="lg"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Reclassificar Produtos em Lote
              </Button>
              
              <div className="text-sm text-muted-foreground">
                <p className="font-semibold mb-2">Categorias disponíveis:</p>
                <div className="space-y-1">
                  {reclassificationStats.data?.categories.map((cat) => (
                    <div key={cat} className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-primary rounded-full"></span>
                      <span>{cat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Reclassificação */}
      <ReclassificationModal
        open={reclassificationOpen}
        onOpenChange={setReclassificationOpen}
        onSuccess={() => {
          // Recarregar estatísticas após sucesso
          reclassificationStats.refetch();
          enrichmentStats.refetch();
        }}
      />
    </div>
  );
}
