import { useState } from "react";
import { HelpCircle, Search } from "lucide-react";
import { tutorials } from "@/data/tutorials";
import { TutorialCard } from "@/components/ajuda/TutorialCard";

export default function Ajuda() {
  const [search, setSearch] = useState("");
  const [openSection, setOpenSection] = useState<string | null>(null);

  const filtered = tutorials.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase()) ||
    t.steps.some((s) => s.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HelpCircle className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Central de Ajuda</h1>
          <p className="text-sm text-muted-foreground">Tutoriais e guias de todas as funções do sistema</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar tutorial... (ex: PDV, estoque, fiscal)"
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-card border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {/* Tutorial list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">Nenhum tutorial encontrado para "{search}".</p>
          </div>
        )}

        {filtered.map((section) => (
          <TutorialCard
            key={section.title}
            section={section}
            isOpen={openSection === section.title}
            onToggle={() => setOpenSection(openSection === section.title ? null : section.title)}
          />
        ))}
      </div>
    </div>
  );
}
