import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit2, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

interface CategoryRule {
  categoryId: number;
  categoryName: string;
  marginPercentage: number;
  icmsPercentage: number;
  ipPercentage: number;
  pisPercentage: number;
  cofinsPercentage: number;
  freightType: "fixed" | "percentage";
  freightValue: number;
  isActive: boolean;
}

export default function RegrasCategoria() {
  const [rules, setRules] = useState<CategoryRule[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingRule, setEditingRule] = useState<CategoryRule | null>(null);

  // Carregar regras e categorias do servidor
  const { data: rulesData, isLoading } = trpc.categoryPricing.listRules.useQuery();
  const { data: categories } = trpc.categories.list.useQuery();
  const updateRuleMutation = trpc.categoryPricing.updateRule.useMutation();
  const deleteRuleMutation = trpc.categoryPricing.deleteRule.useMutation();

  useEffect(() => {
    if (rulesData) {
      // Mesclar dados do servidor com nomes reais das categorias
      const merged: CategoryRule[] = rulesData.map((r) => ({
        categoryId: r.categoryId,
        categoryName: categories?.find((c) => c.id === r.categoryId)?.name ?? `Categoria ${r.categoryId}`,
        marginPercentage: r.marginPercentage,
        icmsPercentage: r.icmsPercentage,
        ipPercentage: r.ipPercentage,
        pisPercentage: r.pisPercentage,
        cofinsPercentage: r.cofinsPercentage,
        freightType: r.freightType as "fixed" | "percentage",
        freightValue: r.freightValue,
        isActive: r.isActive,
      }));
      setRules(merged);
    }
  }, [rulesData, categories]);

  const handleEdit = (rule: CategoryRule) => {
    setEditingId(rule.categoryId);
    setEditingRule({ ...rule });
  };

  const handleSave = async () => {
    if (!editingRule) return;
    try {
      await updateRuleMutation.mutateAsync({
        categoryId: editingRule.categoryId,
        marginPercentage: editingRule.marginPercentage,
        icmsPercentage: editingRule.icmsPercentage,
        ipPercentage: editingRule.ipPercentage,
        pisPercentage: editingRule.pisPercentage,
        cofinsPercentage: editingRule.cofinsPercentage,
        freightType: editingRule.freightType,
        freightValue: editingRule.freightValue,
        isActive: editingRule.isActive,
      });
      setRules(rules.map((r) => (r.categoryId === editingRule.categoryId ? editingRule : r)));
      setEditingId(null);
      setEditingRule(null);
      toast.success("Regra atualizada com sucesso");
    } catch (error) {
      toast.error("Erro ao atualizar regra");
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingRule(null);
  };

  const handleDelete = async (categoryId: number) => {
    try {
      await deleteRuleMutation.mutateAsync({ categoryId });
      setRules(rules.filter((r) => r.categoryId !== categoryId));
      toast.success("Regra removida");
    } catch (error) {
      toast.error("Erro ao remover regra");
    }
  };

  const getTotalTaxPercentage = (rule: CategoryRule) => {
    return rule.icmsPercentage + rule.ipPercentage + rule.pisPercentage + rule.cofinsPercentage;
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Regras de Precificação por Categoria</h1>
          <p className="text-gray-600 mt-2">
            Configure margens de lucro, impostos e fretes específicos para cada categoria de produto
          </p>
        </div>

        <Alert>
          <AlertDescription>
            As regras definidas aqui serão aplicadas automaticamente ao precificar produtos de cada categoria.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4">
          {isLoading ? (
            <div className="text-center py-8">Carregando regras...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Nenhuma regra de categoria cadastrada.</div>
          ) : (
            rules.map((rule) => (
            <Card key={rule.categoryId} className={!rule.isActive ? "opacity-50" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{rule.categoryName}</CardTitle>
                    <CardDescription>
                      Margem: {rule.marginPercentage}% | Impostos: {getTotalTaxPercentage(rule).toFixed(2)}% |
                      Frete: {rule.freightType === "fixed" ? `${formatBRL(rule.freightValue)}` : `${rule.freightValue}%`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {editingId === rule.categoryId ? (
                      <>
                        <Button size="sm" onClick={handleSave} className="bg-green-600 hover:bg-green-700">
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancel}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(rule)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(rule.categoryId)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>

              {editingId === rule.categoryId && editingRule ? (
                <CardContent className="space-y-4">
                  <Tabs defaultValue="margem" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="margem">Margem</TabsTrigger>
                      <TabsTrigger value="impostos">Impostos</TabsTrigger>
                      <TabsTrigger value="frete">Frete</TabsTrigger>
                    </TabsList>

                    <TabsContent value="margem" className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Margem de Lucro (%)</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editingRule.marginPercentage}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              marginPercentage: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="impostos" className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium mb-1">ICMS (%)</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editingRule.icmsPercentage}
                            onChange={(e) =>
                              setEditingRule({
                                ...editingRule,
                                icmsPercentage: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">IP (%)</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editingRule.ipPercentage}
                            onChange={(e) =>
                              setEditingRule({
                                ...editingRule,
                                ipPercentage: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">PIS (%)</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editingRule.pisPercentage}
                            onChange={(e) =>
                              setEditingRule({
                                ...editingRule,
                                pisPercentage: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">COFINS (%)</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editingRule.cofinsPercentage}
                            onChange={(e) =>
                              setEditingRule({
                                ...editingRule,
                                cofinsPercentage: parseFloat(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        Total de impostos: {getTotalTaxPercentage(editingRule).toFixed(2)}%
                      </p>
                    </TabsContent>

                    <TabsContent value="frete" className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Tipo de Frete</label>
                        <select
                          value={editingRule.freightType}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              freightType: e.target.value as "fixed" | "percentage",
                            })
                          }
                          className="w-full px-3 py-2 border rounded-md"
                        >
                          <option value="fixed">Valor Fixo (R$)</option>
                          <option value="percentage">Percentual (%)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          {editingRule.freightType === "fixed" ? "Valor (R$)" : "Percentual (%)"}
                        </label>
                        <Input
                          type="number"
                          step="0.01"
                          value={editingRule.freightValue}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              freightValue: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              ) : null}
            </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
