import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center max-w-md">
        <h1 className="text-8xl font-black tracking-tighter gradient-text mb-4">404</h1>
        <h2 className="text-2xl font-bold mb-2">Página não encontrada</h2>
        <p className="text-muted-foreground mb-8">
          A página <code className="text-sm bg-muted px-2 py-1 rounded">{location.pathname}</code> não existe ou foi movida.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild size="lg" className="font-semibold">
            <Link to="/"><Home className="w-4 h-4 mr-2" /> Ir para o início</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="#" onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
