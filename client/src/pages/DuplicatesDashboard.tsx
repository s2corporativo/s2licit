import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DuplicatesReviewModal, DuplicateGroup } from "@/components/DuplicatesReviewModal";

export function DuplicatesDashboard() {
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedDuplicates, setSelectedDuplicates] = useState<any[]>([]);

  // Queries
  const statsQuery = trpc.duplicates.getDuplicateStats.useQuery();
  const listQuery = trpc.duplicates.listDuplicateGroups.useQuery({ pageSize: 100 });

  const stats = statsQuery.data;
  const duplicateGroups = listQuery.data?.groups || [];

  const handleReviewDuplicates = () => {
    setSelectedDuplicates(duplicateGroups);
    setShowReviewModal(true);
  };

  const handleApplyActions = async (actions: any[]) => {
    // Aplicar ações de merge/replace
    for (const action of actions) {
      if (action.action === "merge") {
        // Implementar merge com consolidação de dados
      } else if (action.action === "replace") {
        // Implementar replace
      }
    }
    // Recarregar dados
    listQuery.refetch();
    statsQuery.refetch();
  };

  if (statsQuery.isLoading) {
    return <div className="p-8 text-center">Carregando estatísticas...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard de Duplicados</h1>
        <p className="text-gray-600 mt-2">Monitore e gerencie produtos duplicados no catálogo</p>
      </div>

      {/* Estatísticas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Grupos Detectados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalDuplicateGroups || 0}</div>
            <p className="text-xs text-gray-600 mt-1">Grupos de produtos duplicados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Produtos Afetados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalDuplicateProducts || 0}</div>
            <p className="text-xs text-gray-600 mt-1">Produtos em grupos duplicados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">% de Duplicados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats?.duplicatePercentage || "0"}%
            </div>
            <p className="text-xs text-gray-600 mt-1">Do total de produtos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total de Produtos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats?.totalProducts || 0}
            </div>
            <p className="text-xs text-gray-600 mt-1">No catálogo</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerta se há duplicados */}
      {stats && stats.totalDuplicateGroups > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Existem <strong>{stats.totalDuplicateGroups}</strong> grupos de duplicados detectados.
            <Button
              size="sm"
              variant="link"
              onClick={handleReviewDuplicates}
              className="ml-2"
            >
              Revisar agora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Abas */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">Pendentes ({stats?.totalDuplicateGroups || 0})</TabsTrigger>
          <TabsTrigger value="resolved">Resolvidos (0)</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {/* Pendentes */}
        <TabsContent value="pending" className="space-y-4">
          {duplicateGroups.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                Nenhum duplicado pendente. Seu catálogo está limpo! ✨
              </CardContent>
            </Card>
          ) : (
            <>
              <Button onClick={handleReviewDuplicates} className="w-full">
                <Zap className="h-4 w-4 mr-2" />
                Revisar Todos os Duplicados
              </Button>

              <div className="space-y-3">
                {duplicateGroups.map((group) => (
                  <Card key={group.groupId}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{group.products[0]?.name}</CardTitle>
                          <CardDescription>
                            {group.products.length} produtos • Similaridade: {(group.similarity * 100).toFixed(0)}%
                          </CardDescription>
                        </div>
                        <Badge variant="outline">{group.products.length} itens</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {group.products.map((p) => (
                          <div key={p.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div>
                              <div className="font-medium">{p.name}</div>
                              <div className="text-xs text-gray-600">
                                {p.concentration && `Conc: ${p.concentration}`}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500">ID: {p.id}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* Resolvidos */}
        <TabsContent value="resolved" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Duplicados Resolvidos</CardTitle>
            <CardDescription>
              Grupos que foram resolvidos através de mesclas ou substituições
            </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-8 text-gray-500">
                <TrendingDown className="h-8 w-8 mr-2" />
                Nenhuma resolução registrada ainda
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Histórico */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de Ações</CardTitle>
              <CardDescription>Todas as operações de merge, replace e marcação como não-duplicado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center py-8 text-gray-500">
                <TrendingUp className="h-8 w-8 mr-2" />
                Nenhuma ação registrada ainda
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Revisão */}
      <DuplicatesReviewModal
        isOpen={showReviewModal}
        duplicateGroups={selectedDuplicates}
        onClose={() => setShowReviewModal(false)}
        onApply={handleApplyActions}
      />
    </div>
  );
}
