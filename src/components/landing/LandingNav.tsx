import { Link } from "react-router-dom";

export function LandingNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <span className="text-xl font-bold text-primary">Antho System</span>
        <Link to="/auth" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Entrar</Link>
      </div>
    </nav>
  );
}
