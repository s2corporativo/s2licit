import { useState, useCallback, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import AvisoIA from "@/components/AvisoIA";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Bot, Play, Square, RefreshCw, Filter, Target,
  ChevronRight, CheckCircle2, XCircle, Layers, Zap, Loader2,
} from "lucide-react";

type CampoAlvo = "categoryId" | "activeIngredient" | "pharmaceuticalForm";
type SemCampo = "activeIngredient" | "pharmaceuticalForm" | "category" | "none";
type CampoV2 = "subcategoria" | "fichaTecnica" | "codigoFornecedor";

interface LogEntry {
  time: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
}

const CAMPO_ALVO_LABELS: Record<CampoAlvo, string> = {
  categoryId: "Categoria",
  activeIngredient: "Princípio Ativo",
  pharmaceuticalForm: "Forma Farmacêutica",
};

const SEM_CAMPO_LABELS: Record<SemCampo, string> = {
  none: "Nenhum (todos os produtos do filtro)",
  activeIngredient: "Sem Princípio Ativo",
  pharmaceuticalForm: "Sem Forma Farmacêutica",
  category: "Sem Categoria",
};

// ─── Painel de Migração V2 ───────────────────────────────────────────────────
function MigracaoV2Panel() {
  const [campos, setCampos] = useState<CampoV2[]>(["subcategoria"]);
  const [batchSize, setBatchSizeV2] = useState(20);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const migrateV2Mutation = trpc.reclassificacao.migrateV2Fields.useMutation();

  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs((prev) => [...prev, { time, message, type }].slice(-200));
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const toggleCampo = (campo: CampoV2) => {
    setCampos((prev) =>
      prev.includes(campo) ? prev.filter((c) => c !== campo) : [...prev, campo]
    );
  };

  const CAMPO_LABELS: Record<CampoV2, string> = {
    subcategoria: "Subcategoria",
    fichaTecnica: "Ficha Técnica",
    codigoFornecedor: "Cód. Fornecedor (não infereível)",
  };

  const handleStart = useCallback(async () => {
    if (campos.length === 0) { toast.error("Selecione pelo menos um campo para migrar."); return; }
    setRunning(true);
    setDone(false);
    stopRef.current = false;
    setTotalProcessed(0);
    setTotalUpdated(0);
    setTotalErrors(0);
    setProgress(0);
    setLogs([]);
    addLog(`Iniciando migração V2 — campos: ${campos.map((c) => CAMPO_LABELS[c]).join(", ")} — lote: ${batchSize}`, "info");

    let offset = 0;
    let processed = 0;
    let updated = 0;
    let errors = 0;
    let batchNum = 0;
    const ESTIMATED_TOTAL = 4677; // estimativa

    try {
      while (!stopRef.current) {
        batchNum++;
        addLog(`Lote ${batchNum}: offset ${offset}...`, "info");
        const result = await migrateV2Mutation.mutateAsync({ batchSize, offset, campos });
        const batchProcessed = result.processed ?? batchSize;
        processed += batchProcessed;
        updated += result.updated;
        errors += result.errors;
        offset = result.nextOffset;
        setTotalProcessed(processed);
        setTotalUpdated(updated);
        setTotalErrors(errors);
        setProgress(Math.min(99, Math.round((processed / ESTIMATED_TOTAL) * 100)));
        if (result.errors > 0) {
          addLog(`Lote ${batchNum}: ${result.updated} atualizados, ${result.errors} erros`, "warning");
          for (const msg of (result as any).errorMessages ?? []) addLog(`  ↳ ${msg}`, "error");
        } else {
          addLog(`Lote ${batchNum}: ${result.updated} produtos atualizados`, "success");
        }
        if (result.done) {
          setProgress(100);
          addLog(`Concluído! ${updated.toLocaleString("pt-BR")} atualizados, ${errors} erros de ${processed.toLocaleString("pt-BR")} processados.`, "success");
          setDone(true);
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (stopRef.current) addLog(`Interrompido. ${updated.toLocaleString("pt-BR")} atualizados até agora.`, "warning");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Erro fatal: ${msg}`, "error");
      toast.error("Erro na migração: " + msg);
    } finally {
      setRunning(false);
    }
  }, [campos, batchSize, migrateV2Mutation, addLog]);

  return (
    <Card className="border-orange-200 dark:border-orange-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-orange-500" />
          Migração V2: Preencher Subcategoria e Ficha Técnica via IA
        </CardTitle>
        <CardDescription>
          Preenche automaticamente <strong>Subcategoria</strong> e <strong>Ficha Técnica</strong> nos produtos que ainda não têm esses campos, usando IA com base no nome, princípio ativo, fabricante e categoria.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["subcategoria", "fichaTecnica"] as CampoV2[]).map((campo) => (
            <button
              key={campo}
              onClick={() => toggleCampo(campo)}
              disabled={running}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                campos.includes(campo)
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-orange-400"
              }`}
            >
              {CAMPO_LABELS[campo]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs text-gray-500 whitespace-nowrap">Lote:</Label>
          <Input
            type="number"
            min={5}
            max={50}
            value={batchSize}
            onChange={(e) => setBatchSizeV2(Math.max(5, Math.min(50, Number(e.target.value))))}
            disabled={running}
            className="w-20 h-8 text-sm"
          />
          <span className="text-xs text-gray-400">produtos/lote (max 50)</span>
        </div>
        {(running || done) && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{totalProcessed.toLocaleString("pt-BR")} processados • {totalUpdated.toLocaleString("pt-BR")} atualizados{totalErrors > 0 ? ` • ${totalErrors} erros` : ""}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
        <div className="flex gap-2">
          {!running ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={campos.length === 0} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  {done ? "Reiniciar Migração" : "Iniciar Migração"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Preencher campos com IA?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A IA vai preencher {campos.map((c) => CAMPO_LABELS[c]).join(" e ")} nos
                    produtos que ainda não têm esses campos, gravando direto no catálogo com o
                    status "enriquecido por IA" (nunca como validado). Você pode interromper a
                    qualquer momento e revisar depois pelo filtro de confiabilidade em Produtos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleStart}>Iniciar preenchimento</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button onClick={() => { stopRef.current = true; }} variant="outline" size="sm">
              <Square className="h-3.5 w-3.5 mr-1.5" />
              Parar
            </Button>
          )}
        </div>
        {done && !running && (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-700 dark:text-green-400 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Migração concluída! <strong>{totalUpdated.toLocaleString("pt-BR")}</strong> produtos atualizados.</span>
          </div>
        )}
        {logs.length > 0 && (
          <div className="bg-slate-950 rounded-lg p-3 h-40 overflow-y-auto font-mono text-xs space-y-0.5">
            {logs.map((log, i) => (
              <div key={i} className={`flex gap-2 ${
                log.type === "success" ? "text-green-400" : log.type === "error" ? "text-red-400" : log.type === "warning" ? "text-yellow-400" : "text-slate-300"
              }`}>
                <span className="text-slate-500 shrink-0">{log.time}</span>
                <span>{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReclassificacaoIA() {
  const [categoryId, setCategoryId] = useState<string>("__all__");
  const [supplierId, setSupplierIdState] = useState<string>("__all__");
  const [semCampo, setSemCampo] = useState<SemCampo>("none");
  const [busca, setBusca] = useState("");
  const [campoAlvo, setCampoAlvo] = useState<CampoAlvo>("categoryId");
  const [batchSize, setBatchSize] = useState(150);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data: categories } = trpc.categories.list.useQuery();
  const { data: suppliers } = trpc.suppliers.list.useQuery();

  const previewInput = useMemo(() => ({
    categoryId: categoryId && categoryId !== "__all__" ? Number(categoryId) : undefined,
    supplierId: supplierId && supplierId !== "__all__" ? Number(supplierId) : undefined,
    semCampo,
    busca: busca || undefined,
  }), [categoryId, supplierId, semCampo, busca]);

  const {
    data: preview,
    refetch: refetchPreview,
    isFetching: previewLoading,
  } = trpc.reclassificacao.preview.useQuery(previewInput, { enabled: true });

  const runBatchMutation = trpc.reclassificacao.runBatch.useMutation();

  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs((prev) => [...prev, { time, message, type }].slice(-200));
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const handleStart = useCallback(async () => {
    if (!preview || preview.total === 0) {
      toast.error("Nenhum produto encontrado com os filtros selecionados.");
      return;
    }
    setRunning(true);
    setDone(false);
    stopRef.current = false;
    setTotalProcessed(0);
    setTotalUpdated(0);
    setTotalErrors(0);
    setProgress(0);
    setCurrentBatch(0);
    setTotalBatches(Math.ceil(preview.total / batchSize));
    setLogs([]);

    const total = preview.total;
    addLog(
      `Iniciando reclassificação de ${total.toLocaleString("pt-BR")} produtos — campo: ${CAMPO_ALVO_LABELS[campoAlvo]} — lote: ${batchSize}`,
      "info"
    );

    let offset = 0;
    let processed = 0;
    let updated = 0;
    let errors = 0;
    let batchNum = 0;

    try {
      while (!stopRef.current) {
        batchNum++;
        setCurrentBatch(batchNum);
        addLog(
          `Lote ${batchNum}: processando ${(offset + 1).toLocaleString("pt-BR")}–${Math.min(offset + batchSize, total).toLocaleString("pt-BR")}...`,
          "info"
        );

        const result = await runBatchMutation.mutateAsync({
          categoryId: categoryId && categoryId !== "__all__" ? Number(categoryId) : undefined,
          supplierId: supplierId && supplierId !== "__all__" ? Number(supplierId) : undefined,
          semCampo,
          busca: busca || undefined,
          campoAlvo,
          offset,
          batchSize,
        });

        const batchProcessed = result.processed ?? batchSize;
        processed += batchProcessed;
        updated += result.updated;
        errors += result.errors;
        offset = result.nextOffset;

        setTotalProcessed(processed);
        setTotalUpdated(updated);
        setTotalErrors(errors);
        setProgress(Math.min(100, Math.round((processed / total) * 100)));

        if (result.errors > 0) {
          addLog(`Lote ${batchNum}: ${result.updated} atualizados, ${result.errors} erros`, "warning");
          for (const msg of (result as any).errorMessages ?? []) addLog(`  ↳ ${msg}`, "error");
        } else {
          addLog(`Lote ${batchNum}: ${result.updated} produtos atualizados com sucesso`, "success");
        }

        if (result.done || processed >= total) {
          addLog(
            `Concluído! Total: ${updated.toLocaleString("pt-BR")} atualizados, ${errors} erros de ${processed.toLocaleString("pt-BR")} processados.`,
            "success"
          );
          setDone(true);
          break;
        }

        // Pequena pausa para não sobrecarregar
        await new Promise((r) => setTimeout(r, 300));
      }

      if (stopRef.current) {
        addLog(`Interrompido pelo usuário. ${updated.toLocaleString("pt-BR")} atualizados até agora.`, "warning");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Erro fatal: ${msg}`, "error");
      toast.error("Erro na reclassificação: " + msg);
    } finally {
      setRunning(false);
      refetchPreview();
    }
  }, [
    preview, campoAlvo, batchSize, categoryId, supplierId, semCampo, busca,
    runBatchMutation, addLog, refetchPreview,
  ]);

  const handleStop = () => {
    stopRef.current = true;
    addLog("Solicitação de parada enviada...", "warning");
  };

  const topCategories = categories?.filter((c) => !c.parentId) ?? [];
  const subCategories = categories?.filter((c) => c.parentId) ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <AvisoIA />
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Bot className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Reclassificação em Lote via IA</h1>
          <p className="text-muted-foreground text-sm">
            Selecione os filtros, o campo a atualizar e deixe a IA classificar o máximo de produtos de uma vez — até 200 por lote.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda: filtros + campo-alvo */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4 text-blue-500" />
                Filtros de Produtos
              </CardTitle>
              <CardDescription>Defina quais produtos serão processados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as categorias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas as categorias</SelectItem>
                    {topCategories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                    {subCategories.length > 0 && (
                      <>
                        <Separator className="my-1" />
                        {subCategories.map((cat) => (
                          <SelectItem key={cat.id} value={String(cat.id)}>
                            &nbsp;&nbsp;└ {cat.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Fornecedor</Label>
                <Select value={supplierId} onValueChange={setSupplierIdState}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os fornecedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os fornecedores</SelectItem>
                    {suppliers?.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Mostrar apenas produtos</Label>
                <Select value={semCampo} onValueChange={(v) => setSemCampo(v as SemCampo)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SEM_CAMPO_LABELS) as [SemCampo, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Busca por nome (opcional)</Label>
                <Input
                  placeholder="Ex: Ivermectina, Amoxicilina..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => refetchPreview()}
                disabled={previewLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${previewLoading ? "animate-spin" : ""}`} />
                Atualizar Contagem
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-green-500" />
                Campo a Atualizar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Campo-alvo</Label>
                <Select value={campoAlvo} onValueChange={(v) => setCampoAlvo(v as CampoAlvo)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(CAMPO_ALVO_LABELS) as [CampoAlvo, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Produtos por lote (10–200)</Label>
                <Input
                  type="number"
                  min={10}
                  max={200}
                  value={batchSize}
                  onChange={(e) =>
                    setBatchSize(Math.min(200, Math.max(10, Number(e.target.value))))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Lotes maiores são mais rápidos. Recomendado: 100–150.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita: preview + execução + log */}
        <div className="lg:col-span-2 space-y-4">
          {/* Preview */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-orange-500" />
                  Produtos Afetados
                </CardTitle>
                {preview && (
                  <Badge
                    variant={preview.total > 0 ? "default" : "secondary"}
                    className="text-sm px-3"
                  >
                    {preview.total.toLocaleString("pt-BR")} produtos
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {preview && preview.samples.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">
                    Amostra dos primeiros 10 produtos:
                  </p>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Nome</th>
                          <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">
                            Princípio Ativo
                          </th>
                          <th className="text-left px-3 py-2 font-medium hidden md:table-cell">
                            Forma Farm.
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.samples.map((p, i) => (
                          <tr
                            key={p.id}
                            className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                          >
                            <td className="px-3 py-1.5 truncate max-w-[200px]">{p.name}</td>
                            <td className="px-3 py-1.5 text-muted-foreground hidden sm:table-cell">
                              {p.activeIngredient || (
                                <span className="text-orange-500 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground hidden md:table-cell">
                              {p.pharmaceuticalForm || (
                                <span className="text-orange-500 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.total > 10 && (
                    <p className="text-xs text-muted-foreground text-right">
                      ... e mais {(preview.total - 10).toLocaleString("pt-BR")} produtos
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {previewLoading
                    ? "Carregando..."
                    : "Nenhum produto encontrado com os filtros selecionados."}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Execução */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Execução
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline" className="gap-1">
                  <ChevronRight className="h-3 w-3" />
                  Campo: <strong>{CAMPO_ALVO_LABELS[campoAlvo]}</strong>
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <ChevronRight className="h-3 w-3" />
                  Lote: <strong>{batchSize} produtos</strong>
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <ChevronRight className="h-3 w-3" />
                  Total: <strong>{preview?.total?.toLocaleString("pt-BR") ?? "—"} produtos</strong>
                </Badge>
                {preview && preview.total > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <ChevronRight className="h-3 w-3" />
                    ~{Math.ceil(preview.total / batchSize)} lotes
                  </Badge>
                )}
              </div>

              {(running || done) && (
                <div className="space-y-2">
                  {running && totalBatches > 0 && (
                    <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      <span>Lote {currentBatch} / {totalBatches}</span>
                      <span className="text-muted-foreground font-normal ml-1">— analisando até {batchSize} produtos...</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{totalProcessed.toLocaleString("pt-BR")} processados</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="flex gap-4 text-xs">
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      {totalUpdated.toLocaleString("pt-BR")} atualizados
                    </span>
                    {totalErrors > 0 && (
                      <span className="flex items-center gap-1 text-red-500">
                        <XCircle className="h-3 w-3" />
                        {totalErrors} erros
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={running || !preview || preview.total === 0}
                      className="flex-1 gap-2"
                    >
                      <Play className="h-4 w-4" />
                      {running
                        ? "Processando..."
                        : done
                        ? "Executar Novamente"
                        : "Iniciar Reclassificação"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Reclassificar {preview?.total?.toLocaleString("pt-BR") ?? 0} produtos com IA?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        O campo <strong>{CAMPO_ALVO_LABELS[campoAlvo]}</strong> será atualizado
                        direto no catálogo para todos os produtos do filtro (amostra na tabela
                        acima). Os produtos ficam com status "enriquecido por IA" e podem ser
                        revisados depois. Você pode interromper a execução a qualquer momento.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleStart}>
                        Confirmar e iniciar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {running && (
                  <Button variant="destructive" onClick={handleStop} className="gap-2">
                    <Square className="h-4 w-4" />
                    Parar
                  </Button>
                )}
              </div>

              {done && !running && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-700 dark:text-green-400 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Concluído!{" "}
                    <strong>{totalUpdated.toLocaleString("pt-BR")}</strong> produtos atualizados
                    {totalErrors > 0 ? `, ${totalErrors} erros` : ""}.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Log */}
          {logs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Log de Execução</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-950 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs space-y-0.5">
                  {logs.map((log, i) => (
                    <div
                      key={i}
                      className={`flex gap-2 ${
                        log.type === "success"
                          ? "text-green-400"
                          : log.type === "error"
                          ? "text-red-400"
                          : log.type === "warning"
                          ? "text-yellow-400"
                          : "text-slate-300"
                      }`}
                    >
                      <span className="text-slate-500 shrink-0">{log.time}</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Painel de Migração V2 */}
      <MigracaoV2Panel />
    </div>
  );
}
