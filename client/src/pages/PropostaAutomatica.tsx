import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  FileText,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Search,
  Zap,
  ClipboardList,
  Building2,
  Settings,
  ChevronRight,
  Package,
  Download,
  Save,
  Upload,
  X,
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type ResultadoExtracao = {
  processo: Record<string, string | null>;
  itens: any[];
  orientacoes: Record<string, string | null>;
  dadosFornecedor: Record<string, string | null>;
  declaracoes: string[];
  pendencias: string[];
};

type ResultadoCruzamento = {
  itemEdital: string;
  descricao: string;
  produtoSugerido: any | null;
  grauCorrespondencia: string;
  justificativa: string;
  candidatos: any[];
};

type ResultadoProposta = {
  cabecalho: any;
  itens: any[];
  condicoes: Record<string, string>;
  declaracoes: string[];
  pendencias: string[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const grauLabel: Record<string, { label: string; color: string; icon: any }> = {
  exata: { label: "Exata", color: "bg-green-100 text-green-800", icon: CheckCircle },
  equivalente_forte: { label: "Equivalente Forte", color: "bg-blue-100 text-blue-800", icon: CheckCircle },
  possivel: { label: "Possível", color: "bg-yellow-100 text-yellow-800", icon: AlertTriangle },
  sem_correspondencia: { label: "Sem Correspondência", color: "bg-red-100 text-red-800", icon: XCircle },
};

function GrauBadge({ grau }: { grau: string }) {
  const info = grauLabel[grau] || grauLabel.sem_correspondencia;
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${info.color}`}>
      <Icon className="w-3 h-3" />
      {info.label}
    </span>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function PropostaAutomatica() {
  // Entradas
  const [textoEdital, setTextoEdital] = useState("");
  const [textoOrientacoes, setTextoOrientacoes] = useState("");
  const [textoDadosFornecedor, setTextoDadosFornecedor] = useState("");
  const [margem, setMargem] = useState(20);

  // Upload de arquivo
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [arquivoBase64, setArquivoBase64] = useState<string | null>(null);
  const [arquivoMime, setArquivoMime] = useState<string | null>(null);

  // Resultados
  const [extracao, setExtracao] = useState<ResultadoExtracao | null>(null);
  const [cruzamento, setCruzamento] = useState<ResultadoCruzamento[] | null>(null);
  const [proposta, setProposta] = useState<ResultadoProposta | null>(null);

  // Preços editáveis por item (índice → valor string)
  const [precos, setPrecos] = useState<Record<number, string>>({});

  // Aba ativa
  const [aba, setAba] = useState("entrada");

  // Mutations
  const extrairMutation = trpc.editalAnalyzer.extrair.useMutation({
    onSuccess: (data) => {
      setExtracao(data as ResultadoExtracao);
      setCruzamento(null);
      setProposta(null);
      setAba("itens");
      toast.success(`Extração concluída: ${(data as any).itens?.length || 0} itens identificados.`);
    },
    onError: (e: any) => toast.error(`Erro na extração: ${e.message}`),
  });

  const cruzarMutation = trpc.editalAnalyzer.cruzarCatalogo.useMutation({
    onSuccess: (data) => {
      setCruzamento(data as ResultadoCruzamento[]);
      setAba("equivalencias");
      toast.success(`Cruzamento concluído: ${data.length} itens cruzados com o catálogo.`);
    },
    onError: (e: any) => toast.error(`Erro no cruzamento: ${e.message}`),
  });

  const [, navigate] = useLocation();

  const gerarMutation = trpc.editalAnalyzer.gerarProposta.useMutation({
    onSuccess: (data) => {
      setProposta(data as ResultadoProposta);
      setAba("proposta");
      toast.success("Proposta gerada. Revise os itens e exporte.");
    },
    onError: (e: any) => toast.error(`Erro ao gerar proposta: ${e.message}`),
  });

  const gerarPDFMutation = trpc.editalAnalyzer.gerarPDF.useMutation({
    onSuccess: (data) => {
      // Converter base64 para Blob e fazer download
      const byteChars = atob(data.pdfBase64);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
      const byteArr = new Uint8Array(byteNums);
      const blob = new Blob([byteArr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposta_automatica_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado e baixado com sucesso!");
    },
    onError: (e: any) => toast.error(`Erro ao gerar PDF: ${e.message}`),
  });

  const salvarPropostaMutation = trpc.editalAnalyzer.salvarComoPropostaComercial.useMutation({
    onSuccess: (data) => {
      toast.success(`Proposta salva! ID #${data.proposalId}. Redirecionando...`);
      setTimeout(() => navigate(`/propostas`), 1500);
    },
    onError: (e: any) => toast.error(`Erro ao salvar proposta: ${e.message}`),
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      setArquivoBase64(base64);
      setArquivoNome(file.name);
      setArquivoMime(file.type);
      toast.success(`Arquivo "${file.name}" carregado. Clique em Extrair para processar.`);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoverArquivo = () => {
    setArquivoBase64(null);
    setArquivoNome(null);
    setArquivoMime(null);
  };

  const handleExtrair = () => {
    if (!textoEdital.trim() && !textoOrientacoes.trim() && !textoDadosFornecedor.trim() && !arquivoBase64) {
      toast.warning("Cole pelo menos um dos campos de texto ou carregue um arquivo PDF/DOCX.");
      return;
    }
    extrairMutation.mutate({
      textoEdital,
      textoOrientacoes,
      textoDadosFornecedor,
      fileBase64: arquivoBase64 || undefined,
      fileName: arquivoNome || undefined,
      mimeType: arquivoMime || undefined,
    });
  };

  const handleCruzar = () => {
    if (!extracao?.itens?.length) return;
    cruzarMutation.mutate({
      itens: extracao.itens.map((i) => ({
        item: i.item,
        descricaoPadronizada: i.descricaoPadronizada,
        especificacaoTecnica: i.especificacaoTecnica,
      })),
    });
  };

  const handleGerarProposta = () => {
    if (!extracao) return;
    gerarMutation.mutate({
      processo: extracao.processo,
      itens: extracao.itens,
      equivalencias: cruzamento || [],
      orientacoes: extracao.orientacoes,
      dadosFornecedor: extracao.dadosFornecedor,
      declaracoes: extracao.declaracoes,
      configuracao: { margem, validadeProposta: "30 dias", prazoEntrega: "A combinar" },
    });
  };

  const handleGerarPDF = () => {
    if (!proposta) return;
    // Mesclar preços editados nos itens
    const itensComPreco = proposta.itens.map((item: any, idx: number) => ({
      ...item,
      precoUnitario: precos[idx] !== undefined ? precos[idx] : item.precoUnitario,
    }));
    gerarPDFMutation.mutate({
      cabecalho: proposta.cabecalho,
      itens: itensComPreco,
      condicoes: proposta.condicoes,
      declaracoes: proposta.declaracoes,
      pendencias: proposta.pendencias,
    });
  };

  const handleSalvarProposta = () => {
    if (!proposta) return;
    const itensComPreco = proposta.itens.map((item: any, idx: number) => ({
      ...item,
      precoUnitario: precos[idx] !== undefined ? precos[idx] : item.precoUnitario,
    }));
    salvarPropostaMutation.mutate({
      cabecalho: proposta.cabecalho,
      itens: itensComPreco,
      condicoes: proposta.condicoes,
      declaracoes: proposta.declaracoes,
    });
  };

  const handleExportarTexto = () => {
    if (!proposta) return;
    const linhas: string[] = [];
    linhas.push("PROPOSTA COMERCIAL");
    linhas.push("=".repeat(60));
    const f = proposta.cabecalho.fornecedor;
    if (f?.razaoSocial) linhas.push(`Empresa: ${f.razaoSocial}`);
    if (f?.cnpj) linhas.push(`CNPJ: ${f.cnpj}`);
    if (f?.responsavel) linhas.push(`Responsável: ${f.responsavel}`);
    linhas.push(`Data: ${proposta.cabecalho.data}`);
    linhas.push("");
    const p = proposta.cabecalho.processo;
    if (p?.numero) linhas.push(`Processo: ${p.numero}`);
    if (p?.orgao) linhas.push(`Órgão: ${p.orgao}`);
    if (p?.objeto) linhas.push(`Objeto: ${p.objeto}`);
    linhas.push("");
    linhas.push("ITENS DA PROPOSTA");
    linhas.push("-".repeat(60));
    proposta.itens.forEach((item: any) => {
      linhas.push(`Item ${item.item}: ${item.descricao}`);
      linhas.push(`  Qtd: ${item.quantidade} ${item.unidade} | Marca: ${item.marca}`);
      if (item.pendente) linhas.push(`  ⚠ PENDENTE: produto não localizado no catálogo`);
    });
    linhas.push("");
    linhas.push("CONDIÇÕES COMERCIAIS");
    linhas.push("-".repeat(60));
    Object.entries(proposta.condicoes).forEach(([k, v]) => linhas.push(`${k}: ${v}`));
    linhas.push("");
    linhas.push("DECLARAÇÕES");
    linhas.push("-".repeat(60));
    proposta.declaracoes.forEach((d) => linhas.push(`• ${d}`));
    if (proposta.pendencias.length > 0) {
      linhas.push("");
      linhas.push("⚠ PENDÊNCIAS PARA REVISÃO MANUAL");
      proposta.pendencias.forEach((p) => linhas.push(`• ${p}`));
    }

    const blob = new Blob([linhas.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposta_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="container py-6 max-w-5xl">
      {/* Cabeçalho */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-primary/10">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Proposta Automática</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Cole o edital, orientações e dados do fornecedor. A IA extrai os itens, cruza com o catálogo e monta a proposta.
        </p>
      </div>

      {/* Indicador de progresso */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {[
          { id: "entrada", label: "1. Entrada", icon: FileText },
          { id: "itens", label: "2. Itens", icon: ClipboardList },
          { id: "equivalencias", label: "3. Equivalências", icon: Search },
          { id: "proposta", label: "4. Proposta", icon: Building2 },
        ].map((step, idx, arr) => {
          const Icon = step.icon;
          const ativo = aba === step.id;
          const concluido =
            (step.id === "itens" && !!extracao) ||
            (step.id === "equivalencias" && !!cruzamento) ||
            (step.id === "proposta" && !!proposta);
          return (
            <div key={step.id} className="flex items-center gap-2">
              <button
                onClick={() => setAba(step.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  ativo
                    ? "bg-primary text-primary-foreground"
                    : concluido
                    ? "bg-green-100 text-green-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {step.label}
              </button>
              {idx < arr.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="hidden">
          <TabsTrigger value="entrada">Entrada</TabsTrigger>
          <TabsTrigger value="itens">Itens</TabsTrigger>
          <TabsTrigger value="equivalencias">Equivalências</TabsTrigger>
          <TabsTrigger value="proposta">Proposta</TabsTrigger>
        </TabsList>

        {/* ─── ABA 1: ENTRADA ─────────────────────────────────────────────── */}
        <TabsContent value="entrada" className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {/* Upload de Arquivo */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Importar Arquivo (PDF ou DOCX)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {arquivoNome ? (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">{arquivoNome}</span>
                      <span className="text-xs text-green-600">Pronto para extrair</span>
                    </div>
                    <button onClick={handleRemoverArquivo} className="text-red-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-primary/30 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors">
                    <Upload className="w-6 h-6 text-primary/50 mb-1" />
                    <span className="text-sm text-muted-foreground">Arraste ou clique para selecionar PDF ou DOCX</span>
                    <input type="file" accept=".pdf,.docx" className="hidden" onChange={handleArquivo} />
                  </label>
                )}
              </CardContent>
            </Card>

            {/* Bloco A */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Bloco A — Edital / Itens (texto, opcional se usar arquivo)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Cole aqui o conteúdo do edital, os itens, o termo de referência ou qualquer trecho com os produtos solicitados..."
                  className="min-h-[120px] text-sm font-mono"
                  value={textoEdital}
                  onChange={(e) => setTextoEdital(e.target.value)}
                />
              </CardContent>
            </Card>

            {/* Bloco B */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-500" />
                  Bloco B — Orientações da Proposta (opcional)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Cole aqui prazos, regras de envio, declarações obrigatórias, condições de pagamento, local de entrega..."
                  className="min-h-[100px] text-sm font-mono"
                  value={textoOrientacoes}
                  onChange={(e) => setTextoOrientacoes(e.target.value)}
                />
              </CardContent>
            </Card>

            {/* Bloco C */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-green-500" />
                  Bloco C — Dados do Fornecedor (opcional)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Cole aqui razão social, CNPJ, endereço, responsável, dados bancários, condições comerciais..."
                  className="min-h-[100px] text-sm font-mono"
                  value={textoDadosFornecedor}
                  onChange={(e) => setTextoDadosFornecedor(e.target.value)}
                />
              </CardContent>
            </Card>

            {/* Configuração */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4 text-orange-500" />
                  Bloco D — Configuração Comercial
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Margem (%)</Label>
                    <Input
                      type="number"
                      value={margem}
                      onChange={(e) => setMargem(Number(e.target.value))}
                      className="w-20 h-8 text-sm"
                      min={0}
                      max={100}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Button
            onClick={handleExtrair}
            disabled={extrairMutation.isPending}
            size="lg"
            className="w-full"
          >
            {extrairMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Extraindo com IA...</>
            ) : (
              <><Zap className="w-4 h-4 mr-2" /> Extrair Itens com IA</>
            )}
          </Button>
        </TabsContent>

        {/* ─── ABA 2: ITENS EXTRAÍDOS ─────────────────────────────────────── */}
        <TabsContent value="itens" className="space-y-4">
          {!extracao ? (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma extração realizada. Volte à aba Entrada e cole o conteúdo.</p>
            </div>
          ) : (
            <>
              {/* Resumo do processo */}
              {Object.values(extracao.processo).some(Boolean) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Processo Identificado</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(extracao.processo).map(([k, v]) =>
                      v ? (
                        <div key={k}>
                          <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}: </span>
                          <span className="font-medium">{v}</span>
                        </div>
                      ) : null
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Pendências */}
              {extracao.pendencias.length > 0 && (
                <Card className="border-yellow-200 bg-yellow-50">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800 mb-1">Pendências para revisão manual:</p>
                        <ul className="text-xs text-yellow-700 space-y-0.5">
                          {extracao.pendencias.map((p, i) => <li key={i}>• {p}</li>)}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tabela de itens */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      {extracao.itens.length} Itens Extraídos
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Item</th>
                          <th className="text-left px-3 py-2 font-medium">Descrição Padronizada</th>
                          <th className="text-left px-3 py-2 font-medium">Qtd</th>
                          <th className="text-left px-3 py-2 font-medium">Un</th>
                          <th className="text-left px-3 py-2 font-medium">Equivalência</th>
                          <th className="text-left px-3 py-2 font-medium">Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extracao.itens.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t hover:bg-muted/20">
                            <td className="px-3 py-2 font-mono text-xs">{item.item}</td>
                            <td className="px-3 py-2 max-w-xs">
                              <p className="font-medium">{item.descricaoPadronizada}</p>
                              {item.especificacaoTecnica && (
                                <p className="text-xs text-muted-foreground mt-0.5">{item.especificacaoTecnica}</p>
                              )}
                            </td>
                            <td className="px-3 py-2">{item.quantidade}</td>
                            <td className="px-3 py-2">{item.unidade}</td>
                            <td className="px-3 py-2">
                              <Badge variant={item.equivalenciaPermitida === "sim" ? "default" : item.equivalenciaPermitida === "nao" ? "destructive" : "secondary"} className="text-xs">
                                {item.equivalenciaPermitida}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground max-w-[150px] truncate">{item.observacoes || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Button
                onClick={handleCruzar}
                disabled={cruzarMutation.isPending}
                size="lg"
                className="w-full"
              >
                {cruzarMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cruzando com catálogo...</>
                ) : (
                  <><Search className="w-4 h-4 mr-2" /> Cruzar com Catálogo Interno</>
                )}
              </Button>
            </>
          )}
        </TabsContent>

        {/* ─── ABA 3: EQUIVALÊNCIAS ───────────────────────────────────────── */}
        <TabsContent value="equivalencias" className="space-y-4">
          {!cruzamento ? (
            <div className="text-center py-16 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum cruzamento realizado. Extraia os itens primeiro.</p>
            </div>
          ) : (
            <>
              {/* Resumo */}
              <div className="grid grid-cols-4 gap-3">
                {(["exata", "equivalente_forte", "possivel", "sem_correspondencia"] as const).map((grau) => {
                  const count = cruzamento.filter((c) => c.grauCorrespondencia === grau).length;
                  const info = grauLabel[grau];
                  return (
                    <Card key={grau} className="text-center">
                      <CardContent className="pt-4 pb-3">
                        <p className="text-2xl font-bold">{count}</p>
                        <p className={`text-xs mt-1 px-2 py-0.5 rounded ${info.color}`}>{info.label}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Lista */}
              <div className="space-y-3">
                {cruzamento.map((item, idx) => (
                  <Card key={idx}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">Item {item.itemEdital}</span>
                            <GrauBadge grau={item.grauCorrespondencia} />
                          </div>
                          <p className="text-sm font-medium">{item.descricao}</p>
                          <p className="text-xs text-muted-foreground mt-1">{item.justificativa}</p>
                        </div>
                        {item.produtoSugerido && (
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground">Sugerido</p>
                            <p className="text-sm font-medium text-primary">{item.produtoSugerido.name}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button
                onClick={handleGerarProposta}
                disabled={gerarMutation.isPending}
                size="lg"
                className="w-full"
              >
                {gerarMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando proposta...</>
                ) : (
                  <><FileText className="w-4 h-4 mr-2" /> Gerar Proposta Comercial</>
                )}
              </Button>
            </>
          )}
        </TabsContent>

        {/* ─── ABA 4: PROPOSTA FINAL ──────────────────────────────────────── */}
        <TabsContent value="proposta" className="space-y-4">
          {!proposta ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma proposta gerada. Complete as etapas anteriores.</p>
            </div>
          ) : (
            <>
              {/* Pendências */}
              {proposta.pendencias.length > 0 && (
                <Card className="border-yellow-200 bg-yellow-50">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800 mb-1">Itens pendentes de revisão manual:</p>
                        <ul className="text-xs text-yellow-700 space-y-0.5">
                          {proposta.pendencias.map((p, i) => <li key={i}>• {p}</li>)}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Cabeçalho */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">Cabeçalho da Proposta</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  {proposta.cabecalho.fornecedor?.razaoSocial && (
                    <div><span className="text-muted-foreground">Empresa: </span><span className="font-medium">{proposta.cabecalho.fornecedor.razaoSocial}</span></div>
                  )}
                  {proposta.cabecalho.fornecedor?.cnpj && (
                    <div><span className="text-muted-foreground">CNPJ: </span><span className="font-medium">{proposta.cabecalho.fornecedor.cnpj}</span></div>
                  )}
                  {proposta.cabecalho.processo?.numero && (
                    <div><span className="text-muted-foreground">Processo: </span><span className="font-medium">{proposta.cabecalho.processo.numero}</span></div>
                  )}
                  {proposta.cabecalho.processo?.orgao && (
                    <div><span className="text-muted-foreground">Órgão: </span><span className="font-medium">{proposta.cabecalho.processo.orgao}</span></div>
                  )}
                  <div><span className="text-muted-foreground">Data: </span><span className="font-medium">{proposta.cabecalho.data}</span></div>
                </CardContent>
              </Card>

              {/* Tabela de itens */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Tabela de Itens</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Item</th>
                          <th className="text-left px-3 py-2 font-medium">Descrição</th>
                          <th className="text-left px-3 py-2 font-medium">Qtd</th>
                          <th className="text-left px-3 py-2 font-medium">Un</th>
                          <th className="text-left px-3 py-2 font-medium">Marca</th>
                          <th className="text-right px-3 py-2 font-medium">Vl. Unit.</th>
                          <th className="text-right px-3 py-2 font-medium">Total</th>
                          <th className="text-left px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const totalGeral = proposta.itens.reduce((acc: number, item: any, idx: number) => {
                            const p = parseFloat(precos[idx] || "0") || 0;
                            const q = parseInt(item.quantidade) || 1;
                            return acc + p * q;
                          }, 0);
                          return (
                            <>
                              {proposta.itens.map((item: any, idx: number) => {
                                const preco = precos[idx] ?? "";
                                const total = preco ? (parseFloat(preco) * (parseInt(item.quantidade) || 1)).toFixed(2) : null;
                                return (
                          <tr key={idx} className={`border-t hover:bg-muted/20 ${item.pendente ? "bg-yellow-50" : ""}`}>
                            <td className="px-3 py-2 font-mono text-xs">{item.item}</td>
                            <td className="px-3 py-2 max-w-xs text-xs">{item.descricao}</td>
                            <td className="px-3 py-2">{item.quantidade}</td>
                            <td className="px-3 py-2">{item.unidade}</td>
                            <td className="px-3 py-2 text-xs">{item.marca}</td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0,00"
                                value={preco}
                                onChange={(e) => setPrecos((prev) => ({ ...prev, [idx]: e.target.value }))}
                                className="h-7 w-24 text-xs text-right"
                              />
                            </td>
                            <td className="px-3 py-2 text-xs font-medium text-right">
                              {total ? `R$ ${parseFloat(total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {item.pendente ? (
                                <Badge variant="secondary" className="text-xs">Pendente</Badge>
                              ) : (
                                <GrauBadge grau={item.grauEquivalencia} />
                              )}
                            </td>
                          </tr>
                                );
                              })}
                              <tr className="border-t-2 bg-muted/30 font-semibold">
                                <td colSpan={5} className="px-3 py-2 text-sm text-right">Total Geral:</td>
                                <td className="px-3 py-2 text-sm text-right" colSpan={2}>
                                  {totalGeral > 0 ? `R$ ${totalGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                                </td>
                              </tr>
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Condições */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Condições Comerciais</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(proposta.condicoes).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}: </span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Declarações */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Declarações</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-sm">
                    {proposta.declaracoes.map((d, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={handleGerarPDF}
                  disabled={gerarPDFMutation.isPending}
                  className="col-span-2"
                >
                  {gerarPDFMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando PDF...</>
                  ) : (
                    <><Download className="w-4 h-4 mr-2" /> Exportar PDF Profissional</>
                  )}
                </Button>
                <Button
                  onClick={handleSalvarProposta}
                  disabled={salvarPropostaMutation.isPending}
                  variant="outline"
                >
                  {salvarPropostaMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" /> Salvar como Proposta Comercial</>
                  )}
                </Button>
                <Button onClick={handleExportarTexto} variant="outline">
                  <FileText className="w-4 h-4 mr-2" />
                  Exportar TXT
                </Button>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setAba("entrada");
                    setExtracao(null);
                    setCruzamento(null);
                    setProposta(null);
                    setTextoEdital("");
                    setTextoOrientacoes("");
                    setTextoDadosFornecedor("");
                  }}
                  variant="ghost"
                  className="w-full text-muted-foreground"
                >
                  Nova Proposta
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
