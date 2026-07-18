import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatBRL } from "@/lib/format";

interface XmlBatchFile {
  fileName: string;
  xmlContent: string;
}

interface BatchPreviewItem {
  index: number;
  fileName: string;
  status: "ready" | "error";
  nfeNumber?: string;
  supplierName?: string;
  supplierCnpj?: string;
  productsCount: number;
  totalValue: number;
  errors: string[];
}

interface BatchPreviewResponse {
  success: boolean;
  files: BatchPreviewItem[];
  summary: {
    totalFiles: number;
    validFiles: number;
    invalidFiles: number;
    totalProducts: number;
    totalValue: number;
  };
}

interface BatchImportResponse {
  success: boolean;
  summary: {
    processedFiles: number;
    importedFiles: number;
    failedFiles: number;
    importedProducts: number;
  };
  results: Array<{
    index: number;
    fileName: string;
    status: "imported" | "failed";
    nfeNumber?: string;
    supplierName?: string;
    supplierCnpj?: string;
    importedProducts: number;
    totalValue: number;
    warnings: string[];
    error?: string;
  }>;
  error?: string;
}

const formatCurrency = formatBRL;

export function BatchXmlImportComponent() {
  const [xmlFiles, setXmlFiles] = useState<XmlBatchFile[]>([]);
  const [preview, setPreview] = useState<BatchPreviewResponse | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [lastImport, setLastImport] = useState<BatchImportResponse | null>(null);

  const previewMutation = trpc.nfeImport.previewBatchXmlImport.useMutation();
  const importMutation = trpc.nfeImport.importBatchXml.useMutation();

  const readyItems = useMemo(
    () => preview?.files.filter((item) => item.status === "ready") ?? [],
    [preview]
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const parsedFiles = await Promise.all(
      files.map(async (file) => ({
        fileName: file.name,
        xmlContent: await file.text(),
      }))
    );

    setXmlFiles(parsedFiles);
    setPreview(null);
    setSelectedIndexes(new Set());
    setLastImport(null);
    setMessage({
      type: "success",
      text: `${parsedFiles.length} arquivo(s) XML carregado(s) para análise em lote.`,
    });
  };

  const handlePreview = async () => {
    if (xmlFiles.length === 0) {
      setMessage({ type: "error", text: "Selecione ao menos um arquivo XML." });
      return;
    }

    const result = (await previewMutation.mutateAsync({ files: xmlFiles })) as BatchPreviewResponse;
    setPreview(result);
    setSelectedIndexes(new Set(result.files.filter((item) => item.status === "ready").map((item) => item.index)));
    setLastImport(null);
    setMessage({
      type: "success",
      text: `${result.summary.validFiles} arquivo(s) válidos e ${result.summary.invalidFiles} com inconsistências identificadas.`,
    });
  };

  const handleToggleSelection = (index: number) => {
    const updated = new Set(selectedIndexes);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setSelectedIndexes(updated);
  };

  const handleSelectAllReady = () => {
    if (readyItems.length === 0) {
      return;
    }

    if (selectedIndexes.size === readyItems.length) {
      setSelectedIndexes(new Set());
      return;
    }

    setSelectedIndexes(new Set(readyItems.map((item) => item.index)));
  };

  const handleImport = async () => {
    if (xmlFiles.length === 0) {
      setMessage({ type: "error", text: "Nenhum lote carregado para importação." });
      return;
    }

    if (selectedIndexes.size === 0) {
      setMessage({ type: "error", text: "Selecione ao menos um XML válido para importar." });
      return;
    }

    const result = (await importMutation.mutateAsync({
      files: xmlFiles,
      selectedIndexes: Array.from(selectedIndexes),
    })) as BatchImportResponse;

    setLastImport(result);
    setMessage(
      result.success
        ? {
            type: "success",
            text: `${result.summary.importedFiles} arquivo(s) importado(s), totalizando ${result.summary.importedProducts} produto(s).`,
          }
        : {
            type: "error",
            text: result.error || "Nenhum XML válido foi importado neste lote.",
          }
    );
  };

  const resetAll = () => {
    setXmlFiles([]);
    setPreview(null);
    setSelectedIndexes(new Set());
    setLastImport(null);
    setMessage(null);
  };

  return (
    <div className="space-y-6">
      {message && (
        <Card className={message.type === "success" ? "border-green-200 bg-green-50 p-4" : "border-red-200 bg-red-50 p-4"}>
          <div className="flex gap-3">
            {message.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            )}
            <p className={message.type === "success" ? "text-sm text-green-900" : "text-sm text-red-900"}>{message.text}</p>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Importação XML em Lote</h3>
            <p className="text-sm text-muted-foreground">
              Envie vários XMLs de NF-e de uma só vez, valide o lote e importe apenas os arquivos consistentes.
            </p>
          </div>

          <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center">
            <input
              type="file"
              accept=".xml"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              id="batch-xml-input"
            />
            <label htmlFor="batch-xml-input" className="flex cursor-pointer flex-col items-center gap-2">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm font-medium">Selecionar múltiplos arquivos XML</span>
              <span className="text-xs text-muted-foreground">Suporte a lote de até 30 arquivos por operação</span>
            </label>
          </div>

          {xmlFiles.length > 0 && (
            <div className="rounded-lg bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Arquivos carregados</p>
                  <p className="text-xs text-muted-foreground">{xmlFiles.length} XML(s) prontos para análise</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetAll} disabled={previewMutation.isPending || importMutation.isPending}>
                    Limpar lote
                  </Button>
                  <Button onClick={handlePreview} disabled={previewMutation.isPending || importMutation.isPending}>
                    {previewMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analisando lote...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-4 w-4" />
                        Analisar lote XML
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {preview && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Arquivos no lote</p>
              <p className="text-2xl font-bold">{preview.summary.totalFiles}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Válidos</p>
              <p className="text-2xl font-bold text-green-600">{preview.summary.validFiles}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Inválidos</p>
              <p className="text-2xl font-bold text-red-600">{preview.summary.invalidFiles}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Produtos</p>
              <p className="text-2xl font-bold">{preview.summary.totalProducts}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Valor total</p>
              <p className="text-xl font-bold">{formatCurrency(preview.summary.totalValue)}</p>
            </Card>
          </div>

          <Card className="p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h4 className="font-semibold">Pré-validação do lote</h4>
                <p className="text-sm text-muted-foreground">
                  Revise os XMLs válidos e importe apenas os documentos selecionados.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSelectAllReady} disabled={readyItems.length === 0}>
                  {selectedIndexes.size === readyItems.length ? "Desmarcar válidos" : "Selecionar válidos"}
                </Button>
                <Button onClick={handleImport} disabled={importMutation.isPending || selectedIndexes.size === 0}>
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importando lote...
                    </>
                  ) : (
                    `Importar ${selectedIndexes.size} XML(s)`
                  )}
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2">Selecionar</th>
                    <th className="px-3 py-2">Arquivo</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Fornecedor</th>
                    <th className="px-3 py-2">NF-e</th>
                    <th className="px-3 py-2 text-right">Produtos</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.files.map((item) => {
                    const canSelect = item.status === "ready";
                    return (
                      <tr key={`${item.fileName}-${item.index}`} className="border-b align-top">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIndexes.has(item.index)}
                            disabled={!canSelect}
                            onChange={() => handleToggleSelection(item.index)}
                          />
                        </td>
                        <td className="px-3 py-3 font-medium">{item.fileName}</td>
                        <td className="px-3 py-3">
                          <span className={item.status === "ready" ? "font-medium text-green-700" : "font-medium text-red-700"}>
                            {item.status === "ready" ? "Pronto" : "Com erro"}
                          </span>
                        </td>
                        <td className="px-3 py-3">{item.supplierName || "—"}</td>
                        <td className="px-3 py-3">{item.nfeNumber || "—"}</td>
                        <td className="px-3 py-3 text-right">{item.productsCount}</td>
                        <td className="px-3 py-3 text-right">{formatCurrency(item.totalValue)}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {item.errors.length > 0 ? item.errors.join("; ") : item.supplierCnpj || "Sem observações"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {lastImport && (
        <Card className="p-4">
          <div className="mb-4">
            <h4 className="font-semibold">Resultado da importação em lote</h4>
            <p className="text-sm text-muted-foreground">
              {lastImport.summary.importedFiles} arquivo(s) importado(s), {lastImport.summary.failedFiles} falha(s), {lastImport.summary.importedProducts} produto(s) registrados.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-3 py-2">Arquivo</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Fornecedor</th>
                  <th className="px-3 py-2">NF-e</th>
                  <th className="px-3 py-2 text-right">Produtos</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {lastImport.results.map((item) => (
                  <tr key={`${item.fileName}-${item.index}`} className="border-b align-top">
                    <td className="px-3 py-3 font-medium">{item.fileName}</td>
                    <td className="px-3 py-3">
                      <span className={item.status === "imported" ? "font-medium text-green-700" : "font-medium text-red-700"}>
                        {item.status === "imported" ? "Importado" : "Falhou"}
                      </span>
                    </td>
                    <td className="px-3 py-3">{item.supplierName || "—"}</td>
                    <td className="px-3 py-3">{item.nfeNumber || "—"}</td>
                    <td className="px-3 py-3 text-right">{item.importedProducts}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(item.totalValue)}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {item.error || (item.warnings.length > 0 ? item.warnings.join("; ") : "Processado sem alertas")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
