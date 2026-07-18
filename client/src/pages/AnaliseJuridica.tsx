import { useRef, useState } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { toast } from "sonner";
import AvisoIA from "@/components/AvisoIA";
import {
  Scale,
  UploadCloud,
  Loader2,
  FileText,
  AlertTriangle,
  CalendarClock,
  ShieldCheck,
  Gavel,
  Lightbulb,
} from "lucide-react";

type Analise = RouterOutputs["legalAnalysis"]["analisar"];

const GRAVIDADE_STYLE: Record<string, string> = {
  alta: "bg-red-50 text-red-700 border-red-200",
  media: "bg-amber-50 text-amber-700 border-amber-200",
  baixa: "bg-slate-50 text-slate-600 border-slate-200",
};

export default function AnaliseJuridica() {
  const [resultado, setResultado] = useState<Analise | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const analisar = trpc.legalAnalysis.analisar.useMutation({
    onSuccess: (res) => setResultado(res),
    onError: (e) => toast.error("Não foi possível analisar o documento.", { description: e.message }),
  });

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setResultado(null);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    analisar.mutate({ fileBase64: base64, fileName: file.name, mimeType: file.type || "application/pdf" });
  };

  const a = resultado?.analise;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Scale className="w-7 h-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Análise jurídica com IA</h1>
          <p className="text-sm text-gray-500">
            A IA reconhece o tipo do documento e o lê como um advogado especialista em licitações e
            contratos públicos.
          </p>
        </div>
      </div>

      <AvisoIA />

      {/* Upload */}
      <div
        className="mt-4 border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-300 transition-colors cursor-pointer"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        {analisar.isPending ? (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Loader2 className="w-7 h-7 animate-spin" />
            <div className="text-sm font-medium">Lendo e analisando o documento…</div>
            <div className="text-xs text-gray-400">{fileName}</div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <UploadCloud className="w-7 h-7 text-blue-500" />
            <div className="text-sm font-semibold text-gray-700">
              Solte um edital, contrato, ata ou notificação aqui
            </div>
            <div className="text-xs text-gray-400">PDF, DOCX ou TXT — o texto fica no servidor apenas para a análise.</div>
          </div>
        )}
      </div>

      {resultado && a && (
        <div className="mt-6 space-y-5">
          {/* Classificação */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-gray-900">{resultado.classificacao.tipoLabel}</span>
              </div>
              <span className="text-[11px] text-gray-400">
                Confiança {Math.round(resultado.classificacao.confianca * 100)}%
                {resultado.truncado && " · documento longo (analisado o início)"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{resultado.classificacao.justificativa}</p>
          </div>

          {/* Resumo executivo */}
          <Section icon={<FileText className="w-4 h-4" />} title="Resumo executivo">
            <p className="text-sm text-gray-700 whitespace-pre-line">{a.resumoExecutivo}</p>
            {a.objeto && (
              <p className="text-sm text-gray-600 mt-2">
                <span className="font-semibold">Objeto:</span> {a.objeto}
              </p>
            )}
            {a.partes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {a.partes.map((p, i) => (
                  <span key={i} className="text-[11px] bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 text-slate-600">
                    <span className="font-semibold">{p.papel}:</span> {p.nome}
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* Riscos jurídicos */}
          {a.riscosJuridicos.length > 0 && (
            <Section icon={<AlertTriangle className="w-4 h-4" />} title="Riscos jurídicos">
              <ul className="space-y-2">
                {a.riscosJuridicos.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${GRAVIDADE_STYLE[r.gravidade] ?? GRAVIDADE_STYLE.baixa}`}>
                      {r.gravidade}
                    </span>
                    <div className="text-sm">
                      <div className="text-gray-800 font-medium">{r.risco}</div>
                      <div className="text-xs text-gray-500">{r.fundamento}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Prazos críticos */}
          {a.prazosCriticos.length > 0 && (
            <Section icon={<CalendarClock className="w-4 h-4" />} title="Prazos críticos">
              <ul className="space-y-1">
                {a.prazosCriticos.map((p, i) => (
                  <li key={i} className="text-sm text-gray-700 flex justify-between gap-3 border-b border-gray-50 py-1">
                    <span>{p.descricao}</span>
                    <span className="font-semibold text-gray-900 whitespace-nowrap">{p.prazo}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Habilitação */}
          {(a.requisitosHabilitacao.juridica.length +
            a.requisitosHabilitacao.fiscalTrabalhista.length +
            a.requisitosHabilitacao.tecnica.length +
            a.requisitosHabilitacao.economicoFinanceira.length) > 0 && (
            <Section icon={<ShieldCheck className="w-4 h-4" />} title="Requisitos de habilitação">
              <div className="grid md:grid-cols-2 gap-4">
                <HabBloco titulo="Jurídica" itens={a.requisitosHabilitacao.juridica} />
                <HabBloco titulo="Fiscal e trabalhista" itens={a.requisitosHabilitacao.fiscalTrabalhista} />
                <HabBloco titulo="Técnica" itens={a.requisitosHabilitacao.tecnica} />
                <HabBloco titulo="Econômico-financeira" itens={a.requisitosHabilitacao.economicoFinanceira} />
              </div>
            </Section>
          )}

          {/* Cláusulas de atenção */}
          {a.clausulasAtencao.length > 0 && (
            <Section icon={<AlertTriangle className="w-4 h-4" />} title="Cláusulas de atenção">
              <ul className="space-y-2">
                {a.clausulasAtencao.map((c, i) => (
                  <li key={i} className="text-sm border-l-2 border-amber-300 pl-3">
                    <div className="text-gray-800">{c.trecho}</div>
                    <div className="text-xs text-amber-700">{c.motivo}</div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Penalidades e garantias */}
          {a.penalidadesEGarantias.length > 0 && (
            <Section icon={<ShieldCheck className="w-4 h-4" />} title="Penalidades e garantias">
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                {a.penalidadesEGarantias.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </Section>
          )}

          {/* Impugnabilidade */}
          <Section icon={<Gavel className="w-4 h-4" />} title="Impugnação / questionamento">
            <div className="text-sm">
              <span className={`font-semibold ${a.impugnabilidade.cabivel ? "text-red-700" : "text-emerald-700"}`}>
                {a.impugnabilidade.cabivel ? "Há fundamentos para impugnar/questionar" : "Sem fundamento evidente para impugnação"}
              </span>
              {a.impugnabilidade.prazo && (
                <span className="text-gray-500"> · prazo: {a.impugnabilidade.prazo}</span>
              )}
            </div>
            {a.impugnabilidade.fundamentos.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-gray-700 mt-2 space-y-1">
                {a.impugnabilidade.fundamentos.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            )}
          </Section>

          {/* Recomendações */}
          {a.recomendacoes.length > 0 && (
            <Section icon={<Lightbulb className="w-4 h-4" />} title="Recomendações">
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
                {a.recomendacoes.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Section>
          )}

          <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
            Análise gerada por IA como apoio à decisão — não substitui a revisão de um advogado antes de
            protocolar peças ou assinar contratos.
          </p>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3 text-gray-700">
        <span className="text-blue-600">{icon}</span>
        <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function HabBloco({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1">{titulo}</div>
      <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
        {itens.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
