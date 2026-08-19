/**
 * Módulo AgenticSeek — prospecção automatizada de licitações.
 *
 * Rota: /agenticseek (protegida, minRole "editor")
 * Consome: tRPC agenticSeek.* (server/routers/agenticSeekRouter.ts)
 * Funcionamento: o usuário descreve o objetivo (ex.: "indústrias de
 * manutenção em Betim com licitação aberta nos últimos 90 dias"), o backend
 * consulta a API oficial do PNCP, valida CNPJs, pontua relevância com IA,
 * consolida e exporta CSV. A execução roda em background e a tela faz
 * polling do status.
 */
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Bot, CheckCircle2, Download, ExternalLink, Loader2, Plus, Search, SendToBack, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  executando: "Executando…",
  concluida: "Concluída",
  erro: "Erro",
  cancelada: "Cancelada",
};

const STATUS_ICON: Record<string, React.ElementType> = {
  pendente: Loader2,
  executando: Loader2,
  concluida: CheckCircle2,
  erro: XCircle,
  cancelada: XCircle,
};

// Lista fechada de siglas de UF, para evitar valores inválidos na busca.
const UF_SIGLAS_LIST = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const MODALIDADES = [
  { id: 8, nome: "Pregão eletrônico" },
  { id: 6, nome: "Pregão presencial" },
  { id: 1, nome: "Leilão" },
  { id: 5, nome: "Concorrência" },
  { id: 13, nome: "Diálogo competitivo" },
];

type Resultado = {
  id: number;
  objeto: string;
  orgao: string;
  cnpjOrgao: string | null;
  uf: string | null;
  municipio: string | null;
  modalidade: string;
  dataPublicacao: string | null;
  dataAbertura: string | null;
  dataEncerramento: string | null;
  valorEstimado: string | null;
  link: string | null;
  score: number | null;
  justificativa: string | null;
  cnpjValido: boolean | null;
  cnpjNatureza: string | null;
  compativel: boolean | null;
  enviadoFunil: boolean;
  funilOportunidadeId: number | null;
};

function fmtBRL(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(d: string | null): string {
  if (!d) return "—";
  const iso = /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : d;
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function AgenticSeek() {
  const [objetivo, setObjetivo] = useState("");
  const [keywords, setKeywords] = useState("");
  const [uf, setUf] = useState<string>("MG");
  const [municipio, setMunicipio] = useState("Betim");
  const [diasAtras, setDiasAtras] = useState("60");
  const [modalidades, setModalidades] = useState<number[]>([8, 6]);
  const [buscaId, setBuscaId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [custo, setCusto] = useState<{ usd: number; brl: number } | null>(null);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enviandoId, setEnviandoId] = useState<number | null>(null);
  const [enviandoTudo, setEnviandoTudo] = useState(false);
  const utils = trpc.useUtils();
  const iniciarMutation = trpc.agenticSeek.iniciar.useMutation();
  const enviarMutation = trpc.agenticSeek.enviarParaFunil.useMutation({
    onSuccess: () => void utils.agenticSeek.resultados.invalidate(),
  });
  const statusQuery = trpc.agenticSeek.status.useQuery(
    { buscaId: buscaId ?? 0 },
    { enabled: buscaId != null && status === "executando", refetchInterval: 3000 }
  );
  const resultadosQuery = trpc.agenticSeek.resultados.useQuery(
    { buscaId: buscaId ?? 0 },
    { enabled: buscaId != null && (status === "concluida" || status === "erro") }
  );
  const csvQuery = trpc.agenticSeek.exportarCsv.useQuery(
    { buscaId: buscaId ?? 0 },
    { enabled: false }
  );

  // Sincroniza o status retornado pela query tRPC.
  useEffect(() => {
    const s = statusQuery.data?.status;
    if (s) setStatus(s);
    if (statusQuery.data?.erroMensagem) setErroMensagem(statusQuery.data.erroMensagem);
  }, [statusQuery.data]);

  useEffect(() => {
    const r = resultadosQuery.data;
    if (r) {
        setResultados((r.resultados ?? []).map((x: any) => ({ ...x, enviadoFunil: x.funilOportunidadeId != null })));
      setCusto(r.custo ? { usd: Number(r.custo.custoEstimadoUsd ?? 0), brl: Number(r.custo.custoEstimadoBrl ?? 0) } : null);
    }
  }, [resultadosQuery.data]);

  const iniciar = async () => {
    if (objetivo.trim().length < 10) return;
    setLoading(true);
    setErroMensagem(null);
    setResultados([]);
    setBuscaId(null);
    setStatus(null);
    setCusto(null);
    try {
      const r = await iniciarMutation.mutateAsync({
        objetivo: objetivo.trim(),
        keywords: keywords.trim() ? keywords.trim().split(",").map((k) => k.trim()) : [],
        uf,
        municipio,
        diasAtras: Number(diasAtras),
        modalidades,
      });
      setBuscaId(r.buscaId);
      setStatus("executando");
      void utils.agenticSeek.status.invalidate();
    } catch (e) {
      setErroMensagem(e instanceof Error ? e.message : "Falha ao iniciar a busca.");
    } finally {
      setLoading(false);
    }
  };

  const enviarParaFunil = async (id: number) => {
    if (!buscaId || enviandoTudo) return;
    setEnviandoId(id);
    try {
      await enviarMutation.mutateAsync({ buscaId, resultadoId: id });
    } finally {
      setEnviandoId(null);
    }
  };

  const enviarTodos = async () => {
    if (!buscaId || resultados.length === 0) return;
    const pendentes = resultados.filter((r) => !r.funilOportunidadeId).map((r) => r.id);
    if (pendentes.length === 0) return;
    setEnviandoTudo(true);
    try {
      // Envio sequencial, um a um, com feedback individual na tabela.
      for (const id of pendentes) {
        setEnviandoId(id);
        try {
          await enviarMutation.mutateAsync({ buscaId, resultadoId: id });
        } catch {
          // Segue para os demais; o item falho permanece sem marcar.
        }
        setEnviandoId(null);
      }
    } finally {
      setEnviandoTudo(false);
    }
  };

  const exportarCsv = async () => {
    if (!buscaId) return;
    const csv = await csvQuery.refetch().then((q) => q.data);
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agenticseek-busca-${buscaId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (status === "concluida" || status === "erro") {
      void resultadosQuery.refetch();
    }
  }, [status]);

  const StatusBadge = () => {
    if (!status) return null;
    const Icon = STATUS_ICON[status] ?? Loader2;
    const cores = {
      pendente: "text-slate-400",
      executando: "text-amber-500",
      concluida: "text-emerald-600",
      erro: "text-destructive",
      cancelada: "text-slate-500",
    }[status] ?? "text-slate-400";
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${cores}`}>
        <Icon className="h-4 w-4 animate-spin" />
        {STATUS_LABEL[status]}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Bot className="h-7 w-7 text-violet-600" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AgenticSeek</h1>
          <p className="text-sm text-muted-foreground">
            Prospecção automatizada de licitações: busca no PNCP, validação de
            CNPJ e pontuação de relevância com IA.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">Nova busca</CardTitle>
          <CardDescription>
            Descreva o objetivo em linguagem natural. Ex.: “fornecedores de
            material de construção em Betim que abriram licitação nos últimos
            60 dias”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="objetivo">Objetivo da prospecção *</Label>
            <Textarea
              id="objetivo"
              placeholder="Ex.: indústrias de manutenção predial em Betim/MG com licitação aberta nos últimos 90 dias"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="keywords">Palavras-chave extras (opcional)</Label>
              <Input
                id="keywords"
                placeholder="manutenção, obras, construção"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uf">UF</Label>
              <Select value={uf} onValueChange={setUf}>
                <SelectTrigger id="uf"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UF_SIGLAS_LIST.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="municipio">Município (opcional)</Label>
              <Input id="municipio" value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="Betim" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dias">Publicadas nos últimos (dias)</Label>
              <Select value={diasAtras} onValueChange={setDiasAtras}>
                <SelectTrigger id="dias"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="15">15 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="60">60 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modalidades</Label>
              <div className="flex flex-wrap gap-3 pt-1.5">
                {MODALIDADES.map((m) => (
                  <label key={m.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={modalidades.includes(m.id)}
                      onCheckedChange={(c) =>
                        setModalidades(
                          c
                            ? [...modalidades, m.id]
                            : modalidades.filter((x) => x !== m.id)
                        )
                      }
                    />
                    {m.nome}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <StatusBadge />
            <Button onClick={iniciar} disabled={loading || objetivo.trim().length < 10} size="sm">
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Iniciando…</>
              ) : (
                <><Search className="h-4 w-4" /> Iniciar busca</>
              )}
            </Button>
          </div>

          {erroMensagem && (
            <p className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {erroMensagem}
            </p>
          )}
        </CardContent>
      </Card>

      {buscaId != null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Resultados — busca #{buscaId}</CardTitle>
              <CardDescription>
                {status === "executando"
                  ? "Executando em background. Os resultados aparecem automaticamente ao concluir."
                  : status
                    ? STATUS_LABEL[status]
                    : "Aguardando…"}
                {custo && (
                  <span className="ml-3 text-xs text-muted-foreground">
                    Custo estimado IA: US$ {custo.usd.toFixed(4)} (~R$ {custo.brl.toFixed(2)})
                  </span>
                )}
              </CardDescription>
            </div>
            {status === "concluida" && resultados.length > 0 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={enviarTodos} disabled={enviandoTudo}>
                  {enviandoTudo ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendToBack className="h-4 w-4" />}
                  Enviar todos ao funil
                </Button>
                <Button variant="outline" size="sm" onClick={exportarCsv}>
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {status === "executando" && (
              <div className="space-y-3 py-4">
                <Progress value={40} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Consultando a API oficial do PNCP, validando CNPJs e pontuando
                  relevância com IA. Este processo pode levar alguns minutos.
                </p>
              </div>
            )}

            {status === "concluida" && resultados.length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma licitação foi encontrada com os critérios informados.
              </p>
            )}

            {status === "concluida" && resultados.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Score</TableHead>
                      <TableHead>Objeto</TableHead>
                      <TableHead>Órgão</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead>Abertura</TableHead>
                      <TableHead>Valor estimado</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead className="w-24 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultados.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <span className={r.score != null && r.score >= 70 ? "font-semibold text-emerald-600" : "text-muted-foreground"}>
                            {r.score ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate" title={r.objeto}>{r.objeto}</div>
                          {r.justificativa && (
                            <div className="mt-0.5 text-xs text-muted-foreground" title={r.justificativa}>
                              {r.justificativa.slice(0, 80)}…
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <div className="truncate" title={r.orgao}>{r.orgao}</div>
                        </TableCell>
                        <TableCell>{[r.municipio, r.uf].filter(Boolean).join(" / ") || "—"}</TableCell>
                        <TableCell>{fmtData(r.dataAbertura)}</TableCell>
                        <TableCell>{fmtBRL(r.valorEstimado)}</TableCell>
                        <TableCell>
                          <span className={r.cnpjValido === true ? "text-emerald-600" : r.cnpjValido === false ? "text-destructive" : "text-muted-foreground"}>
                            {r.cnpjOrgao ? r.cnpjValido === true ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" /> : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {r.link && (
                              <a href={r.link} target="_blank" rel="noopener noreferrer" title="Abrir no PNCP">
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </a>
                            )}
                            {!r.funilOportunidadeId && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Enviar ao funil de oportunidades"
                                disabled={enviandoId === r.id}
                                onClick={() => enviarParaFunil(r.id)}
                              >
                                {enviandoId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                              </Button>
                            )}
                            {r.funilOportunidadeId && (
                              <span title="Já enviada ao funil" className="text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {loading && buscaId == null && (
              <div className="space-y-2 py-4">
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
