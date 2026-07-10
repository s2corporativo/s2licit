import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface PriceRow {
  productName: string;
  productCode?: string;
  ean?: string;
  price: number;
  unit?: string;
  notes?: string;
}

interface PreviewRow {
  index: number;
  productName: string;
  productCode?: string;
  ean?: string;
  price: number;
  status: "matched" | "new" | "conflict";
  matchedProductId?: number;
  matchedProductName?: string;
  currentPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  notes?: string;
}

export function PriceImportComponent() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<"upload" | "preview" | "confirm">("upload");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const detectSupplier = trpc.priceImport.detectSupplier.useQuery(
    { fileName: file?.name || "" },
    { enabled: !!file }
  );

  const extractPrices = trpc.priceImport.extractPrices.useMutation();
  const previewMutation = trpc.priceImport.previewPriceImport.useMutation();
  const importMutation = trpc.priceImport.importPrices.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setRows([]);
    setPreview([]);
    setStep("upload");
    setMessage(null);

    // Parse file
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const lines = content.split("\n");
        const data = lines.map((line) =>
          line.split(",").map((cell) => cell.trim())
        );

        const result = await extractPrices.mutateAsync({ data });
        if (result.success) {
          setRows(result.rows);
          setMessage({
            type: "success",
            text: `${result.rowCount} linhas extraídas da planilha`,
          });
        }
      } catch (error) {
        setMessage({
          type: "error",
          text: "Falha ao processar arquivo",
        });
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleDetectSupplier = async () => {
    if (!detectSupplier.data) return;

    setSupplierId(detectSupplier.data.supplierId);
    setMessage({
      type: "success",
      text: `Fornecedor detectado: ${detectSupplier.data.supplierName} (${detectSupplier.data.confidence})`,
    });
  };

  const handlePreview = async () => {
    if (!supplierId || rows.length === 0) {
      setMessage({
        type: "error",
        text: "Selecione um fornecedor e carregue dados",
      });
      return;
    }

    try {
      const result = await previewMutation.mutateAsync({
        rows,
        supplierId,
      });

      setPreview(result.rows);
      setStep("preview");

      setMessage({
        type: "success",
        text: `${result.matchedProducts} produtos encontrados, ${result.newProducts} novos`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: "Falha ao gerar preview",
      });
    }
  };

  const handleSelectAll = () => {
    if (selectedIndexes.size === preview.length) {
      setSelectedIndexes(new Set());
    } else {
      setSelectedIndexes(new Set(preview.map((_, i) => i)));
    }
  };

  const handleSelectRow = (index: number) => {
    const newSet = new Set(selectedIndexes);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedIndexes(newSet);
  };

  const handleImport = async () => {
    if (selectedIndexes.size === 0) {
      setMessage({
        type: "error",
        text: "Selecione pelo menos um produto",
      });
      return;
    }

    try {
      const result = await importMutation.mutateAsync({
        rows,
        supplierId: supplierId!,
        selectedIndexes: Array.from(selectedIndexes),
      });

      if (result.success) {
        setMessage({
          type: "success",
          text: `${result.imported} preços importados com sucesso`,
        });
        setStep("upload");
        setFile(null);
        setRows([]);
        setPreview([]);
        setSelectedIndexes(new Set());
      } else {
        setMessage({
          type: "error",
          text: `${result.failed} erros durante importação`,
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "Falha ao importar preços",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Message Display */}
      {message && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 ${
            message.type === "success"
              ? "bg-green-50 border border-green-200"
              : "bg-red-50 border border-red-200"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          )}
          <p
            className={`text-sm ${
              message.type === "success" ? "text-green-800" : "text-red-800"
            }`}
          >
            {message.text}
          </p>
        </div>
      )}

      {step === "upload" && (
        <Card className="p-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Importar Planilha de Preços</h3>

            {/* File Upload */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
                id="price-file-input"
              />
              <label
                htmlFor="price-file-input"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="w-8 h-8 text-gray-400" />
                <span className="text-sm font-medium">
                  Clique para selecionar ou arraste um arquivo
                </span>
                <span className="text-xs text-gray-500">
                  CSV, XLSX ou XLS (máx. 10MB)
                </span>
              </label>
            </div>

            {file && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium">{file.name}</span>
              </div>
            )}

            {/* Supplier Detection */}
            {rows.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Fornecedor Detectado</h4>
                {detectSupplier.data ? (
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div>
                      <p className="font-medium">{detectSupplier.data.supplierName}</p>
                      <p className="text-xs text-gray-600">
                        Confiança: {detectSupplier.data.confidence}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleDetectSupplier}
                      disabled={!detectSupplier.data}
                    >
                      Confirmar
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">
                    Não foi possível detectar o fornecedor automaticamente
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={handlePreview}
                disabled={rows.length === 0 || !supplierId}
                className="flex-1"
              >
                Gerar Preview
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === "preview" && preview.length > 0 && (
        <Card className="p-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Preview de Importação</h3>

            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-gray-600">Total</p>
                <p className="text-2xl font-bold">{preview.length}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-gray-600">Encontrados</p>
                <p className="text-2xl font-bold">
                  {preview.filter((p) => p.status === "matched").length}
                </p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <p className="text-xs text-gray-600">Novos</p>
                <p className="text-2xl font-bold">
                  {preview.filter((p) => p.status === "new").length}
                </p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-xs text-gray-600">Conflitos</p>
                <p className="text-2xl font-bold">
                  {preview.filter((p) => p.status === "conflict").length}
                </p>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIndexes.size === preview.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">Produto</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Preço Atual</th>
                    <th className="px-3 py-2 text-right">Novo Preço</th>
                    <th className="px-3 py-2 text-right">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.index} className="border-b">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIndexes.has(row.index)}
                          onChange={() => handleSelectRow(row.index)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div>
                          <p className="font-medium">{row.productName}</p>
                          {row.matchedProductName && (
                            <p className="text-xs text-gray-600">
                              Encontrado: {row.matchedProductName}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {row.status === "matched" && (
                            <>
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <span>Encontrado</span>
                            </>
                          )}
                          {row.status === "new" && (
                            <>
                              <AlertCircle className="w-4 h-4 text-yellow-600" />
                              <span>Novo</span>
                            </>
                          )}
                          {row.status === "conflict" && (
                            <>
                              <XCircle className="w-4 h-4 text-red-600" />
                              <span>Conflito</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.currentPrice ? `R$ ${row.currentPrice.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        R$ {row.price.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.priceChangePercent ? (
                          <span
                            className={
                              row.priceChangePercent > 0
                                ? "text-red-600"
                                : "text-green-600"
                            }
                          >
                            {row.priceChangePercent > 0 ? "+" : ""}
                            {row.priceChangePercent.toFixed(1)}%
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Voltar
              </Button>
              <Button
                onClick={handleImport}
                disabled={selectedIndexes.size === 0}
                className="flex-1"
              >
                Importar {selectedIndexes.size > 0 ? `(${selectedIndexes.size})` : ""}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
