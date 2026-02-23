import { Link } from "react-router-dom";

export function LandingCTA() {
  return (
    <section className="py-20 px-4 brand-gradient">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-primary-foreground mb-6">Pronto para começar?</h2>
        <Link to="/auth" className="inline-block px-8 py-3 bg-background text-foreground rounded-lg font-semibold">
          Criar Conta Grátis
        </Link>
      </div>
    </section>
  );
}
