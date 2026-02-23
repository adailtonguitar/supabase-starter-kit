import { Link } from "react-router-dom";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid sm:grid-cols-3 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-black text-xs">A</span>
              </div>
              <span className="font-extrabold text-sm">
                <span className="text-primary">Antho</span>System
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sistema completo para supermercados com PDV, emissão fiscal, estoque e gestão financeira.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-bold mb-3">Produto</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <a href="#recursos" className="hover:text-foreground transition-colors">Recursos</a>
              <a href="#planos" className="hover:text-foreground transition-colors">Planos</a>
              <Link to="/install" className="hover:text-foreground transition-colors">Instalar App</Link>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-bold mb-3">Legal</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <Link to="/termos" className="hover:text-foreground transition-colors">Termos de Uso</Link>
              <Link to="/privacidade" className="hover:text-foreground transition-colors">Privacidade</Link>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} AnthoSystem. Todos os direitos reservados.
          </span>
          <span className="text-xs text-muted-foreground">
            Desenvolvido por <span className="font-semibold text-foreground">Adailton Paulo</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
