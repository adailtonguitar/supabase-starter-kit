import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [isLight, setIsLight] = useState(() => {
    return localStorage.getItem("theme") === "light";
  });

  useEffect(() => {
    if (isLight) {
      document.body.classList.add("light");
      document.body.classList.remove("dark");
    } else {
      document.body.classList.remove("light");
      document.body.classList.add("dark");
    }
    localStorage.setItem("theme", isLight ? "light" : "dark");
  }, [isLight]);

  const label = isLight ? "Ativar modo escuro" : "Ativar modo claro";
  return (
    <button
      onClick={() => setIsLight((v) => !v)}
      className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={label}
      aria-pressed={isLight}
      title={label}
    >
      {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  );
}
