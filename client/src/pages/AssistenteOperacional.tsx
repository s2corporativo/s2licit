import { useMemo, useState } from "react";
import { Brain, Loader2, Send, ShieldCheck, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Quais oportunidades exigem ação hoje?",
  "Mostre os maiores riscos do pipeline atual.",
  "Quais oportunidades estão prontas para proposta?",
  "Revise meus prazos críticos e diga a ordem de prioridade.",
];

export default function AssistenteOperacional() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const parsed = Number(params.get("oportunidade"));
  const opportunityId = Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  const chat = trpc.licitacaoAgent.chat.useMutation({
    onSuccess: (result) => {
      setMessages((current) => [...current, { role: "assistant", content: result.content }]);
    },
  });

  const send = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || chat.isPending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    chat.mutate({ opportunityId, messages: next.slice(-20) });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <section className="rounded-2xl bg-blue-950 p-5 text-white">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/10 p-3"><Brain size={24} /></div>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">IA especializada</p>
            <h1 className="mb-1 mt-1 text-2xl font-black">Assistente Operacional S2</h1>
            <p className="m-0 text-sm text-blue-100">Consulta dados reais do sistema e raciocina sobre entrada, análise, proposta, execução, catálogo, prazos e riscos.</p>
            {opportunityId && <div className="mt-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold">Contexto fixado: oportunidade #{opportunityId}</div>}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Info icon={<ShieldCheck size={16} />} title="Sem invenção" text="A IA é instruída a separar fato do sistema, inferência e recomendação." />
        <Info icon={<Sparkles size={16} />} title="Operacional" text="Prioriza prazo, equivalência, preço, documentação e próxima ação do fluxo canônico." />
      </section>

      <section className="min-h-[430px] rounded-xl border border-slate-200 bg-white p-4">
        {messages.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <Brain size={28} className="text-slate-300" />
            <h2 className="mt-3 text-base font-black text-slate-800">O que você quer verificar?</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">A resposta pode consultar oportunidades, agenda, catálogo, fornecedores e histórico operacional antes de concluir.</p>
            <div className="mt-5 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => send(suggestion)} className="rounded-lg border border-slate-200 p-3 text-left text-xs font-semibold text-slate-600 hover:border-blue-300 hover:bg-blue-50">{suggestion}</button>)}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "bg-blue-950 text-white" : "bg-slate-50 text-slate-800"}`}>{message.content}</div>
              </div>
            ))}
            {chat.isPending && <div className="flex items-center gap-2 px-2 py-3 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Consultando o sistema…</div>}
            {chat.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{chat.error.message}</div>}
          </div>
        )}
      </section>

      <form onSubmit={(event) => { event.preventDefault(); send(); }} className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="Pergunte sobre uma oportunidade, prazo, preço, fornecedor, risco ou próxima ação…" className="min-h-12 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm outline-none" />
        <button type="submit" disabled={chat.isPending || input.trim().length === 0} className="self-end rounded-lg bg-blue-950 p-3 text-white disabled:opacity-40" aria-label="Enviar"><Send size={17} /></button>
      </form>
    </div>
  );
}

function Info({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4"><span className="mt-0.5 text-blue-800">{icon}</span><div><div className="text-xs font-black text-slate-900">{title}</div><div className="mt-1 text-xs text-slate-500">{text}</div></div></div>;
}
