import { Link } from "react-router-dom";
import logoAs from "@/assets/logo-as.png";

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
  </svg>
);

const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid sm:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src={logoAs} alt="AnthoSystem" className="w-7 h-7 rounded-md object-contain" />
              <span className="font-extrabold text-sm">
                <span className="text-primary">Antho</span>System
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sistema completo para comércios e varejo com PDV, emissão fiscal, estoque e gestão financeira.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-bold mb-3">Produto</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <a href="#recursos" className="hover:text-foreground transition-colors">Recursos</a>
              <a href="#planos" className="hover:text-foreground transition-colors">Planos</a>
              <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
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

          {/* Contact */}
          <div>
            <h4 className="text-sm font-bold mb-3">Contato</h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <span>Suporte via WhatsApp</span>
              <span>contato@anthosystem.com.br</span>
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
