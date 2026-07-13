import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Plus, Edit2, Trash2, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface CredentialForm {
  supplierId: number;
  scraperType: string;
  email: string;
  password: string;
  scheduleTime: string;
}

export default function ConfiguradorFornecedores() {
  const [showPassword, setShowPassword] = useState<{ [key: number]: boolean }>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<CredentialForm>>({
    scheduleTime: "02:00",
  });

  // Queries
  const { data: credentials, isLoading, refetch } = trpc.supplierCredentials.listCredentials.useQuery();
  const { data: suppliers } = trpc.suppliers.list.useQuery();

  // Mutations
  const createMutation = trpc.supplierCredentials.createCredential.useMutation({
    onSuccess: () => {
      toast.success("Credencial criada com sucesso");
      setFormData({ scheduleTime: "02:00" });
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const updateMutation = trpc.supplierCredentials.updateCredential.useMutation({
    onSuccess: () => {
      toast.success("Credencial atualizada com sucesso");
      setEditingId(null);
      setFormData({ scheduleTime: "02:00" });
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const deleteMutation = trpc.supplierCredentials.deleteCredential.useMutation({
    onSuccess: () => {
      toast.success("Credencial deletada com sucesso");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const testMutation = trpc.supplierCredentials.testConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.supplierId || !formData.scraperType || !formData.email || !formData.password) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        email: formData.email,
        password: formData.password,
        scheduleTime: formData.scheduleTime,
      });
    } else {
      createMutation.mutate({
        supplierId: formData.supplierId,
        scraperType: formData.scraperType,
        email: formData.email,
        password: formData.password,
        scheduleTime: formData.scheduleTime,
      });
    }
  };

  const handleEdit = (credential: any) => {
    setEditingId(credential.id);
    setFormData({
      supplierId: credential.supplierId,
      scraperType: credential.scraperType,
      email: credential.email,
      password: credential.password,
      scheduleTime: credential.scheduleTime,
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({ scheduleTime: "02:00" });
  };

  const handleTestConnection = () => {
    if (!formData.email || !formData.password) {
      toast.error("Preencha email e senha para testar");
      return;
    }

    testMutation.mutate({
      email: formData.email,
      password: formData.password,
      scraperType: formData.scraperType,
    });
  };

  if (isLoading) {
    return (
      <>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configuração de Fornecedores</h1>
          <p className="text-gray-600 mt-2">
            Gerencie URLs, logins e senhas para atualização automática de preços
          </p>
        </div>

        {/* Form Card */}
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Editar Credencial" : "Adicionar Nova Credencial"}</CardTitle>
            <CardDescription>
              {editingId
                ? "Atualize as informações de acesso do fornecedor"
                : "Configure um novo fornecedor para sincronização de preços"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Supplier Select */}
                <div>
                  <label className="block text-sm font-medium mb-2">Fornecedor *</label>
                  <select
                    value={formData.supplierId || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, supplierId: parseInt(e.target.value) })
                    }
                    disabled={!!editingId}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Selecione um fornecedor</option>
                    {suppliers?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Scraper Type */}
                <div>
                  <label className="block text-sm font-medium mb-2">Tipo de Scraper *</label>
                  <select
                    value={formData.scraperType || ""}
                    onChange={(e) => setFormData({ ...formData, scraperType: e.target.value })}
                    disabled={!!editingId}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Selecione o tipo</option>
                    <option value="tambasa">Tambasa</option>
                    <option value="cristalia">Cristália</option>
                    <option value="ourofino">Ourofino</option>
                  </select>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium mb-2">Email *</label>
                  <Input
                    type="email"
                    value={formData.email || ""}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="seu@email.com"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium mb-2">Senha *</label>
                  <div className="flex gap-2">
                    <Input
                      type={showPassword[editingId || 0] ? "text" : "password"}
                      value={formData.password || ""}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="••••••••"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setShowPassword({
                          ...showPassword,
                          [editingId || 0]: !showPassword[editingId || 0],
                        })
                      }
                    >
                      {showPassword[editingId || 0] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Schedule Time */}
                <div>
                  <label className="block text-sm font-medium mb-2">Horário de Sincronização</label>
                  <Input
                    type="time"
                    value={formData.scheduleTime || "02:00"}
                    onChange={(e) => setFormData({ ...formData, scheduleTime: e.target.value })}
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testMutation.isPending || !formData.email || !formData.password}
                >
                  {testMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    "Testar Conexão"
                  )}
                </Button>

                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending || !formData.email || !formData.password
                  }
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {editingId ? "Atualizando..." : "Criando..."}
                    </>
                  ) : editingId ? (
                    <>
                      <Edit2 className="w-4 h-4 mr-2" />
                      Atualizar
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar
                    </>
                  )}
                </Button>

                {editingId && (
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Credentials List */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Credenciais Configuradas</h2>

          {!credentials || credentials.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Nenhuma credencial configurada ainda</AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4">
              {credentials.map((cred) => (
                <Card key={cred.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{cred.supplierName}</h3>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                            {cred.scraperType}
                          </span>
                          {cred.enabled ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Ativo
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                              Inativo
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-gray-600 space-y-1">
                          <p>
                            <strong>Email:</strong> {cred.email}
                          </p>
                          <p>
                            <strong>Horário:</strong> {cred.scheduleTime}
                          </p>
                          {cred.lastRunAt && (
                            <p>
                              <strong>Última execução:</strong> {new Date(cred.lastRunAt).toLocaleString("pt-BR")}
                            </p>
                          )}
                          {cred.lastRunStatus && (
                            <p>
                              <strong>Status:</strong>{" "}
                              <span
                                className={
                                  cred.lastRunStatus === "success"
                                    ? "text-green-600"
                                    : cred.lastRunStatus === "failed"
                                      ? "text-red-600"
                                      : "text-gray-600"
                                }
                              >
                                {cred.lastRunStatus}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(cred)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja deletar esta credencial?")) {
                              deleteMutation.mutate({ id: cred.id });
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
