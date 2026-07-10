import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, Play, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

export default function ConfiguradorScraper() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [scheduleTime, setScheduleTime] = useState("02:00");

  // Queries - usando endpoints corretos
  const {
    data: configs,
    isLoading: isLoadingConfigs,
    refetch: refetchConfigs,
  } = trpc.scraper.listScraperConfigs.useQuery();

  const { data: logsData, isLoading: isLoadingLogs } = trpc.scraper.getScraperLogs.useQuery({
    scraperConfigId: configs?.[0]?.id ?? 0,
    limit: 10,
  }, {
    enabled: !!configs?.[0]?.id,
  });

  // Mutations - usando endpoints corretos
  const configureScraperMutation = trpc.scraper.configureScraperForSupplier.useMutation({
    onSuccess: () => {
      setEmail("");
      setPassword("");
      toast.success("Configuração salva com sucesso!");
      refetchConfigs();
    },
    onError: (err) => {
      toast.error(`Erro ao configurar: ${err.message}`);
    },
  });

  const executeScraperMutation = trpc.scraper.runScraperNow.useMutation({
    onSuccess: (data) => {
      const updated = data?.result?.productsUpdated ?? 0;
      toast.success(`Scraper executado: ${updated} produtos atualizados`);
      refetchConfigs();
    },
    onError: (err) => {
      toast.error(`Erro ao executar: ${err.message}`);
    },
  });

  const enableScraperMutation = trpc.scraper.enableScraperConfig.useMutation({
    onSuccess: () => {
      toast.success("Scraper ativado!");
      refetchConfigs();
    },
    onError: (err) => {
      toast.error(`Erro: ${err.message}`);
    },
  });

  const disableScraperMutation = trpc.scraper.disableScraperConfig.useMutation({
    onSuccess: () => {
      toast.success("Scraper desativado!");
      refetchConfigs();
    },
    onError: (err) => {
      toast.error(`Erro: ${err.message}`);
    },
  });

  const handleConfigureScraper = () => {
    if (!email || !password) {
      toast.error("Por favor, preencha email e senha");
      return;
    }
    configureScraperMutation.mutate({
      email,
      password,
      scheduleTime,
      supplierId: 1,
      scraperType: "tambasa",
    });
  };

  const handleExecuteScraper = (scraperConfigId: number) => {
    executeScraperMutation.mutate({ scraperConfigId });
  };

  const handleToggleScraper = (scraperConfigId: number, enabled: boolean) => {
    if (enabled) {
      disableScraperMutation.mutate({ scraperConfigId });
    } else {
      enableScraperMutation.mutate({ scraperConfigId });
    }
  };

  const config = configs?.[0];
  const logs = logsData;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configurador de Scraper</h1>
          <p className="text-muted-foreground mt-2">
            Configure a atualização automática de preços da Tambasa
          </p>
        </div>

        {/* Alert de Segurança */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Suas credenciais são armazenadas de forma criptografada e nunca são exibidas após
            configuração. Você pode alterar a senha a qualquer momento.
          </AlertDescription>
        </Alert>

        {/* Card de Configuração */}
        <Card>
          <CardHeader>
            <CardTitle>Configurar Credenciais Tambasa</CardTitle>
            <CardDescription>
              Insira suas credenciais de acesso ao portal Tambasa para atualização automática de
              preços
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu.email@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={configureScraperMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Sua senha (criptografada)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={configureScraperMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduleTime">Horário de Execução Diária</Label>
                <Input
                  id="scheduleTime"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  disabled={configureScraperMutation.isPending}
                />
              </div>
            </div>

            <Button
              onClick={handleConfigureScraper}
              disabled={configureScraperMutation.isPending}
              className="w-full"
            >
              {configureScraperMutation.isPending ? "Configurando..." : "Salvar Configuração"}
            </Button>
          </CardContent>
        </Card>

        {/* Status da Configuração */}
        {isLoadingConfigs ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              Carregando configurações...
            </CardContent>
          </Card>
        ) : config ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Status do Scraper</CardTitle>
                  <CardDescription>Tambasa - Atualização de Preços</CardDescription>
                </div>
                <Badge variant={config.enabled === "yes" ? "default" : "secondary"}>
                  {config.enabled === "yes" ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Horário de Execução</p>
                  <p className="text-lg font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {config.scheduleTime}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Última Execução</p>
                  <p className="text-lg font-semibold">
                    {config.lastRunAt
                      ? new Date(config.lastRunAt).toLocaleDateString("pt-BR", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Nunca"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Produtos Atualizados</p>
                  <p className="text-lg font-semibold">{config.productsUpdatedCount || 0}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Produtos Criados</p>
                  <p className="text-lg font-semibold">{config.productsCreatedCount || 0}</p>
                </div>
              </div>

              {config.lastRunStatus && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                  {config.lastRunStatus === "success" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {config.lastRunStatus === "success"
                        ? "Última execução bem-sucedida"
                        : "Última execução falhou"}
                    </p>
                    {config.lastRunErrorMessage && (
                      <p className="text-xs text-muted-foreground">{config.lastRunErrorMessage}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleExecuteScraper(config.id)}
                  disabled={executeScraperMutation.isPending}
                  className="flex-1"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {executeScraperMutation.isPending ? "Executando..." : "Executar Agora"}
                </Button>

                <Button
                  variant={config.enabled === "yes" ? "destructive" : "default"}
                  onClick={() => handleToggleScraper(config.id, config.enabled === "yes")}
                  disabled={enableScraperMutation.isPending || disableScraperMutation.isPending}
                  className="flex-1"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {config.enabled === "yes" ? "Desativar" : "Ativar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Histórico de Execuções */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Execuções</CardTitle>
            <CardDescription>Últimas 10 execuções do scraper</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingLogs ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : logs && logs.length > 0 ? (
              <div className="space-y-2">
                {logs.map((log: any) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      {log.status === "success" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {new Date(log.executedAt).toLocaleDateString("pt-BR", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {log.productsScraped} produtos | {log.productsMatched} encontrados |{" "}
                          {log.productsUpdated} atualizados
                        </p>
                      </div>
                    </div>
                    <Badge variant={log.status === "success" ? "default" : "destructive"}>
                      {log.status === "success" ? "Sucesso" : "Erro"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Nenhuma execução registrada</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
