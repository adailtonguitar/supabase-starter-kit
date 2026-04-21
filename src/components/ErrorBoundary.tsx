import { Component, ErrorInfo, ReactNode } from "react";
import { trackError } from "@/services/ErrorTracker";

interface Props { children: ReactNode; }
interface State {
  hasError: boolean;
  supportCode: string | null;
  errorMessage: string | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, supportCode: null, errorMessage: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error.message, error.stack);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
    void trackError({ action: "ErrorBoundary", error }).then((res) => {
      if (res.supportCode) {
        this.setState({ supportCode: res.supportCode });
      }
    });
  }

  private handleCopy = () => {
    const { supportCode, errorMessage } = this.state;
    if (!supportCode) return;
    const text = `Código: ${supportCode}\nMensagem: ${errorMessage ?? "—"}\nURL: ${window.location.href}`;
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    }).catch(() => { /* ignore */ });
  };

  render() {
    if (this.state.hasError) {
      const { supportCode, errorMessage, copied } = this.state;
      return (
        <div className="flex items-center justify-center min-h-screen bg-background p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-2xl font-bold text-foreground">Algo deu errado</h1>
            <p className="text-sm text-muted-foreground">
              Ocorreu um erro inesperado. Você pode recarregar a página ou copiar o código abaixo e enviar ao suporte.
            </p>

            {errorMessage && (
              <div className="text-xs text-left bg-muted rounded-md px-3 py-2 font-mono text-muted-foreground break-all">
                {errorMessage.slice(0, 200)}
              </div>
            )}

            {supportCode ? (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Código de suporte</div>
                <div className="flex items-center justify-center gap-2">
                  <code className="bg-primary/10 text-primary font-mono text-sm px-3 py-1.5 rounded-md border border-primary/20">
                    {supportCode}
                  </code>
                  <button
                    onClick={this.handleCopy}
                    className="text-xs px-2.5 py-1.5 rounded-md border hover:bg-muted"
                  >
                    {copied ? "Copiado!" : "Copiar"}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Envie este código para suporte@anthosystem.com.br para identificarmos o erro rapidamente.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Registrando erro...</p>
            )}

            <div className="flex gap-2 justify-center pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
              >
                Recarregar
              </button>
              <a
                href="/status"
                className="px-4 py-2 border rounded-md text-sm text-foreground hover:bg-muted"
              >
                Ver status do sistema
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
