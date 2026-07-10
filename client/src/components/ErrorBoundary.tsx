import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorId: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: "" };
  }

  static getDerivedStateFromError(_error: Error): State {
    return {
      hasError: true,
      errorId: Math.random().toString(36).slice(2, 8).toUpperCase(),
    };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log silently for debugging without exposing to user
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[60vh] p-8">
          <div className="flex flex-col items-center text-center max-w-sm">
            <div className="w-14 h-14 bg-blue-50 border border-blue-200 flex items-center justify-center mb-5">
              <AlertTriangle size={24} className="text-blue-700" />
            </div>

            <h2 className="text-base font-bold text-gray-900 mb-2">
              Algo deu errado
            </h2>

            <p className="text-sm text-gray-500 mb-1">
              Ocorreu um erro inesperado nesta página. Isso pode ter sido causado
              por uma extensão do navegador (como tradutores automáticos) ou por
              uma instabilidade temporária.
            </p>

            <p className="text-[11px] text-gray-400 mb-6">
              Código: {this.state.errorId}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => this.setState({ hasError: false, errorId: "" })}
                className="flex items-center gap-1.5 border border-gray-900 text-gray-900 text-xs font-bold px-4 py-2 hover:bg-gray-900 hover:text-white transition-colors"
              >
                <RefreshCw size={12} />
                Tentar novamente
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 bg-blue-800 text-white text-xs font-bold px-4 py-2 hover:bg-blue-900 transition-colors"
              >
                Recarregar página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
