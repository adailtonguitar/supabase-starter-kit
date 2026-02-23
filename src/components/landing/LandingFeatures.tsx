export function LandingFeatures() {
  return (
    <section id="features" className="py-20 px-4 bg-card">
      <div className="max-w-6xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-foreground mb-12">Funcionalidades</h2>
        <div className="grid sm:grid-cols-3 gap-8">
          {[
            { title: "PDV Completo", desc: "Ponto de venda rápido e intuitivo" },
            { title: "Gestão Fiscal", desc: "NF-e, NFC-e e controle tributário" },
            { title: "Controle Financeiro", desc: "Contas a pagar e receber integrado" },
          ].map((f) => (
            <div key={f.title} className="p-6 rounded-xl border border-border">
              <h3 className="text-lg font-semibold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
