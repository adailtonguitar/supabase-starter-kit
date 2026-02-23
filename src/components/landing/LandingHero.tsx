import { Link } from "react-router-dom";

export function LandingHero() {
  return (
    <section className="pt-32 pb-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl sm:text-6xl font-bold text-foreground mb-6">
          Gestão completa para seu <span className="text-primary">negócio</span>
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          PDV, fiscal, estoque, financeiro e muito mais. Tudo em um único sistema.
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/auth" className="px-8 py-3 brand-gradient text-primary-foreground rounded-lg font-semibold">
            Começar Grátis
          </Link>
        </div>
      </div>
    </section>
  );
}
