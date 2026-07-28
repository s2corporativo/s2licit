import { trpc } from "@/lib/trpc";
import AvisoIA from "@/components/AvisoIA";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  ImageIcon,
  Loader2,
  LockKeyhole,
  Play,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";

type PortalType =
  | "copasa"
  | "cemig"
  | "fundep"
  | "funarbe"
  | "comprasmg"
  | "fiemg";

type Modo = "salvar_rascunho" | "enviar_direto";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  running: { label: "Executando", className: "bg-blue-50 text-blue-700" },
  done: { label: "Concluído", className: "bg-emerald-50 text-emerald-700" },
  error: { label: "Erro", className: "bg-red-50 text-red-700" },
  aguardando_aprovacao: {
    label: "Aguardando aprovação",
    className: "bg-amber-50 text-amber-700",
  },
  not_found: { label: "Não encontrado", className: "bg-gray-50 text-gray-500" },
};

const TARGET_PORTALS: PortalType[] = [
  "copasa",
  "cemig",
  "fundep",
  "funarbe",
  "comprasmg",
  "fiemg",
];

export default function AgenteProposta() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showScreenshots, setShowScreenshots] = useState(false);
  const [form, setForm] = useState({
    propostaId: "",
    portalType: "fundep" as PortalType,
    credencialId: "",
    usuario: "",
    senha: "",
    cpf: "",
    cnpj: "",
    urlLicitacao: "",
    modoAprovacao: "salvar_rascunho" as Modo,
    validadeDias: "60",
  });

  const { data: portais = [], isLoading: loadingPortais } =
    trpc.propostaAgent.portaisDisponiveis.useQuery();
  const { data: propostas = [], isLoading: loadingPropostas } =
    trpc.proposals.list.useQuery();
  const { data: credenciais = [] } = trpc.portalCredentials.list.useQuery();
  const { data: historico = [], refetch: refetchHistorico } =
    trpc.propostaAgent.historicoJobs.useQuery();

  const { data: statusJob, refetch: refetchStatus } =
    trpc.propostaAgent.status.useQuery(
      { jobId: jobId ?? "00000000-0000-0000-0000-000000000000" },
      { enabled: !!jobId, refetchInterval: jobId ? 2500 : false },
    );

  const { data: screenshots } = trpc.propostaAgent.screenshots.useQuery(
    { jobId: jobId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: !!jobId && showScreenshots },
  );

  const portaisOperacionais = useMemo(
    () =>
      (portais as Array<{ tipo: PortalType; nome: string; loginUrl: string }>).filter(
        (portal) => TARGET_PORTALS.includes(portal.tipo),
      ),
    [portais],
  );

  const credenciaisDoPortal = useMemo(
    () =>
      (credenciais as Array<{
        id: number;
        portal: string;
        apelido?: string | null;
        usuario: string;
        nomePortal?: string;
      }>).filter((credencial) => credencial.portal === form.portalType),
    [credenciais, form.portalType],
  );

  const portalAtual = portaisOperacionais.find(
    (portal) => portal.tipo === form.portalType,
  );
  const resultado = statusJob?.resultado;
  const status = statusJob?.status ?? "not_found";
  const statusVisual = STATUS_LABEL[status] ?? STATUS_LABEL.not_found;
  const isRunning = status === "running";

  useEffect(() => {
    if (["done", "error", "aguardando_aprovacao"].includes(status)) {
      void refetchHistorico();
    }
  }, [status, refetchHistorico]);

  useEffect(() => {
    if (
      portaisOperacionais.length > 0 &&
      !portaisOperacionais.some((portal) => portal.tipo === form.portalType)
    ) {
      setForm((current) => ({
        ...current,
        portalType: portaisOperacionais[0].tipo,
        credencialId: "",
      }));
    }
  }, [form.portalType, portaisOperacionais]);

  const iniciar = trpc.propostaAgent.iniciar.useMutation({
    onSuccess: ({ jobId: createdJobId }) => {
      setJobId(createdJobId);
      toast.success("Agente iniciado. Acompanhe a execução abaixo.");
    },
    onError: (error) => toast.error(error.message),
  });

  function alterarPortal(portalType: PortalType) {
    setForm((current) => ({
      ...current,
      portalType,
      credencialId: "",
      usuario: "",
      senha: "",
      cpf: "",
      cnpj: "",
    }));
  }

  function iniciarAgente() {
    const propostaId = Number(form.propostaId);
    if (!Number.isInteger(propostaId) || propostaId <= 0) {
      toast.error("Selecione uma proposta S2.");
      return;
    }

    const validadeDias = Number(form.validadeDias);
    if (!Number.isFinite(validadeDias) || validadeDias < 1 || validadeDias > 365) {
      toast.error("Informe uma validade entre 1 e 365 dias.");
      return;
    }

    const credencialId = Number(form.credencialId);
    const usaCofre = Number.isInteger(credencialId) && credencialId > 0;
    if (!usaCofre && (!form.usuario.trim() || form.senha.length < 4)) {
      toast.error("Selecione uma credencial do cofre ou informe usuário e senha.");
      return;
    }

    iniciar.mutate({
      propostaId,
      portalType: form.portalType,
      credencialId: usaCofre ? credencialId : undefined,
      credencial: usaCofre
        ? undefined
        : {
            email: form.usuario.trim(),
            password: form.senha,
            cpf: form.cpf.trim() || undefined,
            cnpj: form.cnpj.trim() || undefined,
          },
      urlLicitacao: form.urlLicitacao.trim() || undefined,
      modoAprovacao: form.modoAprovacao,
      validadeDias,
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <AvisoIA />

      <div className="mb-7 flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-950 shadow-lg">
          <Zap className="h-6 w-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">
            Agente de Propostas — Seis Portais S2
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            COPASA, CEMIG, Fundep, Funarbe, Compras MG e FIEMG/SESI/SENAI.
          </p>
        </div>
      </div>

      <div className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>Operação assistida:</strong> o agente pode localizar e
            pré-preencher campos, mas não contorna CAPTCHA, 2FA, convite ou
            controle de acesso. O envio final permanece sujeito à confirmação
            humana.
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <section className="border border-gray-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-gray-900">
              <FileText className="h-4 w-4" /> Proposta e portal
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-600">Proposta S2</span>
                <select
                  value={form.propostaId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      propostaId: event.target.value,
                    }))
                  }
                  disabled={loadingPropostas}
                  className="w-full border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {(propostas as Array<any>).map((proposta) => (
                    <option key={proposta.id} value={proposta.id}>
                      #{proposta.id} — {proposta.title}
                      {proposta.processNumber ? ` (${proposta.processNumber})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-600">Portal</span>
                <select
                  value={form.portalType}
                  onChange={(event) => alterarPortal(event.target.value as PortalType)}
                  disabled={loadingPortais}
                  className="w-full border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {portaisOperacionais.map((portal) => (
                    <option key={portal.tipo} value={portal.tipo}>
                      {portal.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {portalAtual && (
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                <Globe2 className="h-3.5 w-3.5" />
                {portalAtual.loginUrl}
              </div>
            )}

            <label className="mt-4 block space-y-1">
              <span className="text-xs font-semibold text-gray-600">
                URL direta da oportunidade
              </span>
              <input
                type="url"
                value={form.urlLicitacao}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    urlLicitacao: event.target.value,
                  }))
                }
                placeholder="https://..."
                className="w-full border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </section>

          <section className="border border-gray-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-gray-900">
              <LockKeyhole className="h-4 w-4" /> Credencial
            </h2>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-gray-600">
                Cofre de credenciais
              </span>
              <select
                value={form.credencialId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    credencialId: event.target.value,
                  }))
                }
                className="w-full border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Informar nesta execução</option>
                {credenciaisDoPortal.map((credencial) => (
                  <option key={credencial.id} value={credencial.id}>
                    {credencial.apelido || credencial.usuario}
                  </option>
                ))}
              </select>
            </label>

            {!form.credencialId && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-600">
                    Usuário ou e-mail
                  </span>
                  <input
                    value={form.usuario}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        usuario: event.target.value,
                      }))
                    }
                    autoComplete="username"
                    className="w-full border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-600">Senha</span>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.senha}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          senha: event.target.value,
                        }))
                      }
                      autoComplete="current-password"
                      className="w-full border border-gray-300 px-3 py-2 pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-2 top-2 text-gray-400"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-600">CNPJ</span>
                  <input
                    value={form.cnpj}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cnpj: event.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold text-gray-600">CPF, quando exigido</span>
                  <input
                    value={form.cpf}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        cpf: event.target.value,
                      }))
                    }
                    className="w-full border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}
          </section>

          <section className="border border-gray-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-gray-900">
              <Bot className="h-4 w-4" /> Execução
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-600">Modo</span>
                <select
                  value={form.modoAprovacao}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      modoAprovacao: event.target.value as Modo,
                    }))
                  }
                  className="w-full border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="salvar_rascunho">Preparar e aguardar aprovação</option>
                  <option value="enviar_direto">Enviar após validações do agente</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold text-gray-600">
                  Validade da proposta
                </span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.validadeDias}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      validadeDias: event.target.value,
                    }))
                  }
                  className="w-full border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {form.modoAprovacao === "enviar_direto" && (
              <div className="mt-4 flex gap-2 border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Use envio direto somente após revisar produto, unidade, estoque,
                frete, tributos e preço final.
              </div>
            )}

            <button
              type="button"
              onClick={iniciarAgente}
              disabled={iniciar.isPending || isRunning}
              className="mt-5 flex w-full items-center justify-center gap-2 bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {iniciar.isPending || isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Iniciar agente
            </button>
          </section>
        </div>

        <div className="space-y-5">
          <section className="border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-bold text-gray-900">Execução atual</h2>
              <span className={`px-2 py-1 text-xs font-semibold ${statusVisual.className}`}>
                {statusVisual.label}
              </span>
            </div>

            {!jobId ? (
              <div className="py-10 text-center text-sm text-gray-400">
                Nenhuma execução iniciada nesta sessão.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Metric label="Tentados" value={resultado?.itensTentados ?? 0} />
                  <Metric label="Preenchidos" value={resultado?.itensPreenchidos ?? 0} />
                  <Metric label="Com erro" value={resultado?.itensComErro ?? 0} />
                </div>

                <div className="max-h-72 overflow-y-auto bg-gray-950 p-4 font-mono text-xs">
                  {(resultado?.log ?? []).length === 0 ? (
                    <div className="text-gray-500">
                      {isRunning ? "Aguardando novos eventos..." : "Sem registro de execução."}
                    </div>
                  ) : (
                    (resultado?.log ?? []).map((line: string, index: number) => (
                      <div
                        key={`${index}-${line}`}
                        className={
                          line.includes("ERRO") || line.includes("❌")
                            ? "text-red-400"
                            : line.includes("✅")
                              ? "text-emerald-400"
                              : "text-gray-300"
                        }
                      >
                        {line}
                      </div>
                    ))
                  )}
                </div>

                {(resultado?.erros ?? []).length > 0 && (
                  <div className="space-y-2 border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    {(resultado?.erros ?? []).map((error: string, index: number) => (
                      <div key={`${index}-${error}`} className="flex gap-2">
                        <XCircle className="h-4 w-4 shrink-0" /> {error}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void refetchStatus()}
                    className="border border-gray-300 px-3 py-2 text-xs font-semibold"
                  >
                    Atualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowScreenshots((current) => !current)}
                    className="flex items-center gap-2 border border-gray-300 px-3 py-2 text-xs font-semibold"
                  >
                    <ImageIcon className="h-4 w-4" /> Evidências
                  </button>
                </div>

                {showScreenshots && (screenshots?.screenshots ?? []).length > 0 && (
                  <div className="grid gap-3">
                    {(screenshots?.screenshots ?? []).map((image: string, index: number) => (
                      <img
                        key={index}
                        src={`data:image/png;base64,${image}`}
                        alt={`Evidência ${index + 1}`}
                        className="w-full border border-gray-200"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="border border-gray-200 bg-white p-5">
            <h2 className="mb-4 font-bold text-gray-900">Execuções recentes</h2>
            {(historico as Array<any>).length === 0 ? (
              <div className="text-sm text-gray-400">Nenhuma execução registrada.</div>
            ) : (
              <div className="space-y-2">
                {(historico as Array<any>).slice(0, 8).map((job) => {
                  const visual = STATUS_LABEL[job.status] ?? STATUS_LABEL.not_found;
                  return (
                    <div key={job.jobId} className="border border-gray-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-gray-800">
                            {job.processo || "Processo não identificado"}
                          </div>
                          <div className="mt-1 text-xs text-gray-400">
                            {new Date(job.criadoEm).toLocaleString("pt-BR")}
                          </div>
                        </div>
                        <span className={`px-2 py-1 text-[10px] font-semibold ${visual.className}`}>
                          {visual.label}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                        <span>{job.itensPreenchidos}/{job.itensTentados} itens</span>
                        <span>
                          R$ {Number(job.totalProposta ?? 0).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-gray-100 bg-gray-50 p-3 text-center">
      <div className="text-xl font-black text-gray-900">{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </div>
    </div>
  );
}
