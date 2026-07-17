import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { LogIn, Loader2 } from "lucide-react";

/**
 * Página de login local (e-mail e senha).
 * O primeiro administrador é criado no boot do servidor via
 * ADMIN_EMAIL/ADMIN_PASSWORD; os demais usuários são cadastrados
 * pela tela de gestão de usuários.
 */
export default function Login() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password, token: token || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.mfaRequired) {
          setMfaRequired(true);
          setError(token ? (data.error ?? "Código inválido.") : null);
          return;
        }
        setError(data.error ?? "Falha no login. Tente novamente.");
        return;
      }
      await utils.auth.me.invalidate();
      navigate("/");
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#f3f4f6" }}>
      <div
        className="w-full"
        style={{ background: "#fff", borderRadius: 14, padding: 32, maxWidth: 400, boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}
      >
        <div className="flex flex-col items-center" style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>💠</div>
          <h1 style={{ color: "#1A3F8F", fontSize: 22, fontWeight: 900 }}>S2 LICIT</h1>
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>Sistema Integrado de Licitações</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm focus:outline-none" style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8 }}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm focus:outline-none" style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8 }}
            />
          </div>

          {mfaRequired && (
            <div>
              <label htmlFor="token" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                Código de verificação (MFA)
              </label>
              <input
                id="token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                autoFocus
                required
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full text-sm tracking-widest focus:outline-none" style={{ padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8 }}
              />
              <p className="text-xs text-gray-500 mt-1">Informe o código do seu app autenticador.</p>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold transition-colors disabled:opacity-60 hover:opacity-90" style={{ background: "#1A3F8F", padding: "11px 16px", borderRadius: 8 }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            {loading ? "Entrando..." : mfaRequired ? "Verificar e entrar" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
