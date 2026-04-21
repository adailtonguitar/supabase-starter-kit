import { Link } from "react-router-dom";
import logoAs from "@/assets/logo-as.png";
import { LEGAL_CONFIG } from "@/config/legal";

export function LandingFooter() {
  return (
    <footer className="relative border-t border-border bg-card/50">
      {/* Premium gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="grid sm:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src={logoAs} alt="AnthoSystem" className="w-8 h-8 rounded-lg object-contain" />
              <span className="font-display font-extrabold text-base">
                <span className="gradient-text">Antho</span>System
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sistema completo para comércios e varejo com PDV, emissão fiscal, estoque e gestão financeira.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display text-sm font-bold mb-4">Produto</h4>
            <div className="flex flex-col gap-2.5 text-sm text-muted-foreground">
              <a href="#recursos" className="hover:text-foreground transition-colors">Recursos</a>
              <a href="#planos" className="hover:text-foreground transition-colors">Planos</a>
              <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
              <Link to="/install" className="hover:text-foreground transition-colors">Instalar App</Link>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-display text-sm font-bold mb-4">Legal</h4>
            <div className="flex flex-col gap-2.5 text-sm text-muted-foreground">
              <Link to="/termos" className="hover:text-foreground transition-colors">Termos de Uso</Link>
              <Link to="/privacidade" className="hover:text-foreground transition-colors">Privacidade</Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display text-sm font-bold mb-4">Contato & Suporte</h4>
            <div className="flex flex-col gap-2.5 text-sm text-muted-foreground">
              <Link to="/suporte" className="hover:text-foreground transition-colors font-medium">
                Central de Suporte
              </Link>
              <a
                href={`mailto:${LEGAL_CONFIG.supportEmail}`}
                className="hover:text-foreground transition-colors break-all"
              >
                {LEGAL_CONFIG.supportEmail}
              </a>
              <span className="text-xs">
                {LEGAL_CONFIG.supportHours}
              </span>
            </div>
          </div>
        </div>

        <div className="section-divider mb-6" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <span className="text-xs text-muted-foreground leading-relaxed">
            © {new Date().getFullYear()} {LEGAL_CONFIG.companyLegalName} — CNPJ {LEGAL_CONFIG.companyCNPJ}. Todos os direitos reservados.
          </span>
          <span className="text-xs text-muted-foreground">
            Desenvolvido por <span className="font-semibold text-foreground">AnthoTec</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
