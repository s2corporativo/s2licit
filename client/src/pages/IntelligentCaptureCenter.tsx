import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, Bot, BrainCircuit, CheckCircle2, Code2, FileCode2, FileSpreadsheet, FileText, Globe, Layers3, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

const sourceLabels: Record<string, string> = {
  url: "Site / página",
  html: "HTML",
  pdf: "PDF",
  spreadsheet: "Planilha / CSV",
  xml: "XML",
  docx: "DOCX",
  image: "Imagem (OCR)",
  text: "Texto estruturado",
};

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export default function IntelligentCaptureCenter() {
  const utils = trpc.useUtils();
  const batchesQuery = trpc.intelligentCapture.listBatches.useQuery({ limit: 20 });
  const batches = batchesQuery.data ?? [];

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteMode, setWebsiteMode] = useState<"product" | "catalog">("product");
  const [structuredType, setStructuredType] = useState<"xml" | "html" | "text">("xml");
  const [structuredLabel, setStructuredLabel] = useState("");
  const [structuredContent, setStructuredContent] = useState("");
  const [documentFileName, setDocumentFileName] = useState("");
  const [spreadsheetFileName, setSpreadsheetFileName] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"success" | "error">("success");

  const sourceSummary = useMemo(() => {
    const summary = new Map<string, number>();
    for (const batch of batches as any[]) {
      const key = batch.sourceType ?? "text";
      summary.set(key, (summary.get(key) ?? 0) + Number(batch.totalCaptured ?? 0));
    }
    return Array.from(summary.entries()).map(([sourceType, total]) => ({ sourceType, total }));
  }, [batches]);

  const dashboardCards = useMemo(() => [
    {
      title: "Lotes capturados",
      value: String(batches.length),
      helper: "Execuções já registradas",
      icon: Layers3,
    },
    {
      title: "Produtos capturados",
      value: String((batches as any[]).reduce((acc, item) => acc + Number(item.totalCaptured ?? 0), 0)),
      helper: "Itens aguardando revisão e aproveitamento",
      icon: Bot,
    },
    {
      title: "Fontes ativas",
      value: String(sourceSummary.length),
      helper: "Tipos de origem já utilizados",
      icon: Globe,
    },
    {
      title: "Em revisão",
      value: String((batches as any[]).filter((item) => item.status === "review").length),
      helper: "Lotes dependentes de validação humana",
      icon: FileText,
    },
  ], [batches, sourceSummary.length]);

  const handleError = (error: unknown) => {
    setStatusTone("error");
    setStatusMessage(error instanceof Error ? error.message : "Falha ao processar a captura inteligente.");
  };

  const handleSuccess = async (message: string) => {
    setStatusTone("success");
    setStatusMessage(message);
    await utils.intelligentCapture.listBatches.invalidate();
  };

  const formatMatchingSummary = (summary?: {
    totalMatched?: number | null;
    confirmed?: number | null;
    probable?: number | null;
    possible?: number | null;
  } | null) => {
    if (!summary || !summary.totalMatched) {
      return " Nenhuma correspondência automática confiável foi sugerida neste lote.";
    }

    return ` Correspondência automática sugerida para ${summary.totalMatched} item(ns): ${summary.confirmed ?? 0} confirmada(s), ${summary.probable ?? 0} provável(is) e ${summary.possible ?? 0} possível(is).`;
  };

  const ingestWebsite = trpc.intelligentCapture.ingestWebsite.useMutation({
    onSuccess: async (result) => {
      if ("error" in result) {
        setStatusTone("error");
        setStatusMessage(result.error);
        return;
      }
      await handleSuccess(`Captura concluída com sucesso. Lote #${result.batchId} criado com ${result.totalCaptured} item(ns).${formatMatchingSummary(result.matchingSummary)}`);
      setWebsiteUrl("");
    },
    onError: handleError,
  });

  const ingestDocument = trpc.intelligentCapture.ingestDocument.useMutation({
    onSuccess: async (result) => {
      if ("error" in result) {
        setStatusTone("error");
        setStatusMessage(result.error);
        return;
      }
      await handleSuccess(`Documento processado com sucesso. Lote #${result.batchId} criado com ${result.totalCaptured} item(ns).${formatMatchingSummary(result.matchingSummary)}`);
      setDocumentFileName("");
    },
    onError: handleError,
  });

  const ingestSpreadsheet = trpc.intelligentCapture.ingestSpreadsheet.useMutation({
    onSuccess: async (result) => {
      if ("error" in result) {
        setStatusTone("error");
        setStatusMessage(result.error);
        return;
      }
      await handleSuccess(`Planilha processada com sucesso. Lote #${result.batchId} criado com ${result.totalCaptured} item(ns).${formatMatchingSummary(result.matchingSummary)}`);
      setSpreadsheetFileName("");
    },
    onError: handleError,
  });

  const ingestStructured = trpc.intelligentCapture.ingestStructured.useMutation({
    onSuccess: async (result) => {
      if ("error" in result) {
        setStatusTone("error");
        setStatusMessage(result.error);
        return;
      }
      await handleSuccess(`Conteúdo estruturado processado com sucesso. Lote #${result.batchId} criado com ${result.totalCaptured} item(ns).${formatMatchingSummary(result.matchingSummary)}`);
      setStructuredContent("");
      setStructuredLabel("");
    },
    onError: handleError,
  });

  const pendingMutation = ingestWebsite.isPending || ingestDocument.isPending || ingestSpreadsheet.isPending || ingestStructured.isPending;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="container py-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Captura Inteligente</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Ingestão multi-origem de produtos para revisão operacional</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                O módulo agora recebe entradas de <strong>sites e páginas de produto</strong>, <strong>PDF/DOCX</strong>, <strong>planilhas/CSV</strong>, <strong>XML</strong> e <strong>texto estruturado</strong>, sempre gerando lote auditável antes da aplicação no catálogo.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/captura-revisao" className="inline-flex items-center gap-2 border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                Revisão operacional
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/produtos" className="inline-flex items-center gap-2 bg-[#1A3F8F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#15357A]">
                Ir para catálogo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container space-y-8 py-8">
        {statusMessage ? (
          <div className={`rounded-none border px-4 py-3 text-sm ${statusTone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            <div className="flex items-start gap-2">
              {statusTone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertTriangle className="mt-0.5 h-4 w-4" />}
              <span>{statusMessage}</span>
            </div>
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboardCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="rounded-none border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{card.title}</p>
                    <p className="mt-3 text-2xl font-bold text-slate-900">{card.value}</p>
                    <p className="mt-2 text-sm text-slate-600">{card.helper}</p>
                  </div>
                  <div className="bg-blue-50 p-3 text-[#1A3F8F]">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <Card className="rounded-none border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <BrainCircuit className="h-5 w-5 text-[#1A3F8F]" />
              Entradas operacionais
            </CardTitle>
            <CardDescription>
              Escolha o canal de origem, envie o conteúdo e gere um lote automaticamente para conferência na tela de revisão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="site" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                <TabsTrigger value="site">Sites</TabsTrigger>
                <TabsTrigger value="documento">PDF / DOCX</TabsTrigger>
                <TabsTrigger value="planilha">Planilha / CSV</TabsTrigger>
                <TabsTrigger value="xml">XML / HTML</TabsTrigger>
                <TabsTrigger value="texto">Texto</TabsTrigger>
              </TabsList>

              <TabsContent value="site" className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4 border border-slate-200 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="site-url">URL para captura</Label>
                    <Input id="site-url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://fornecedor.com.br/produto ou catálogo" />
                  </div>
                  <div className="space-y-2">
                    <Label>Modo de captura</Label>
                    <Select value={websiteMode} onValueChange={(value) => setWebsiteMode(value as "product" | "catalog") }>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o modo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product">Página única de produto</SelectItem>
                        <SelectItem value="catalog">Catálogo ou listagem</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button disabled={!websiteUrl || pendingMutation} onClick={() => ingestWebsite.mutate({ url: websiteUrl, mode: websiteMode, maxItems: websiteMode === "catalog" ? 15 : 1 })} className="gap-2">
                    <Globe className="h-4 w-4" />
                    Capturar site
                  </Button>
                </div>
                <div className="border border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-600">
                  <p><strong>Produto:</strong> indicado para URL unitária.</p>
                  <p><strong>Catálogo:</strong> indicado para listagens, com limite conservador de itens por execução.</p>
                  <p>Os resultados entram no fluxo de revisão sem gravação direta no catálogo.</p>
                </div>
              </TabsContent>

              <TabsContent value="documento" className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4 border border-slate-200 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="document-upload">Arquivo PDF, DOCX ou imagem (OCR)</Label>
                    <Input
                      id="document-upload"
                      type="file"
                      accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,image/gif"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setDocumentFileName(file.name);
                        const fileBase64 = await fileToBase64(file);
                        const lower = file.name.toLowerCase();
                        const isImage = /\.(png|jpe?g|webp|gif)$/.test(lower) || (file.type || "").startsWith("image/");
                        const sourceType = lower.endsWith(".docx") ? "docx" : isImage ? "image" : "pdf";
                        const fallbackMime =
                          sourceType === "docx"
                            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            : sourceType === "image"
                              ? "image/png"
                              : "application/pdf";
                        ingestDocument.mutate({
                          fileBase64,
                          fileName: file.name,
                          mimeType: file.type || fallbackMime,
                          sourceType,
                        });
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                  <p className="text-sm text-slate-600">Arquivo selecionado: {documentFileName || "nenhum"}</p>
                </div>
                <div className="border border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-600">
                  <p>Preferir documentos com tabelas ou listagens organizadas por produto, descrição, fabricante, EAN, apresentação e preço.</p>
                  <p>O backend converte o arquivo em texto, identifica linhas úteis e cria candidatos para revisão.</p>
                </div>
              </TabsContent>

              <TabsContent value="planilha" className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4 border border-slate-200 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="spreadsheet-upload">Arquivo CSV, XLS ou XLSX</Label>
                    <Input
                      id="spreadsheet-upload"
                      type="file"
                      accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setSpreadsheetFileName(file.name);
                        const fileBase64 = await fileToBase64(file);
                        ingestSpreadsheet.mutate({
                          fileBase64,
                          fileName: file.name,
                          mimeType: file.type || "application/octet-stream",
                        });
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                  <p className="text-sm text-slate-600">Arquivo selecionado: {spreadsheetFileName || "nenhum"}</p>
                </div>
                <div className="border border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-600">
                  <p>Colunas usuais reconhecidas: nome, descrição, marca, fabricante, SKU, EAN, GTIN, unidade, categoria, preço, imagem e URL.</p>
                  <p>O primeiro cabeçalho válido é aproveitado automaticamente para mapear os itens.</p>
                </div>
              </TabsContent>

              <TabsContent value="xml" className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4 border border-slate-200 p-4">
                  <div className="space-y-2">
                    <Label>Tipo do conteúdo</Label>
                    <Select value={structuredType} onValueChange={(value) => setStructuredType(value as "xml" | "html" | "text") }>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="xml">XML</SelectItem>
                        <SelectItem value="html">HTML</SelectItem>
                        <SelectItem value="text">Texto estruturado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="structured-label">Rótulo da origem</Label>
                    <Input id="structured-label" value={structuredLabel} onChange={(event) => setStructuredLabel(event.target.value)} placeholder="Ex.: NF-e 983, catálogo abril, layout fornecedor" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="structured-content">Conteúdo</Label>
                    <Textarea id="structured-content" value={structuredContent} onChange={(event) => setStructuredContent(event.target.value)} className="min-h-[260px] font-mono text-xs" placeholder="Cole aqui o XML, HTML ou outro conteúdo estruturado" />
                  </div>
                  <Button disabled={!structuredContent || pendingMutation} onClick={() => ingestStructured.mutate({ sourceType: structuredType, content: structuredContent, sourceLabel: structuredLabel || undefined })} className="gap-2">
                    <Code2 className="h-4 w-4" />
                    Processar conteúdo
                  </Button>
                </div>
                <div className="border border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-600">
                  <p>Pode colar o arquivo exatamente como recebeu: o sistema limpa automaticamente caracteres invisíveis e texto solto antes de ler o conteúdo.</p>
                  <p>Para NF-e, o número real da nota é identificado e guardado no histórico da importação.</p>
                </div>
              </TabsContent>

              <TabsContent value="texto" className="space-y-4 border border-slate-200 p-4">
                <div className="space-y-2">
                  <Label htmlFor="plain-text">Texto estruturado</Label>
                  <Textarea
                    id="plain-text"
                    value={structuredContent}
                    onChange={(event) => {
                      setStructuredType("text");
                      setStructuredContent(event.target.value);
                    }}
                    className="min-h-[260px] font-mono text-xs"
                    placeholder={"nome;ean;preço\nProduto A;7890000000001;12,50\nProduto B;7890000000002;18,90"}
                  />
                </div>
                <Button disabled={!structuredContent || pendingMutation} onClick={() => ingestStructured.mutate({ sourceType: "text", content: structuredContent, sourceLabel: structuredLabel || "Texto estruturado" })} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Capturar texto estruturado
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <div className="rounded-none border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Lotes recentes</h2>
              <p className="mt-1 text-sm text-slate-600">Capturas já processadas, de todas as origens. Aprove os itens em Revisão de capturas.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Origem</th>
                    <th className="px-6 py-3">Referência</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Itens</th>
                    <th className="px-6 py-3">Atualização</th>
                  </tr>
                </thead>
                <tbody>
                  {batchesQuery.isLoading ? (
                    <tr>
                      <td className="px-6 py-8 text-slate-500" colSpan={5}>Carregando lotes...</td>
                    </tr>
                  ) : batches.length === 0 ? (
                    <tr>
                      <td className="px-6 py-8 text-slate-500" colSpan={5}>Nenhum lote de captura inteligente foi registrado até o momento.</td>
                    </tr>
                  ) : (
                    (batches as any[]).map((batch) => (
                      <tr key={batch.id} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-medium text-slate-900">{sourceLabels[batch.sourceType] ?? batch.sourceType}</td>
                        <td className="px-6 py-4 text-slate-700">{batch.sourceLabel ?? batch.sourceReference ?? "Sem referência"}</td>
                        <td className="px-6 py-4 capitalize text-slate-700">{batch.status}</td>
                        <td className="px-6 py-4 text-slate-700">{batch.totalCaptured ?? batch.totalItems ?? 0}</td>
                        <td className="px-6 py-4 text-slate-700">{formatDate(batch.updatedAt ?? batch.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-none border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Canais operantes</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-700">
                <div className="border border-slate-200 p-3"><Globe className="mb-2 h-4 w-4 text-[#1A3F8F]" />Sites e páginas de produto</div>
                <div className="border border-slate-200 p-3"><FileText className="mb-2 h-4 w-4 text-[#1A3F8F]" />PDF e DOCX</div>
                <div className="border border-slate-200 p-3"><FileSpreadsheet className="mb-2 h-4 w-4 text-[#1A3F8F]" />Planilhas e CSV</div>
                <div className="border border-slate-200 p-3"><FileCode2 className="mb-2 h-4 w-4 text-[#1A3F8F]" />XML e texto estruturado</div>
              </div>
            </div>

            <div className="rounded-none border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Resumo por origem</h2>
              <div className="mt-4 space-y-3">
                {sourceSummary.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhuma origem registrada ainda.</p>
                ) : (
                  sourceSummary.map((item) => (
                    <div key={item.sourceType} className="flex items-center justify-between border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <span>{sourceLabels[item.sourceType] ?? item.sourceType}</span>
                      <strong>{item.total}</strong>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
