import { trpc } from "@/lib/trpc";
import AvisoIA from "@/components/AvisoIA";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  Bot, Send, User, Loader2, Sparkles, RotateCcw,
  TrendingUp, Package, FileText, DollarSign, Search, BarChart3, Wrench,
} from "lucide-react";

type Role = "user" | "assistant";
interface Msg { role: Role; content: string; ferramentasUsadas?: number; isLoading?: boolean }

const SUGESTOES = [
  { icon: BarChart3,  texto: "Qual o resumo geral do sistema hoje?",                        cor: "bg-blue-50 text-blue-700 border-blue-100" },
  { icon: Package,    texto: "Busca Ivermectina e mostra os menores preços",                cor: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  { icon: TrendingUp, texto: "Qual o resumo financeiro do mês?",                            cor: "bg-violet-50 text-violet-700 border-violet-100" },
  { icon: FileText,   texto: "Tem proposta vencendo nos próximos 7 dias?",                  cor: "bg-amber-50 text-amber-700 border-amber-100" },
  { icon: Search,     texto: "Compare preços de Amoxicilina entre fornecedores",            cor: "bg-rose-50 text-rose-700 border-rose-100" },
  { icon: DollarSign, texto: "Mostre os lançamentos financeiros pendentes",                 cor: "bg-teal-50 text-teal-700 border-teal-100" },
];

function renderContent(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    // Bold
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    line = line.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Code inline
    line = line.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800">$1</code>');
    // Headers
    if (line.startsWith("### ")) return <h3 key={i} className="font-bold text-gray-900 text-sm mt-3 mb-1" dangerouslySetInnerHTML={{ __html: line.slice(4) }} />;
    if (line.startsWith("## ")) return <h2 key={i} className="font-black text-gray-900 mt-4 mb-1" dangerouslySetInnerHTML={{ __html: line.slice(3) }} />;
    // List items
    if (line.startsWith("- ") || line.startsWith("• ")) {
      return <li key={i} className="ml-4 text-sm text-gray-700 list-disc" dangerouslySetInnerHTML={{ __html: line.slice(2) }} />;
    }
    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      return <li key={i} className="ml-4 text-sm text-gray-700 list-decimal" dangerouslySetInnerHTML={{ __html: line.replace(/^\d+\.\s/, "") }} />;
    }
    // Empty line
    if (!line.trim()) return <div key={i} className="h-2" />;
    return <p key={i} className="text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: line }} />;
  });
}

export default function Agente() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chat = trpc.agente.chat.useMutation({
    onSuccess: (data) => {
      setMsgs(prev => {
        const sem = prev.filter(m => !m.isLoading);
        return [...sem, { role: "assistant" as Role, content: String(data.content ?? ""), ferramentasUsadas: data.ferramentasUsadas }];
      });
    },
    onError: (e) => {
      setMsgs(prev => prev.filter(m => !m.isLoading));
      toast.error("O assistente não conseguiu responder agora. Tente novamente em instantes.", {
        description: e.message,
      });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const enviar = (texto?: string) => {
    const content = (texto ?? input).trim();
    if (!content) return;

    const novas: Msg[] = [...msgs, { role: "user", content }, { role: "assistant", content: "", isLoading: true }];
    setMsgs(novas);
    setInput("");

    const history = novas
      .filter(m => !m.isLoading)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));

    chat.mutate({ messages: history });
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const limpar = () => { setMsgs([]); setInput(""); };

  const vazia = msgs.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-3xl mx-auto px-4 py-4">
      <AvisoIA />
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center shadow">
            <Bot size={18} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="font-black text-gray-900 text-base leading-none">Assistente S2</h1>
            <p className="text-[10px] text-gray-400 mt-0.5">Acesso direto ao banco de dados do sistema</p>
          </div>
        </div>
        {!vazia && (
          <button onClick={limpar} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            <RotateCcw size={11} /> Nova conversa
          </button>
        )}
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-2">
        {vazia ? (
          <div className="flex flex-col items-center justify-center h-full text-center pb-8">
            <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <Sparkles size={28} className="text-emerald-400" />
            </div>
            <h2 className="font-black text-gray-900 text-lg mb-1">Como posso ajudar?</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm">
              Tenho acesso ao banco de dados do sistema em tempo real. Pergunte sobre produtos, preços, propostas ou finanças.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {SUGESTOES.map((s) => (
                <button
                  key={s.texto}
                  onClick={() => enviar(s.texto)}
                  className={`flex items-start gap-2 text-left px-3 py-2.5 rounded-xl border text-xs font-medium hover:opacity-80 transition ${s.cor}`}
                >
                  <s.icon size={13} className="flex-shrink-0 mt-0.5" />
                  {s.texto}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              {/* Avatar */}
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                msg.role === "user" ? "bg-gray-900" : "bg-gray-100 border border-gray-200"
              }`}>
                {msg.role === "user"
                  ? <User size={13} className="text-white" />
                  : <Bot size={13} className="text-gray-600" />
                }
              </div>

              {/* Balão */}
              <div className={`max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-gray-900 text-white rounded-tr-sm"
                    : "bg-white border border-gray-200 shadow-sm rounded-tl-sm"
                }`}>
                  {msg.isLoading ? (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 size={13} className="animate-spin text-gray-400" />
                      <span className="text-xs text-gray-400">Consultando dados...</span>
                    </div>
                  ) : msg.role === "user" ? (
                    <p className="text-sm text-white">{msg.content}</p>
                  ) : (
                    <div className="space-y-0.5">{renderContent(msg.content)}</div>
                  )}
                </div>
                {msg.ferramentasUsadas && msg.ferramentasUsadas > 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-gray-400 px-1">
                    <Wrench size={9} /> {msg.ferramentasUsadas} consulta{msg.ferramentasUsadas > 1 ? "s" : ""} ao banco
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
          }}
          placeholder="Pergunte sobre produtos, preços, propostas, finanças..."
          rows={2}
          className="w-full px-4 pt-3 pb-1 text-sm resize-none focus:outline-none text-gray-900 placeholder-gray-400"
          disabled={chat.isPending}
        />
        <div className="flex items-center justify-between px-3 pb-2">
          <p className="text-[10px] text-gray-400">Enter para enviar · Shift+Enter para nova linha</p>
          <button
            onClick={() => enviar()}
            disabled={!input.trim() || chat.isPending}
            className="flex items-center gap-1.5 bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {chat.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
