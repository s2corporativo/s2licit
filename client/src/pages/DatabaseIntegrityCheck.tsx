import { useState } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface IntegrityStatus {
  status: 'healthy' | 'warning' | 'critical';
  summary: string;
  missingTables: string[];
  tables: Array<{
    name: string;
    exists: boolean;
    columnCount?: number;
    error?: string;
  }>;
  totalTables: number;
}

export function DatabaseIntegrityCheck() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const integrityQuery = trpc.audit.checkDatabaseIntegrity.useQuery(undefined, {
    refetchInterval: 60000, // Refetch a cada 60 segundos
  });
  const statsQuery = trpc.audit.getDatabaseStats.useQuery();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await integrityQuery.refetch();
    await statsQuery.refetch();
    setIsRefreshing(false);
  };

  const data = integrityQuery.data as IntegrityStatus | undefined;

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'critical':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-50 border-green-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'critical':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Geral */}
      <Card className={`border-2 ${data ? getStatusColor(data.status) : 'bg-gray-50'}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            {getStatusIcon(data?.status)}
            <div>
              <CardTitle>Status de Integridade do Banco</CardTitle>
              <CardDescription>{data?.summary || 'Carregando...'}</CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || integrityQuery.isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Verificando...' : 'Verificar Agora'}
          </Button>
        </CardHeader>
      </Card>

      {/* Tabelas Ausentes */}
      {data?.missingTables && data.missingTables.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-900">Tabelas Ausentes</CardTitle>
            <CardDescription className="text-red-700">
              {data.missingTables.length} tabela(s) não encontrada(s) no banco de dados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.missingTables.map((table) => (
                <div
                  key={table}
                  className="flex items-center gap-2 p-2 bg-white rounded border border-red-200"
                >
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <code className="text-sm font-mono text-red-700">{table}</code>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-white rounded border border-red-200 text-sm text-red-700">
              <strong>Ação recomendada:</strong> Execute <code className="font-mono">pnpm db:push</code> para sincronizar as migrações pendentes.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabelas Verificadas */}
      <Card>
        <CardHeader>
          <CardTitle>Verificação de Tabelas</CardTitle>
          <CardDescription>
            {data?.totalTables || 0} tabelas esperadas ({data?.tables.filter(t => t.exists).length || 0} existentes)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data?.tables.map((table) => (
              <div
                key={table.name}
                className={`flex items-center justify-between p-3 rounded border ${
                  table.exists
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center gap-2 flex-1">
                  {table.exists ? (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  )}
                  <code className="text-sm font-mono">{table.name}</code>
                </div>
                <div className="flex items-center gap-2">
                  {table.columnCount && (
                    <Badge variant="outline" className="text-xs">
                      {table.columnCount} colunas
                    </Badge>
                  )}
                  {table.error && (
                    <Badge variant="destructive" className="text-xs">
                      Erro
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas do Banco */}
      {statsQuery.data?.status === 'ok' && (
        <Card>
          <CardHeader>
            <CardTitle>Estatísticas do Banco</CardTitle>
            <CardDescription>Tamanho e volume de dados por tabela</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(statsQuery.data?.tables as any[])?.map((table) => (
                <div
                  key={table.TABLE_NAME}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                >
                  <span className="font-mono">{table.TABLE_NAME}</span>
                  <div className="flex gap-4 text-xs text-gray-600">
                    <span>{table.TABLE_ROWS?.toLocaleString() || 0} linhas</span>
                    <span>{table.size_mb || 0} MB</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Informações de Suporte */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Informações de Suporte</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <p>
            <strong>Última verificação:</strong> Verificação automática ativa
          </p>
          <p>
            <strong>Próxima verificação automática:</strong> Em aproximadamente 1 minuto
          </p>
          <p>
            Se encontrar problemas persistentes, verifique os logs do servidor e execute <code className="font-mono bg-white px-2 py-1 rounded">pnpm db:push</code> para sincronizar o schema.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
