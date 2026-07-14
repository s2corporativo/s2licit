import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { getRoleLabel, hasMinimumRole, normalizeRole, type Role } from "@/lib/access";
import { Lock, LogIn, ShieldAlert } from "lucide-react";

interface RequireAuthProps {
  children: React.ReactNode;
  message?: string;
  /** Papel mínimo necessário para acessar o conteúdo. Padrão: qualquer usuário autenticado. */
  minRole?: Role;
}

/**
 * Wrapper que exige autenticação (e opcionalmente um papel mínimo) para renderizar o conteúdo.
 * Exibe um painel de bloqueio amigável se o usuário não estiver logado ou não tiver permissão.
 */
export default function RequireAuth({ children, message, minRole }: RequireAuthProps) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-1 bg-blue-800 animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
        <div className="w-14 h-14 bg-gray-100 flex items-center justify-center">
          <Lock size={24} className="text-gray-400" />
        </div>
        <div className="text-center max-w-sm">
          <h2 className="text-base font-bold text-gray-900 mb-2">
            Acesso restrito
          </h2>
          <p className="text-sm text-gray-500">
            {message ?? "Esta área requer autenticação. Faça login para continuar."}
          </p>
        </div>
        <a
          href={getLoginUrl()}
          className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 text-sm font-semibold hover:bg-blue-800 transition-colors"
        >
          <LogIn size={14} />
          Entrar
        </a>
      </div>
    );
  }

  // Verificação de papel mínimo
  if (minRole) {
    const userRole = normalizeRole(user?.role);

    if (!hasMinimumRole(userRole, minRole)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
          <div className="w-14 h-14 bg-amber-50 flex items-center justify-center">
            <ShieldAlert size={24} className="text-amber-500" />
          </div>
          <div className="text-center max-w-sm">
            <h2 className="text-base font-bold text-gray-900 mb-2">
              Permissão insuficiente
            </h2>
            <p className="text-sm text-gray-500">
              Esta área requer o perfil <strong>{getRoleLabel(minRole)}</strong> ou superior.
              Seu perfil atual é <strong>{getRoleLabel(userRole)}</strong>.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Entre em contato com o administrador do sistema para solicitar acesso.
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}

/** Hook utilitário para verificar permissões no frontend */
export function usePermission(minRole: Role): boolean {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return false;
  return hasMinimumRole(user?.role, minRole);
}
