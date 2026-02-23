export function LandingPricing() {
  return (
    <section id="pricing" className="py-20 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-foreground mb-12">Planos</h2>
        <div className="grid sm:grid-cols-2 gap-8">
          <div className="p-8 rounded-xl border border-border bg-card">
            <h3 className="text-xl font-bold text-foreground mb-2">Essencial</h3>
            <p className="text-3xl font-bold text-primary mb-4">R$ 149,90<span className="text-sm text-muted-foreground">/mês</span></p>
          </div>
          <div className="p-8 rounded-xl border-2 border-primary bg-card glow">
            <h3 className="text-xl font-bold text-foreground mb-2">Profissional</h3>
            <p className="text-3xl font-bold text-primary mb-4">R$ 199,90<span className="text-sm text-muted-foreground">/mês</span></p>
          </div>
        </div>
      </div>
    </section>
  );
}
