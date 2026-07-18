import { trpc } from "@/lib/trpc";
import { AlertTriangle } from "lucide-react";
import { Link } from "wouter";

/**
 * Aviso preventivo exibido nas telas que dependem de IA: em vez de o usuário
 * clicar em "Analisar com IA" e só então receber um erro técnico, ele fica
 * sabendo antes que o recurso está indisponível e o que fazer a respeito.
 * Não renderiza nada quando há provedor configurado.
 */
export default function AvisoIA() {
  const { data } = trpc.ai.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  if (!data || data.algumConfigurado) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <strong>A inteligência artificial não está configurada neste servidor.</strong>{" "}
        Os recursos desta tela que usam IA não vão funcionar até que um administrador
        configure a chave do provedor (veja{" "}
        <Link href="/central-ia" className="font-semibold underline">
          Inteligência artificial
        </Link>
        {" "}ou peça ao responsável técnico). O restante do sistema funciona normalmente.
      </div>
    </div>
  );
}
