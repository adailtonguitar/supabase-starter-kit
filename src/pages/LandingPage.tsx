const LandingPage = () => (
  <div className="landing-animated min-h-screen bg-background flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-4xl font-bold text-foreground mb-4">Antho System</h1>
      <p className="text-muted-foreground mb-6">Sistema de gestão completo para seu negócio</p>
      <a href="/auth" className="px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium">Entrar</a>
    </div>
  </div>
);
export default LandingPage;
