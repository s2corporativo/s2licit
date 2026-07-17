import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, ShieldAlert, Loader2, Copy, Check } from "lucide-react";

/**
 * Configuração de MFA (TOTP) do próprio usuário (§16).
 * Fluxo: Ativar → mostra a chave/URI para o app autenticador → confirma um
 * código válido para ativar. Desativar exige um código válido.
 */
export default function SegurancaMFA() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.mfa.status.useQuery();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const setupMutation = trpc.mfa.setup.useMutation({
    onSuccess: (d) => { setSetup(d); setError(null); },
    onError: (e) => setError(e.message),
  });
  const enableMutation = trpc.mfa.enable.useMutation({
    onSuccess: async () => {
      setSetup(null); setCode(""); setError(null);
      await utils.mfa.status.invalidate();
      await utils.auth.me.invalidate();
    },
    onError: (e) => setError(e.message),
  });
  const disableMutation = trpc.mfa.disable.useMutation({
    onSuccess: async () => {
      setCode(""); setError(null);
      await utils.mfa.status.invalidate();
      await utils.auth.me.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  const enabled = !!status?.enabled;
  const busy = setupMutation.isPending || enableMutation.isPending || disableMutation.isPending;

  const copySecret = async () => {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* área de transferência indisponível */ }
  };

  const formattedSecret = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-11 h-11 flex items-center justify-center ${enabled ? "bg-green-700" : "bg-gray-900"}`}>
          {enabled ? <ShieldCheck size={20} className="text-white" /> : <ShieldAlert size={20} className="text-white" />}
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Autenticação em duas etapas (MFA)</h1>
          <p className="text-sm text-gray-500">
            Um código temporário do seu app autenticador, além da senha.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Carregando…</div>
      ) : (
        <div className="bg-white border border-gray-200 p-5 space-y-4">
          <div className={`text-sm font-semibold ${enabled ? "text-green-700" : "text-gray-600"}`}>
            Status: {enabled ? "Ativado" : "Desativado"}
          </div>

          {/* Desativado e sem setup em andamento → botão ativar */}
          {!enabled && !setup && (
            <button
              onClick={() => setupMutation.mutate()}
              disabled={busy}
              className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Ativar MFA
            </button>
          )}

          {/* Setup em andamento → mostrar chave e confirmar código */}
          {!enabled && setup && (
            <div className="space-y-3">
              <ol className="text-sm text-gray-700 list-decimal list-inside space-y-1">
                <li>Abra seu app autenticador (Google Authenticator, Authy…).</li>
                <li>Adicione uma conta com a chave abaixo (ou pelo endereço otpauth).</li>
                <li>Digite o código de 6 dígitos gerado para confirmar.</li>
              </ol>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Chave (setup key)</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 border border-gray-200 px-3 py-2 text-sm tracking-wider break-all">
                    {formattedSecret(setup.secret)}
                  </code>
                  <button onClick={copySecret} className="border border-gray-300 p-2 hover:border-gray-900" title="Copiar chave">
                    {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer">Endereço otpauth (avançado)</summary>
                <code className="block mt-1 bg-gray-50 border border-gray-200 px-2 py-1 break-all">{setup.otpauthUri}</code>
              </details>

              <div>
                <label htmlFor="mfa-code" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Código de confirmação
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="mfa-code"
                    inputMode="numeric"
                    maxLength={8}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-40 border border-gray-300 px-3 py-2 text-sm tracking-widest focus:outline-none focus:border-gray-900"
                  />
                  <button
                    onClick={() => enableMutation.mutate({ token: code })}
                    disabled={busy || code.length < 6}
                    className="bg-green-700 text-white px-4 py-2 text-sm font-semibold hover:bg-green-800 disabled:opacity-60"
                  >
                    Confirmar e ativar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Ativado → desativar com código */}
          {enabled && (
            <div className="space-y-2">
              <label htmlFor="mfa-off" className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                Para desativar, informe um código atual
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="mfa-off"
                  inputMode="numeric"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-40 border border-gray-300 px-3 py-2 text-sm tracking-widest focus:outline-none focus:border-gray-900"
                />
                <button
                  onClick={() => disableMutation.mutate({ token: code })}
                  disabled={busy || code.length < 6}
                  className="border border-red-300 text-red-700 px-4 py-2 text-sm font-semibold hover:bg-red-50 disabled:opacity-60"
                >
                  Desativar MFA
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2" role="alert">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
