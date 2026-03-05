import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import logoAs from "@/assets/logo-as.png";

const links = [
  { label: "Recursos", href: "#recursos" },
  { label: "Vantagens", href: "#vantagens" },
  { label: "Planos", href: "#planos" },
  { label: "Emissor NF-e", href: "/emissor", isRoute: true },
  { label: "FAQ", href: "#faq" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-2xl bg-background/70 border-b border-border/50">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
        <Link to="/" className="flex items-center gap-2">
          <img src={logoAs} alt="AnthoSystem" className="w-8 h-8 rounded-lg object-contain" />
          <span className="font-display text-lg font-extrabold tracking-tight">
            <span className="gradient-text">Antho</span>
            <span className="text-foreground">System</span>
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((l) =>
            (l as any).isRoute ? (
              <Link
                key={l.href}
                to={l.href}
                className="px-4 py-2 text-sm font-medium text-cyan-600 hover:text-cyan-500 rounded-lg hover:bg-accent/50 transition-colors"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.href}
                href={l.href}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent/50 transition-colors"
              >
                {l.label}
              </a>
            )
          )}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="text-sm font-medium">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button asChild size="sm" className="text-sm font-semibold shadow-md">
            <Link to="/auth">Teste grátis</Link>
          </Button>
        </div>

        {/* Mobile toggle */}
        <button onClick={() => setOpen(!open)} className="md:hidden p-2 text-muted-foreground">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="md:hidden overflow-hidden border-t border-border/50 bg-background/95 backdrop-blur-xl"
          >
            <div className="px-6 py-4 space-y-1">
              {links.map((l) =>
                (l as any).isRoute ? (
                  <Link
                    key={l.href}
                    to={l.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-sm font-medium text-cyan-600 hover:text-cyan-500 rounded-lg hover:bg-accent/50"
                  >
                    {l.label}
                  </Link>
                ) : (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent/50"
                  >
                    {l.label}
                  </a>
                )
              )}
              <div className="pt-3 flex flex-col gap-2">
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/auth">Entrar</Link>
                </Button>
                <Button asChild size="sm" className="w-full">
                  <Link to="/auth">Teste grátis</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
