import React, { useState } from "react";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Image, AlertCircle, CheckCircle2, Clock } from "lucide-react";

export function ImagesDashboard() {
  const { data: stats, isLoading } = trpc.images.getImageStats.useQuery();
  const { data: lowConfidenceMatches } = trpc.images.getThumbnailsBatch.useQuery(
    { productIds: [] },
    { enabled: false }
  );

  if (isLoading) {
    return <div className="p-4">Carregando...</div>;
  }

  const coveragePercentage = stats?.totalProducts
    ? Math.round((stats.productsWithImage / stats.totalProducts) * 100)
    : 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard de Imagens</h1>
        <p className="text-gray-600">Gerenciar e revisar imagens de produtos</p>
      </div>

      {/* Estatísticas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total de Produtos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalProducts || 0}</div>
            <p className="text-xs text-gray-500 mt-1">Produtos cadastrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Com Imagem</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.productsWithImage || 0}</div>
            <p className="text-xs text-gray-500 mt-1">{coveragePercentage}% de cobertura</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Sem Imagem</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {(stats?.totalProducts || 0) - (stats?.productsWithImage || 0)}
            </div>
            <p className="text-xs text-gray-500 mt-1">{100 - coveragePercentage}% pendente</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Auto-vinculadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.autoLinkedCount || 0}</div>
            <p className="text-xs text-gray-500 mt-1">Por fuzzy matching</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Progresso */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cobertura de Imagens</CardTitle>
          <CardDescription>Percentual de produtos com imagem vinculada</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Progress value={coveragePercentage} className="h-3" />
            <div className="flex justify-between text-sm text-gray-600">
              <span>{coveragePercentage}% completo</span>
              <span>{(stats?.totalProducts || 0) - (stats?.productsWithImage || 0)} produtos pendentes</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Abas de Ações */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Pendentes
          </TabsTrigger>
          <TabsTrigger value="low-confidence" className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Baixa Confiança
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Completo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Produtos Sem Imagem</CardTitle>
              <CardDescription>
                {(stats?.totalProducts || 0) - (stats?.productsWithImage || 0)} produtos aguardando vinculação de imagem
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Use a funcionalidade de auto-vinculação durante a importação de planilhas para vincular imagens automaticamente.
                </p>
                <Button className="w-full">
                  <Image className="w-4 h-4 mr-2" />
                  Importar Planilha com Imagens
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="low-confidence" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Matches com Baixa Confiança</CardTitle>
              <CardDescription>
                Revisão manual de auto-vinculações com score 60-70%
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  {stats?.lowConfidenceCount || 0} matches aguardando revisão manual.
                </p>
                {(stats?.lowConfidenceCount || 0) > 0 && (
                  <Button variant="outline" className="w-full">
                    Revisar {stats?.lowConfidenceCount || 0} Matches
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Imagens Vinculadas</CardTitle>
              <CardDescription>
                {stats?.productsWithImage || 0} produtos com imagem
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Vinculadas Manualmente</p>
                    <p className="text-xl font-bold">{(stats?.productsWithImage || 0) - (stats?.autoLinkedCount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Auto-vinculadas</p>
                    <p className="text-xl font-bold text-blue-600">{stats?.autoLinkedCount || 0}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Histórico de Auto-vinculações */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Auto-vinculações</CardTitle>
          <CardDescription>Últimas 10 auto-vinculações realizadas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-600">
            <p>Histórico de auto-vinculações será exibido aqui.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
