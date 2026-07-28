import AvisoIA from "@/components/AvisoIA";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  FileText,
  Globe2,
  Loader2,
  LockKeyhole,
  Play,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

type PortalType =
  | "copasa"
  | "cemig"
  | "fundep"
  | "funarbe"
  | "comprasmg"
  | "fiemg";

type Modo = "salvar_rascunho" | "enviar_direto";

const TARGET_PORTALS: PortalType[] = [
  "copasa",
  "cemig",
  "fundep",
  "funarbe",
  "comprasmg",
  "fiemg",
];

const STATUS_LABELS: Record<string, string> = {
  running: "Executando",
  done: "Concluído",
  error: "Erro",
  aguardando_aprovacao: "Aguardando aprovação",
  not_found: "Não encontrado",
};

export default function AgenteProposta() {
  const [jobId, setJobId] = useState<string | null>(null);
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

  const { data: portais = [] } = trpc.propostaAgent.portaisDisponiveis.useQuery();
  const { data: propostas = [] } = trpc.proposals.list.useQuery();
  const { data: credenciais = [] } = trpc.portalCredentials.list.useQuery();
  const { data: historico = [], refetch: refetchHistorico } =
    trpc.propostaAgent.historicoJobs.useQuery();
  const { data: statusJob } = trpc.propostaAgent.status.useQuery(
    { jobId: jobId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: !!jobId, refetchInterval: jobId ? 2500 : false },
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
      }>).filter((credencial) => credencial.portal === form.portalType),
    [credenciais, form.portalType],
  );

  const portalAtual = portaisOperacionais.find(
    (portal) => portal.tipo === form.portalType,
  );
  const status = statusJob?.status ?? "not_found";
  const resultado = statusJob?.resultado;
  const executando = status === "running";

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
      toast.success("Agente iniciado.");
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

  function executar() {
    const propostaId = Number(form.propostaId);
    const validadeDias = Number(form.validadeDias);
    const credencialId = Number(form.credencialId);
    const usaCofre = Number.isInteger(credencialId) && credencialId > 0;

    if (!Number.isInteger(propostaId) || propostaId <= 0) {
      toast.error("Selecione uma proposta S2.");
      return;
    }
    if (!Number.isFinite(validadeDias) || validadeDias < 1 || validadeDias > 365) {
      toast.error("Informe uma validade entre 1 e 365 dias.");
      return;
    }
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

      <header className="mb-6 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center bg-gray-950">
          <Bot className="h-6 w-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900">
            Agente de Propostas — Seis Portais S2
          </h1>
          <p className="text-sm text-gray-500">
            COPASA, CEMIG, Fundep, Funarbe, Compras MG e FIEMG/SESI/SENAI.
          </p>
        </div>
      </header>

      <div className="mb-6 flex gap-3 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <ShieldCheck className="h-5 w-5 shrink-0" />
        <p>
          O agente pré-preenche a proposta, mas não contorna CAPTCHA, 2FA,
          convite ou autenticação. O envio final permanece sujeito à aprovação
          humana.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <section className="border border-gray-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 font-bold">
              <FileText className="h-4 w-4" /> Proposta e portal
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Proposta S2">
                <select
                  value={form.propostaId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, propostaId: event.target.value }))
                  }
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
              </Field>

              <Field label="Portal">
                <select
                  value={form.portalType}
                  onChange={(event) => alterarPortal(event.target.value as PortalType)}
                  className="w-full border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {portaisOperacionais.map((portal) => (
                    <option key={portal.tipo} value={portal.tipo}>
                      {portal.nome}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {portalAtual && (
              <p className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                <Globe2 className="h-3.5 w-3.5" /> {portalAtual.loginUrl}
              </p>
            )}

            <Field label="URL direta da oportunidade" className="mt-4">
              <input
                type="url"
                value={form.urlLicitacao}
                onChange={(event) =>
                  setForm((current) => ({ ...current, urlLicitacao: event.target.value }))
                }
                placeholder="https://..."
                className="w-full border border-gray-300 px-3 py-2 text-sm"
              />
            </Field>
          </section>

          <section className="border border-gray-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 font-bold">
              <LockKeyhole className="h-4 w-4" /> Credencial
            </h2>
            <Field label="Cofre de credenciais">
              <select
                value={form.credencialId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, credencialId: event.target.value }))
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
            </Field>

            {!form.credencialId && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <TextInput
                  label="Usuário ou e-mail"
                  value={form.usuario}
                  onChange={(usuario) => setForm((current) => ({ ...current, usuario }))}
                />
                <TextInput
                  label="Senha"
                  type="password"
                  value={form.senha}
                  onChange={(senha) => setForm((current) => ({ ...current, senha }))}
                />
                <TextInput
                  label="CNPJ"
                  value={form.cnpj}
                  onChange={(cnpj) => setForm((current) => ({ ...current, cnpj }))}
                />
                <TextInput
                  label="CPF, quando exigido"
                  value={form.cpf}
                  onChange={(cpf) => setForm((current) => ({ ...current, cpf }))}
                />
              </div>
            )}
          </section>

          <section className="border border-gray-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Modo">
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
                  <option value="enviar_direto">Enviar após validações</option>
                </select>
              </Field>
              <TextInput
                label="Validade em dias"
                type="number"
                value={form.validadeDias}
                onChange={(validadeDias) =>
                  setForm((current) => ({ ...current, validadeDias }))
                }
              />
            </div>

            {form.modoAprovacao === "enviar_direto" && (
              <div className="mt-4 flex gap-2 border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Confirme produto, unidade, estoque, frete, tributos e preço antes
                de utilizar este modo.
              </div>
            )}

            <button
              type="button"
              onClick={executar}
              disabled={iniciar.isPending || executando}
              className="mt-5 flex w-full items-center justify-center gap-2 bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {iniciar.isPending || executando ? (
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
              <h2 className="font-bold">Execução atual</h2>
              <span className="bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                {STATUS_LABELS[status] ?? status}
              </span>
            </div>

            {!jobId ? (
              <p className="py-10 text-center text-sm text-gray-400">
                Nenhuma execução iniciada nesta sessão.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Metric label="Tentados" value={resultado?.itensTentados ?? 0} />
                  <Metric label="Preenchidos" value={resultado?.itensPreenchidos ?? 0} />
                  <Metric label="Erros" value={resultado?.itensComErro ?? 0} />
                </div>
                <div className="max-h-80 overflow-y-auto bg-gray-950 p-4 font-mono text-xs text-gray-300">
                  {(resultado?.log ?? []).length > 0
                    ? (resultado?.log ?? []).map((line: string, index: number) => (
                        <div key={`${index}-${line}`}>{line}</div>
                      ))
                    : "Aguardando eventos..."}
                </div>
                {(resultado?.erros ?? []).map((error: string, index: number) => (
                  <div
                    key={`${index}-${error}`}
                    className="border border-red-200 bg-red-50 p-3 text-xs text-red-800"
                  >
                    {error}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="border border-gray-200 bg-white p-5">
            <h2 className="mb-4 font-bold">Execuções recentes</h2>
            <div className="space-y-2">
              {(historico as Array<any>).slice(0, 8).map((job) => (
                <div key={job.jobId} className="border border-gray-100 p-3 text-sm">
                  <div className="font-semibold">
                    {job.processo || "Processo não identificado"}
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-gray-500">
                    <span>{new Date(job.criadoEm).toLocaleString("pt-BR")}</span>
                    <span>{job.itensPreenchidos}/{job.itensTentados} itens</span>
                  </div>
                </div>
              ))}
              {(historico as Array<any>).length === 0 && (
                <p className="text-sm text-gray-400">Nenhuma execução registrada.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-gray-300 px-3 py-2 text-sm"
      />
    </Field>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 p-3">
      <div className="text-xl font-black">{value}</div>
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
    </div>
  );
}
